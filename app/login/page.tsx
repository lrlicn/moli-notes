import { cookies } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isAuthed } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import { LogoIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const store = await cookies();
  if (isAuthed(store.get(SESSION_COOKIE)?.value)) {
    redirect("/");
  }
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-background p-[5px]">
      {/* 圆角大卡片：铺满全屏（四边留 5px 边距），与主界面侧边栏的圆角卡片语言统一 */}
      <div className="mn-pop flex h-[calc(100dvh-10px)] w-full overflow-hidden rounded-[10px] border border-border-base bg-surface shadow-2xl">
        {/* 左侧品牌图区（桌面端）：Pexels 免费图库（Steve A Johnson, photo 29067690），Pexels License 可免费商用 */}
        <div className="relative hidden w-[55%] shrink-0 lg:block">
          <Image src="/login-bg.jpg" alt="" fill priority sizes="55vw" className="object-cover" />
          {/* 深色渐变遮罩：保证品牌文字可读、统一深紫调性 */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#151022]/90 via-[#151022]/35 to-brand/30" />
          <div className="absolute inset-x-12 bottom-12 text-white">
            <LogoIcon className="h-11 w-11" />
            <h2 className="mt-5 text-3xl font-bold leading-snug tracking-wide">
              存得快 · 找得快 · 复制快
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-white/75">
              模力笔记 —— 个人碎片信息速查库
              <br />
              地址、路径、命令与代码片段，一搜即达。
            </p>
          </div>
        </div>

        {/* 右侧表单区 */}
        <div className="flex flex-1 items-center justify-center px-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
