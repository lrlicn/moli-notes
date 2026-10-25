// 数据层：Neon Postgres（postgres.js 驱动，serverless 友好）
// 懒加载：模块导入时不建连接，首次使用时初始化并建表（Vercel 平台由 Neon 集成注入 POSTGRES_URL）
import postgres from "postgres";
import type { Entry, Folder } from "./types";
import { detectKind } from "./detect";

declare global {
  var __moliSql: postgres.Sql | undefined;
}

const CONNECTION_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";

function getSql(): postgres.Sql {
  if (globalThis.__moliSql) return globalThis.__moliSql;
  if (!CONNECTION_URL) throw new Error("数据库未配置：缺少 POSTGRES_URL 环境变量");
  // prepare: false —— Neon 池化连接（PgBouncer 事务模式）必需；max: 1 —— 单用户工具，每实例单连接
  const sql = postgres(CONNECTION_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalThis.__moliSql = sql;
  return sql;
}

let schemaReady: Promise<void> | null = null;

/** 建表（幂等）+ 列/索引迁移 + kind 回填：每次实例冷启动执行一次；并发冷启动撞表时忽略 already exists */
function ensureSchema(sql: postgres.Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY,
            folder_id TEXT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT '',
            source_color TEXT NOT NULL DEFAULT '',
            kind TEXT,
            pinned BOOLEAN NOT NULL DEFAULT false,
            last_used_at TIMESTAMPTZ,
            deleted_at TIMESTAMPTZ,
            copy_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `;
        // 旧库补列（新库 CREATE 已含）：kind 为内容启发式识别结果，存列后筛选可下推 SQL 并支持分页
        await sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS kind TEXT`;
        // 列表/回收站常用过滤路径的部分索引
        await sql`CREATE INDEX IF NOT EXISTS entries_active_folder_idx ON entries (folder_id) WHERE deleted_at IS NULL`;
        await sql`CREATE INDEX IF NOT EXISTS entries_active_kind_idx ON entries (kind) WHERE deleted_at IS NULL`;
        await sql`CREATE INDEX IF NOT EXISTS entries_deleted_idx ON entries (deleted_at) WHERE deleted_at IS NOT NULL`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists/i.test(msg)) {
          schemaReady = null; // 失败不缓存，下次重试
          throw err;
        }
      }
      // 搜索模糊索引（pg_trgm）：Neon 可能无权建扩展，失败不影响主流程
      try {
        await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
        await sql`CREATE INDEX IF NOT EXISTS entries_title_trgm_idx ON entries USING gin (title gin_trgm_ops)`;
        await sql`CREATE INDEX IF NOT EXISTS entries_content_trgm_idx ON entries USING gin (content gin_trgm_ops)`;
      } catch {
        /* 无扩展权限时回退到原来的 ILIKE 全扫 */
      }
      // kind 回填（幂等）：仅处理未写入 kind 的历史行，单用户量小逐行计算
      try {
        const missing = (await sql`SELECT id, content FROM entries WHERE kind IS NULL`) as unknown as {
          id: string;
          content: string;
        }[];
        for (const r of missing) {
          await sql`UPDATE entries SET kind = ${detectKind(r.content)} WHERE id = ${r.id}`;
        }
      } catch {
        /* 回填失败不阻断启动；下次冷启动重试 */
      }
    })();
  }
  return schemaReady;
}

async function getDb(): Promise<postgres.Sql> {
  const sql = getSql();
  await ensureSchema(sql);
  return sql;
}

// ---------- 行映射（timestamptz 返回 Date，统一转 ISO 字符串） ----------

type Row = Record<string, unknown>;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : (v as string));
const isoOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : (v as string);

const folderRowMapper = (r: Row): Folder => ({
  id: r.id as string,
  name: r.name as string,
  parentId: (r.parent_id as string | null) ?? null,
  sortOrder: r.sort_order as number,
  createdAt: iso(r.created_at),
});

const entryRowMapper = (r: Row): Entry => ({
  id: r.id as string,
  folderId: (r.folder_id as string | null) ?? null,
  folderName: (r.folder_name as string | null) ?? null,
  title: r.title as string,
  content: r.content as string,
  notes: (r.notes as string) ?? "",
  source: (r.source as string) ?? "",
  sourceColor: (r.source_color as string) ?? "",
  pinned: !!r.pinned,
  lastUsedAt: isoOrNull(r.last_used_at),
  copyCount: ((r.copy_count as number | null) ?? 0) > 0 ? (r.copy_count as number) : 0,
  deletedAt: isoOrNull(r.deleted_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

// ---------- 文件夹 ----------

export async function listFolders(): Promise<Folder[]> {
  const sql = await getDb();
  const rows = await sql`SELECT * FROM folders ORDER BY sort_order, created_at`;
  return rows.map((r) => folderRowMapper(r));
}

/** 各文件夹直接条目数 + 汇总计数（侧边栏徽标与身份卡用；只统计未删除条目） */
export async function entryCountsByFolder(): Promise<{
  byFolder: Record<string, number>;
  unsorted: number;
  total: number;
  trash: number;
  /** 累计复制次数（含已删除条目，体现使用量） */
  totalCopies: number;
}> {
  const sql = await getDb();
  const rows = (await sql`
    SELECT folder_id, COUNT(*)::int AS c
    FROM entries
    WHERE deleted_at IS NULL AND folder_id IS NOT NULL
    GROUP BY folder_id
  `) as { folder_id: string; c: number }[];
  const byFolder: Record<string, number> = {};
  for (const r of rows) byFolder[r.folder_id] = r.c;
  const row = (await sql`
    SELECT
      SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END)::int AS total,
      SUM(CASE WHEN deleted_at IS NULL AND folder_id IS NULL THEN 1 ELSE 0 END)::int AS unsorted,
      SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END)::int AS trash,
      COALESCE(SUM(copy_count), 0)::int AS total_copies
    FROM entries
  `)[0] as { total: number | null; unsorted: number | null; trash: number | null; total_copies: number | null };
  return {
    byFolder,
    unsorted: row.unsorted || 0,
    total: row.total || 0,
    trash: row.trash || 0,
    totalCopies: row.total_copies || 0,
  };
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const sql = await getDb();
  const r = await sql`SELECT * FROM folders WHERE id = ${id}`;
  return r[0] ? folderRowMapper(r[0]) : undefined;
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const sql = await getDb();
  const id = crypto.randomUUID();
  const max = (await sql`
    SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM folders WHERE parent_id IS NOT DISTINCT FROM ${parentId}
  `)[0] as { m: number };
  await sql`INSERT INTO folders (id, name, parent_id, sort_order) VALUES (${id}, ${name}, ${parentId}, ${max.m + 1})`;
  return (await getFolder(id))!;
}

export async function renameFolder(id: string, name: string) {
  const sql = await getDb();
  await sql`UPDATE folders SET name = ${name} WHERE id = ${id}`;
}

export async function moveFolder(id: string, parentId: string | null) {
  const sql = await getDb();
  await sql`UPDATE folders SET parent_id = ${parentId} WHERE id = ${id}`;
}

/** 批量更新文件夹顺序/归属（拖拽排序事务：同级重排 + 跨层级插入一次完成） */
export async function reorderFolders(items: { id: string; parentId: string | null; sortOrder: number }[]) {
  const sql = await getDb();
  await sql.begin(async (tx) => {
    for (const it of items) {
      await tx`UPDATE folders SET parent_id = ${it.parentId}, sort_order = ${it.sortOrder} WHERE id = ${it.id}`;
    }
  });
}

export async function deleteFolderIfEmpty(id: string): Promise<boolean> {
  const sql = await getDb();
  const child = await sql`SELECT 1 FROM folders WHERE parent_id = ${id} LIMIT 1`;
  if (child.length) return false;
  const entry = await sql`SELECT 1 FROM entries WHERE folder_id = ${id} LIMIT 1`;
  if (entry.length) return false;
  await sql`DELETE FROM folders WHERE id = ${id}`;
  return true;
}

// ---------- 条目 ----------

const ENTRY_SELECT = `
  SELECT e.*, f.name AS folder_name
  FROM entries e
  LEFT JOIN folders f ON f.id = e.folder_id
`;

// 列表排序（均置顶优先，再按所选维度）：recent=最近使用 · name=名称 · copies=复制次数
const LIST_ORDERS: Record<string, string> = {
  recent: `e.pinned DESC, COALESCE(e.last_used_at, e.updated_at) DESC, e.created_at DESC`,
  name: `e.pinned DESC, e.title ASC, e.created_at DESC`,
  copies: `e.pinned DESC, COALESCE(e.copy_count, 0) DESC, COALESCE(e.last_used_at, e.updated_at) DESC, e.created_at DESC`,
};

export async function listEntries(opts: {
  folderId?: string | null;
  q?: string;
  source?: string;
  kind?: string;
  /** 回收站视图：只看已软删条目（默认排除已删） */
  deleted?: boolean;
  limit?: number;
  offset?: number;
  /** 排序维度：recent（默认）/ name / copies；均置顶优先 */
  sort?: string;
  /** 附带一次同条件 COUNT，返回符合作域总数（顶部计数用；分页态不偏差） */
  withTotal?: boolean;
}): Promise<{ entries: Entry[]; hasMore: boolean; total?: number }> {
  const sql = await getDb();
  const where: string[] = [opts.deleted ? "e.deleted_at IS NOT NULL" : "e.deleted_at IS NULL"];
  const params: (string | null | number)[] = [];
  if (opts.folderId !== undefined) {
    where.push(`e.folder_id IS NOT DISTINCT FROM $${params.length + 1}`);
    params.push(opts.folderId);
  }
  if (opts.source) {
    where.push(`e.source = $${params.length + 1}`);
    params.push(opts.source);
  }
  if (opts.kind) {
    where.push(`e.kind = $${params.length + 1}`);
    params.push(opts.kind);
  }
  if (opts.q) {
    const p1 = params.length + 1;
    const p2 = params.length + 2;
    const p3 = params.length + 3;
    const p4 = params.length + 4;
    where.push(`(e.title ILIKE $${p1} OR e.content ILIKE $${p2} OR e.notes ILIKE $${p3} OR e.source ILIKE $${p4})`);
    const like = `%${opts.q}%`;
    params.push(like, like, like, like);
  }
  // 总数：与分页同 WHERE（不含 LIMIT/OFFSET），仅在首页请求时额外跑一次
  let total: number | undefined;
  if (opts.withTotal) {
    const whereSql = where.join(" AND ");
    const cnt = (await sql.unsafe<{ c: number }[]>(`SELECT COUNT(*)::int AS c FROM entries e WHERE ${whereSql}`, [
      ...params,
    ]))[0] as { c: number } | undefined;
    total = cnt?.c ?? 0;
  }
  // 分页：limit 默认 60；多取 1 条判断是否还有下一页（避免额外 COUNT 查询）
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  // 白名单取排序（opts.sort 为外部入参，仅用作键索引，绝不直接拼接）；用 hasOwn 只认自有键，
  // 避免 ?sort=constructor/toString/__proto__ 命中原型成员拼出非法 SQL（500）；非法值回退 recent
  const sortKey = opts.sort && Object.hasOwn(LIST_ORDERS, opts.sort) ? opts.sort : "recent";
  const order = opts.deleted
    ? "ORDER BY e.deleted_at DESC"
    : `ORDER BY ${LIST_ORDERS[sortKey]}`;
  const query = `${ENTRY_SELECT} WHERE ${where.join(" AND ")} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit + 1, offset);
  const rows = await sql.unsafe<Row[]>(query, params);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { entries: page.map(entryRowMapper), hasMore, total };
}

/** 备份导出专用：不分页、含回收站，一次返回全量（单用户量级可控） */
export async function listAllEntriesForBackup(): Promise<Entry[]> {
  const sql = await getDb();
  const rows = await sql.unsafe<Row[]>(`${ENTRY_SELECT} ORDER BY e.created_at`);
  return rows.map(entryRowMapper);
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const sql = await getDb();
  const r = await sql.unsafe<Row[]>(`${ENTRY_SELECT} WHERE e.id = $1 AND e.deleted_at IS NULL`, [id]);
  return r[0] ? entryRowMapper(r[0]) : undefined;
}

/** 软删除：移入最近删除（deleted_at 置当前时间），可恢复 */
export async function softDeleteEntry(id: string): Promise<boolean> {
  const sql = await getDb();
  const r = await sql`UPDATE entries SET deleted_at = now() WHERE id = ${id} AND deleted_at IS NULL`;
  return r.count > 0;
}

/** 从最近删除恢复 */
export async function restoreEntry(id: string): Promise<Entry | undefined> {
  const sql = await getDb();
  await sql`UPDATE entries SET deleted_at = NULL WHERE id = ${id} AND deleted_at IS NOT NULL`;
  return getEntry(id);
}

/** 彻底删除（不可恢复） */
export async function purgeEntry(id: string): Promise<boolean> {
  const sql = await getDb();
  const r = await sql`DELETE FROM entries WHERE id = ${id} AND deleted_at IS NOT NULL`;
  return r.count > 0;
}

export async function createEntry(data: {
  folderId: string | null;
  title: string;
  content: string;
  notes: string;
  source?: string;
  sourceColor?: string;
  pinned?: boolean;
}): Promise<Entry> {
  const sql = await getDb();
  const id = crypto.randomUUID();
  const kind = detectKind(data.content);
  await sql`
    INSERT INTO entries (id, folder_id, title, content, notes, source, source_color, kind, pinned)
    VALUES (${id}, ${data.folderId}, ${data.title}, ${data.content}, ${data.notes}, ${data.source ?? ""}, ${data.sourceColor ?? ""}, ${kind}, ${data.pinned ? true : false})
  `;
  return (await getEntry(id))!;
}

export async function updateEntry(
  id: string,
  data: Partial<{
    folderId: string | null;
    title: string;
    content: string;
    notes: string;
    source: string;
    sourceColor: string;
    pinned: boolean;
  }>
): Promise<Entry | undefined> {
  const sql = await getDb();
  const cur = await sql`SELECT * FROM entries WHERE id = ${id}`;
  if (!cur[0]) return undefined;
  const c = cur[0];
  // 内容变化时同步重算 kind（与创建一致，保证类型筛选准确）
  const nextContent = data.content !== undefined ? data.content : (c.content as string);
  const nextKind = data.content !== undefined ? detectKind(data.content) : (c.kind as string | null);
  await sql`
    UPDATE entries SET
      folder_id = ${data.folderId !== undefined ? data.folderId : (c.folder_id as string | null)},
      title = ${data.title !== undefined ? data.title : (c.title as string)},
      content = ${nextContent},
      notes = ${data.notes !== undefined ? data.notes : (c.notes as string)},
      source = ${data.source !== undefined ? data.source : (c.source as string)},
      source_color = ${data.sourceColor !== undefined ? data.sourceColor : (c.source_color as string)},
      kind = ${nextKind},
      pinned = ${data.pinned !== undefined ? data.pinned : !!c.pinned},
      updated_at = now()
    WHERE id = ${id}
  `;
  return getEntry(id);
}

export async function touchEntry(id: string) {
  // 复制上报：刷新使用时间 + 累计复制次数
  // 去重窗口：10 秒内重复复制（连点/重试/分次粘贴）只算一次使用意图，不重复计数
  const sql = await getDb();
  await sql`
    UPDATE entries
       SET last_used_at = now(),
           copy_count = COALESCE(copy_count, 0) + 1
     WHERE id = ${id}
       AND (last_used_at IS NULL OR last_used_at < now() - interval '10 seconds')
  `;
}

// ---------- 备份导入 ----------

type FolderIn = { id: string; name: string; parentId: string | null; sortOrder: number; createdAt: string | null };
type EntryIn = {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  notes: string;
  source: string;
  sourceColor?: string;
  pinned: boolean;
  lastUsedAt: string | null;
  copyCount?: number;
  deletedAt?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** 导入备份（事务）：按 id 覆盖合并，返回导入的条目数。folderId 无效时置空保持一致性 */
export async function importData(folders: FolderIn[], entries: EntryIn[]): Promise<number> {
  const sql = await getDb();
  await sql.begin(async (tx) => {
    const ids = new Set(
      (await tx`SELECT id FROM folders`).map((r) => r.id as string)
    );
    for (const f of folders) {
      await tx`
        INSERT INTO folders (id, name, parent_id, sort_order, created_at)
        VALUES (${f.id}, ${f.name}, ${f.parentId}, ${f.sortOrder}, ${f.createdAt})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          parent_id = EXCLUDED.parent_id,
          sort_order = EXCLUDED.sort_order,
          created_at = COALESCE(EXCLUDED.created_at, folders.created_at)
      `;
      ids.add(f.id);
    }
    for (const e of entries) {
      const folderId = e.folderId && ids.has(e.folderId) ? e.folderId : null;
      const kind = detectKind(e.content);
      await tx`
        INSERT INTO entries
          (id, folder_id, title, content, notes, source, source_color, kind, pinned, last_used_at, copy_count, deleted_at, created_at, updated_at)
        VALUES (${e.id}, ${folderId}, ${e.title}, ${e.content}, ${e.notes}, ${e.source}, ${e.sourceColor ?? ""}, ${kind}, ${e.pinned}, ${e.lastUsedAt}, ${e.copyCount ?? 0}, ${e.deletedAt ?? null}, ${e.createdAt}, ${e.updatedAt})
        ON CONFLICT (id) DO UPDATE SET
          folder_id = EXCLUDED.folder_id,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          notes = EXCLUDED.notes,
          source = EXCLUDED.source,
          source_color = EXCLUDED.source_color,
          kind = EXCLUDED.kind,
          pinned = EXCLUDED.pinned,
          last_used_at = EXCLUDED.last_used_at,
          copy_count = EXCLUDED.copy_count,
          deleted_at = EXCLUDED.deleted_at,
          created_at = COALESCE(EXCLUDED.created_at, entries.created_at),
          updated_at = COALESCE(EXCLUDED.updated_at, entries.updated_at)
      `;
    }
  });
  return entries.length;
}
