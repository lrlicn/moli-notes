// 数据备份：导出全部文件夹与条目为 JSON 下载
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listAllEntriesForBackup, listFolders } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const data = {
    app: "moli-notes",
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: await listFolders(),
    entries: await listAllEntriesForBackup(),
  };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="moli-notes-backup-${stamp}.json"`,
    },
  });
}
