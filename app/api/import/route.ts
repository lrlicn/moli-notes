// 数据恢复：导入备份 JSON（按 id 覆盖合并）
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { importData } from "@/lib/db";

export const dynamic = "force-dynamic";

type Unknown = Record<string, unknown>;

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as Unknown | null;
  if (!body || body.app !== "moli-notes" || body.version !== 1) {
    return NextResponse.json({ error: "不支持的备份文件格式" }, { status: 400 });
  }
  const rawFolders = Array.isArray(body.folders) ? (body.folders as Unknown[]) : [];
  const rawEntries = Array.isArray(body.entries) ? (body.entries as Unknown[]) : [];

  const folders = [];
  for (const f of rawFolders) {
    if (typeof f.id !== "string" || typeof f.name !== "string" || !f.name.trim()) {
      return NextResponse.json({ error: "备份数据格式错误（folders）" }, { status: 400 });
    }
    folders.push({
      id: f.id,
      name: f.name,
      parentId: typeof f.parentId === "string" ? f.parentId : null,
      sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : 0,
      createdAt: typeof f.createdAt === "string" ? f.createdAt : null,
    });
  }

  const entries = [];
  for (const e of rawEntries) {
    if (
      typeof e.id !== "string" ||
      typeof e.title !== "string" ||
      typeof e.content !== "string"
    ) {
      return NextResponse.json({ error: "备份数据格式错误（entries）" }, { status: 400 });
    }
    entries.push({
      id: e.id,
      folderId: typeof e.folderId === "string" ? e.folderId : null,
      title: e.title,
      content: e.content,
      notes: typeof e.notes === "string" ? e.notes : "",
      source: typeof e.source === "string" ? e.source : "",
      sourceColor: typeof e.sourceColor === "string" ? e.sourceColor : "",
      pinned: !!e.pinned,
      lastUsedAt: typeof e.lastUsedAt === "string" ? e.lastUsedAt : null,
      deletedAt: typeof e.deletedAt === "string" ? e.deletedAt : null,
      createdAt: typeof e.createdAt === "string" ? e.createdAt : null,
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : null,
    });
  }

  const imported = importData(folders, entries);
  return NextResponse.json({ imported, folders: folders.length });
}
