// 条目：编辑（含置顶、移动文件夹、恢复）/ 删除（默认软删，purge=1 彻底删除）
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getFolder, purgeEntry, restoreEntry, softDeleteEntry, updateEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  // 从最近删除恢复
  if (body.restore === true) {
    const entry = restoreEntry(id);
    if (!entry) return NextResponse.json({ error: "条目不存在或不在回收站中" }, { status: 404 });
    return NextResponse.json({ entry });
  }

  const data: Parameters<typeof updateEntry>[1] = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    data.title = title;
  }
  if (body.content !== undefined) {
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
    data.content = content;
  }
  if (body.notes !== undefined && typeof body.notes === "string") data.notes = body.notes.trim();
  if (body.source !== undefined && typeof body.source === "string") data.source = body.source.trim();
  if (body.sourceColor !== undefined && typeof body.sourceColor === "string") data.sourceColor = body.sourceColor.trim();
  if (body.pinned !== undefined) data.pinned = !!body.pinned;
  if (body.folderId !== undefined) {
    const folderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
    if (folderId && !getFolder(folderId)) {
      return NextResponse.json({ error: "目标文件夹不存在" }, { status: 400 });
    }
    data.folderId = folderId;
  }

  const entry = updateEntry(id, data);
  if (!entry) return NextResponse.json({ error: "条目不存在" }, { status: 404 });
  return NextResponse.json({ entry });
}

// 默认删除 = 软删除（移入最近删除）；?purge=1 = 彻底删除（不可恢复）
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  const purge = new URL(req.url).searchParams.get("purge") === "1";
  if (purge) {
    if (!purgeEntry(id)) return NextResponse.json({ error: "条目不存在或不在回收站中" }, { status: 404 });
  } else {
    softDeleteEntry(id);
  }
  return NextResponse.json({ ok: true });
}
