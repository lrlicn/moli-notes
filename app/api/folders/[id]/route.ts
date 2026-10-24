// 文件夹：重命名 / 移动 / 删除（仅允许删除空文件夹）
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteFolderIfEmpty, getFolder, listFolders, moveFolder, renameFolder } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 判断 targetId 是否为 rootId 的子孙（含自身），防止把文件夹移动到自己内部形成环 */
function isDescendantOrSelf(rootId: string, targetId: string, folders: { id: string; parentId: string | null }[]): boolean {
  if (rootId === targetId) return true;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur = byId.get(targetId) ?? null;
  while (cur?.parentId) {
    if (cur.parentId === rootId) return true;
    cur = byId.get(cur.parentId) ?? null;
  }
  return false;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!(await getFolder(id))) return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "文件夹名称不能为空" }, { status: 400 });
    await renameFolder(id, name);
  }

  if (body.parentId !== undefined) {
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    if (parentId && !(await getFolder(parentId))) {
      return NextResponse.json({ error: "目标文件夹不存在" }, { status: 400 });
    }
    if (parentId && isDescendantOrSelf(id, parentId, await listFolders())) {
      return NextResponse.json({ error: "不能移动到自身或其子文件夹内" }, { status: 400 });
    }
    await moveFolder(id, parentId);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  const ok = await deleteFolderIfEmpty(id);
  if (!ok) {
    return NextResponse.json({ error: "文件夹非空，请先清空其中的条目和子文件夹" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
