import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isAuthed } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const store = await cookies();
  if (!isAuthed(store.get(SESSION_COOKIE)?.value)) {
    redirect("/login");
  }
  // 侧边栏底部的轻量身份显示（可选配置，如 MOLINOTES_OWNER=模力 → 显示「模力(紫粗)的速查库(灰)」）
  const owner = process.env.MOLINOTES_OWNER?.trim();
  return <AppShell ownerLabel={owner || undefined} />;
}
