// 数据层：SQLite（better-sqlite3），本地文件 data/moli-notes.db
// 数据库懒加载：模块导入时不打开数据库（避免构建期多 worker 并发锁冲突），首次使用时初始化
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Entry, Folder } from "./types";
import { detectKind } from "./detect";

// 数据目录：生产环境通过 MOLINOTES_DATA_DIR 指向持久卷挂载点，默认本地 ./data
const DATA_DIR = process.env.MOLINOTES_DATA_DIR
  ? path.resolve(process.env.MOLINOTES_DATA_DIR)
  : path.join(process.cwd(), "data");

declare global {
  var __moliDb: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (globalThis.__moliDb) return globalThis.__moliDb;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new Database(path.join(DATA_DIR, "moli-notes.db"));
  d.pragma("journal_mode = WAL");
  d.pragma("busy_timeout = 3000");
  d.pragma("foreign_keys = ON");
  d.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      folder_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      source_color TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  // 旧库迁移：entries 表缺 source / source_color / deleted_at 列时补齐
  const cols = d.prepare("PRAGMA table_info(entries)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "source")) {
    d.exec("ALTER TABLE entries ADD COLUMN source TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((c) => c.name === "source_color")) {
    d.exec("ALTER TABLE entries ADD COLUMN source_color TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((c) => c.name === "deleted_at")) {
    d.exec("ALTER TABLE entries ADD COLUMN deleted_at TEXT");
  }
  if (!cols.some((c) => c.name === "copy_count")) {
    d.exec("ALTER TABLE entries ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0");
  }
  globalThis.__moliDb = d;
  return d;
}

/** 透明代理：保持 db.prepare(...) 的写法，实际转发到懒加载的连接 */
const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

// ---------- 文件夹 ----------

type Row = Record<string, unknown>;

const folderRowMapper = (r: Row): Folder => ({
  id: r.id as string,
  name: r.name as string,
  parentId: (r.parent_id as string | null) ?? null,
  sortOrder: r.sort_order as number,
  createdAt: r.created_at as string,
});

export function listFolders(): Folder[] {
  return (db.prepare("SELECT * FROM folders ORDER BY sort_order, created_at").all() as Row[]).map(
    folderRowMapper
  );
}

/** 各文件夹直接条目数 + 汇总计数（侧边栏徽标用；只统计未删除条目） */
export function entryCountsByFolder(): {
  byFolder: Record<string, number>;
  unsorted: number;
  total: number;
  trash: number;
} {
  const rows = db
    .prepare(
      "SELECT folder_id, COUNT(*) AS c FROM entries WHERE deleted_at IS NULL AND folder_id IS NOT NULL GROUP BY folder_id"
    )
    .all() as { folder_id: string; c: number }[];
  const byFolder: Record<string, number> = {};
  for (const r of rows) byFolder[r.folder_id] = r.c;
  const row = db
    .prepare(
      // 聚合计数必须按软删状态分组：total/unsorted/recent 只统计未删除条目，trash 只统计已删除条目
      "SELECT SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS total, SUM(CASE WHEN deleted_at IS NULL AND folder_id IS NULL THEN 1 ELSE 0 END) AS unsorted, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trash FROM entries"
    )
    .get() as { total: number | null; unsorted: number | null; trash: number | null };
  return {
    byFolder,
    unsorted: row.unsorted || 0,
    total: row.total || 0,
    trash: row.trash || 0,
  };
}

export function getFolder(id: string): Folder | undefined {
  const r = db.prepare("SELECT * FROM folders WHERE id = ?").get(id) as Row | undefined;
  return r ? folderRowMapper(r) : undefined;
}

export function createFolder(name: string, parentId: string | null): Folder {
  const id = crypto.randomUUID();
  const max = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM folders WHERE parent_id IS ?")
    .get(parentId) as { m: number };
  db.prepare("INSERT INTO folders (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    parentId,
    max.m + 1
  );
  return getFolder(id)!;
}

export function renameFolder(id: string, name: string) {
  db.prepare("UPDATE folders SET name = ? WHERE id = ?").run(name, id);
}

export function moveFolder(id: string, parentId: string | null) {
  db.prepare("UPDATE folders SET parent_id = ? WHERE id = ?").run(parentId, id);
}

/** 批量更新文件夹顺序/归属（拖拽排序事务：同级重排 + 跨层级插入一次完成） */
export function reorderFolders(items: { id: string; parentId: string | null; sortOrder: number }[]) {
  const d = getDb();
  const tx = d.transaction(() => {
    const upd = d.prepare("UPDATE folders SET parent_id = ?, sort_order = ? WHERE id = ?");
    for (const it of items) upd.run(it.parentId, it.sortOrder, it.id);
  });
  tx();
}

export function deleteFolderIfEmpty(id: string): boolean {
  const child = db.prepare("SELECT 1 FROM folders WHERE parent_id = ? LIMIT 1").get(id);
  if (child) return false;
  const entry = db.prepare("SELECT 1 FROM entries WHERE folder_id = ? LIMIT 1").get(id);
  if (entry) return false;
  db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  return true;
}

// ---------- 条目 ----------

const ENTRY_SELECT = `
  SELECT e.*, f.name AS folder_name
  FROM entries e
  LEFT JOIN folders f ON f.id = e.folder_id
`;

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
  lastUsedAt: (r.last_used_at as string | null) ?? null,
  copyCount: ((r.copy_count as number | null) ?? 0) > 0 ? (r.copy_count as number) : 0,
  deletedAt: (r.deleted_at as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const LIST_ORDER = `ORDER BY e.pinned DESC, COALESCE(e.last_used_at, e.updated_at) DESC, e.created_at DESC`;

export function listEntries(opts: {
  folderId?: string | null;
  q?: string;
  source?: string;
  kind?: string;
  /** 回收站视图：只看已软删条目（默认排除已删） */
  deleted?: boolean;
}): Entry[] {
  const where: string[] = [opts.deleted ? "e.deleted_at IS NOT NULL" : "e.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (opts.folderId !== undefined) {
    where.push("e.folder_id IS ?");
    params.push(opts.folderId);
  }
  if (opts.source) {
    where.push("e.source = ?");
    params.push(opts.source);
  }
  if (opts.q) {
    where.push("(e.title LIKE ? OR e.content LIKE ? OR e.notes LIKE ? OR e.source LIKE ?)");
    const like = `%${opts.q}%`;
    params.push(like, like, like, like);
  }
  const rows = (
    db
      .prepare(
        `${ENTRY_SELECT} WHERE ${where.join(" AND ")} ${
          opts.deleted ? "ORDER BY e.deleted_at DESC" : LIST_ORDER
        }`
      )
      .all(...params) as Row[]
  ).map(entryRowMapper);
  // 类型是内容启发式识别（非存储列），在查询结果上过滤
  if (opts.kind) return rows.filter((e) => detectKind(e.content) === opts.kind);
  return rows;
}

export function getEntry(id: string): Entry | undefined {
  const r = db.prepare(`${ENTRY_SELECT} WHERE e.id = ? AND e.deleted_at IS NULL`).get(id) as Row | undefined;
  return r ? entryRowMapper(r) : undefined;
}

/** 软删除：移入最近删除（deleted_at 置当前时间），可恢复 */
export function softDeleteEntry(id: string): boolean {
  const r = db
    .prepare("UPDATE entries SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL")
    .run(id);
  return r.changes > 0;
}

/** 从最近删除恢复 */
export function restoreEntry(id: string): Entry | undefined {
  db.prepare("UPDATE entries SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").run(id);
  return getEntry(id);
}

/** 彻底删除（不可恢复） */
export function purgeEntry(id: string): boolean {
  const r = db.prepare("DELETE FROM entries WHERE id = ? AND deleted_at IS NOT NULL").run(id);
  return r.changes > 0;
}

export function createEntry(data: {
  folderId: string | null;
  title: string;
  content: string;
  notes: string;
  source?: string;
  sourceColor?: string;
  pinned?: boolean;
}): Entry {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO entries (id, folder_id, title, content, notes, source, source_color, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, data.folderId, data.title, data.content, data.notes, data.source ?? "", data.sourceColor ?? "", data.pinned ? 1 : 0);
  return getEntry(id)!;
}

export function updateEntry(
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
): Entry | undefined {
  const cur = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as Row | undefined;
  if (!cur) return undefined;
  db.prepare(
    `UPDATE entries SET
      folder_id = ?, title = ?, content = ?, notes = ?, source = ?, source_color = ?, pinned = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`
  ).run(
    data.folderId !== undefined ? data.folderId : (cur.folder_id as string | null),
    data.title !== undefined ? data.title : (cur.title as string),
    data.content !== undefined ? data.content : (cur.content as string),
    data.notes !== undefined ? data.notes : (cur.notes as string),
    data.source !== undefined ? data.source : (cur.source as string),
    data.sourceColor !== undefined ? data.sourceColor : (cur.source_color as string),
    data.pinned !== undefined ? (data.pinned ? 1 : 0) : (cur.pinned as number),
    id
  );
  return getEntry(id);
}

export function touchEntry(id: string) {
  // 复制上报：刷新使用时间 + 累计复制次数
  // 去重窗口：10 秒内重复复制（连点/重试/分次粘贴）只算一次使用意图，不重复计数
  db.prepare(
    `UPDATE entries
       SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           copy_count = COALESCE(copy_count, 0) + 1
       WHERE id = ? AND (last_used_at IS NULL OR last_used_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 seconds'))`
  ).run(id);
}

/** 删除条目 = 软删除（移入最近删除，可恢复）；彻底删除用 purgeEntry */
export function deleteEntry(id: string) {
  softDeleteEntry(id);
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
export function importData(folders: FolderIn[], entries: EntryIn[]): number {
  const d = getDb();
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  const tx = d.transaction(() => {
    const ids = new Set(
      (d.prepare("SELECT id FROM folders").all() as { id: string }[]).map((r) => r.id)
    );
    const insF = d.prepare(
      `INSERT OR REPLACE INTO folders (id, name, parent_id, sort_order, created_at)
       VALUES (?, ?, ?, ?, COALESCE(?, ${now}))`
    );
    for (const f of folders) {
      insF.run(f.id, f.name, f.parentId, f.sortOrder, f.createdAt);
      ids.add(f.id);
    }
    const insE = d.prepare(
      `INSERT OR REPLACE INTO entries
         (id, folder_id, title, content, notes, source, source_color, pinned, last_used_at, copy_count, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, ${now}), COALESCE(?, ${now}))`
    );
    for (const e of entries) {
      const folderId = e.folderId && ids.has(e.folderId) ? e.folderId : null;
      insE.run(e.id, folderId, e.title, e.content, e.notes, e.source, e.sourceColor ?? "", e.pinned ? 1 : 0, e.lastUsedAt, e.copyCount ?? 0, e.deletedAt ?? null, e.createdAt, e.updatedAt);
    }
  });
  tx();
  return entries.length;
}
