// 文件夹：列表 / 新建
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createFolder, entryCountsByFolder, getFolder, listFolders } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return NextResponse.json({ folders: await listFolders(), counts: await entryCountsByFolder() });
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "文件夹名称不能为空" }, { status: 400 });
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
  if (parentId && !(await getFolder(parentId))) {
    return NextResponse.json({ error: "父文件夹不存在" }, { status: 400 });
  }
  return NextResponse.json({ folder: await createFolder(name, parentId) }, { status: 201 });
}
