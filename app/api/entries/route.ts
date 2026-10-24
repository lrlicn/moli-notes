// 条目：列表（按文件夹 / 关键词搜索）/ 新建
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createEntry, getFolder, listEntries } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || undefined;
  const source = searchParams.get("source")?.trim() || undefined;
  const kind = searchParams.get("kind")?.trim() || undefined;
  const deleted = searchParams.get("deleted") === "1";
  const folderParam = searchParams.get("folderId");

  // folderId 不传 = 全部；空字符串 = 未分类；具体 id = 指定文件夹
  const opts: { folderId?: string | null; q?: string; source?: string; kind?: string; deleted?: boolean } = {};
  if (q) opts.q = q;
  if (source) opts.source = source;
  if (kind) opts.kind = kind;
  if (deleted) opts.deleted = true;
  if (folderParam === "") opts.folderId = null;
  else if (folderParam) opts.folderId = folderParam;

  return NextResponse.json({ entries: await listEntries(opts) });
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const source = typeof body?.source === "string" ? body.source.trim() : "";
  const sourceColor = typeof body?.sourceColor === "string" ? body.sourceColor.trim() : "";
  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "内容不能为空" }, { status: 400 });

  const folderId = typeof body?.folderId === "string" && body.folderId ? body.folderId : null;
  if (folderId && !(await getFolder(folderId))) {
    return NextResponse.json({ error: "所属文件夹不存在" }, { status: 400 });
  }
  return NextResponse.json({ entry: await createEntry({ folderId, title, content, notes, source, sourceColor }) }, { status: 201 });
}
