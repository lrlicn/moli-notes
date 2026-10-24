// 认证：单用户密码 + HMAC 会话 Cookie
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "mn_session";
const PASSWORD = process.env.MOLINOTES_PASSWORD || "moli123";
const SECRET = process.env.MOLINOTES_SECRET || `molinotes::${PASSWORD}`;
const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 天

export function expectedToken(): string {
  return createHmac("sha256", SECRET).update("molinotes-session-v1").digest("hex");
}

export function checkPassword(input: string): boolean {
  const a = Buffer.from(input ?? "");
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAuthed(value: string | undefined | null): boolean {
  if (!value) return false;
  const expected = expectedToken();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_TTL,
    // 生产环境（https）开启 Secure，本地 http 调试保持 false
    secure: process.env.NODE_ENV === "production",
  };
}

/** API 路由守卫：未登录时返回 401 响应，已登录返回 null */
export async function requireAuth(): Promise<NextResponse | null> {
  const store = await cookies();
  if (!isAuthed(store.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
  }
  return null;
}
