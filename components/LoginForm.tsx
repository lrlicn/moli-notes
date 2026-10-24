"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { LogoIcon } from "./icons";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mn-pop">
      {/* 品牌主视觉：大 logo 容器 + 大标题竖排居中，强化品牌感 */}
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand shadow-lg">
          <LogoIcon className="h-11 w-11 text-white" />
        </div>
        <h1 className="mt-5 text-4xl font-bold tracking-wide">模力笔记</h1>
        <p className="mt-2 text-base text-muted-foreground">个人碎片信息速查库</p>
      </div>
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            访问密码
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full rounded-xl border border-border-base bg-background px-4 py-3.5 text-base outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-10 w-full rounded-xl bg-brand py-3.5 text-base font-medium text-brand-on transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "登录中…" : "进入"}
        </button>
      </form>
    </div>
  );
}
