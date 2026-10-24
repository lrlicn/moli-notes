// 文件夹批量重排（拖拽排序）：事务更新 parent_id + sort_order，含防环校验
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getFolder, listFolders, reorderFolders } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 判断 rootId 是否为 targetId 的祖先（含自身），防止把文件夹插到自己子孙位置形成环 */
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

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const items = body.items as { id?: unknown; parentId?: unknown; sortOrder?: unknown }[];
  const parsed: { id: string; parentId: string | null; sortOrder: number }[] = [];
  for (const it of items) {
    if (typeof it?.id !== "string" || !(await getFolder(it.id))) {
      return NextResponse.json({ error: "文件夹不存在" }, { status: 400 });
    }
    const parentId = typeof it?.parentId === "string" && it.parentId ? it.parentId : null;
    if (parentId && !(await getFolder(parentId))) {
      return NextResponse.json({ error: "目标父文件夹不存在" }, { status: 400 });
    }
    if (typeof it?.sortOrder !== "number" || !Number.isFinite(it.sortOrder)) {
      return NextResponse.json({ error: "排序值无效" }, { status: 400 });
    }
    parsed.push({ id: it.id, parentId, sortOrder: it.sortOrder });
  }
  // 防环：任何一项的新父级不能是它自身或其子孙
  const all = await listFolders();
  for (const it of parsed) {
    if (it.parentId && isDescendantOrSelf(it.id, it.parentId, all)) {
      return NextResponse.json({ error: "不能移动到自身或其子文件夹内" }, { status: 400 });
    }
  }
  await reorderFolders(parsed);
  return NextResponse.json({ ok: true });
}
