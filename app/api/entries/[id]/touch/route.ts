// 条目：记录使用时间（复制成功后调用，用于"最近使用"排序）
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { touchEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  touchEntry(id);
  return NextResponse.json({ ok: true });
}
