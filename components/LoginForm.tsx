"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/client";
import { EyeIcon, EyeOffIcon, LogoIcon } from "./icons";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  // 锁定剩余秒数（服务端 429 的 retryAfter）；>0 时展示行内倒计时，不遮罩不禁用
  const [lockLeft, setLockLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const retry = err instanceof ApiError && typeof err.body?.retryAfter === "number" ? err.body.retryAfter : 0;
      if (retry > 0) {
        // 锁定期用倒计时行单独展示，不重复挂红字
        setError("");
        setLockLeft(retry);
      } else {
        setError(err instanceof Error ? err.message : "登录失败");
      }
      setShaking(true);
      // 失败后全选原文：直接开打即可覆盖，免手动清空
      inputRef.current?.select();
      setLoading(false);
    }
  }

  // 锁定倒计时：每秒递减，归零提示自动消失；服务端仍是最终裁决
  useEffect(() => {
    if (lockLeft <= 0) return;
    const t = setInterval(() => setLockLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockLeft]);

  // Caps Lock 检测：大小写误触是密码输错的头号原因
  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsOn(e.getModifierState("CapsLock"));

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
          <div className="relative">
            <input
              ref={inputRef}
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={checkCaps}
              onKeyUp={checkCaps}
              placeholder="请输入密码"
              aria-invalid={!!error}
              aria-describedby={error ? "password-error" : undefined}
              onAnimationEnd={() => setShaking(false)}
              className={`w-full rounded-xl border bg-background py-3.5 pr-12 pl-4 text-base outline-none transition-colors focus:ring-2 focus:ring-brand/20 ${
                error ? "border-red-500/70 focus:border-red-500" : "border-border-base focus:border-brand"
              } ${shaking ? "mn-shake" : ""}`}
            />
            {/* 明文切换：切到 text 时密码管理器下拉会让位，属预期行为 */}
            <button
              type="button"
              aria-label={show ? "隐藏密码" : "显示密码"}
              aria-pressed={show}
              onClick={() => {
                setShow(!show);
                inputRef.current?.focus();
              }}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              {show ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
            </button>
          </div>
          {capsOn && !error && lockLeft === 0 && (
            <p className="mt-2 text-sm text-amber-500">大写锁定已开启，请注意大小写</p>
          )}
          {lockLeft > 0 && (
            <p className="mt-2 text-sm text-amber-500">
              失败次数过多，请 <span className="tabular-nums">{lockLeft}</span> 秒后再试
            </p>
          )}
          {error && (
            <p id="password-error" role="alert" className="mt-2 text-sm text-red-500">
              {error}
            </p>
          )}
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
