// 登录：校验密码，签发会话 Cookie
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, checkPassword, expectedToken, isPasswordConfigured, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 内存级失败限流 + 阶梯锁定：10 分钟内同源自失败满 5 次即锁，第 1 次 1 分钟、第 2 次 5 分钟、第 3 次起 15 分钟封顶
// 设计意图：忘密码的真人首次只等 1 分钟，脚本攻击者迅速爬升到高阶梯；单实例自托管够用，重启即复位可接受
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_MAX = 5;
const LOCK_STEPS_SEC = [60, 300, 900];
// 锁罚完且静默超此时长，阶梯归零（避免真人隔日再忘一次就直接吃高档锁）
const LOCK_DECAY_MS = 60 * 60 * 1000;

type Guard = { fails: number[]; lockedUntil: number; locks: number; lastLockAt: number; updated: number };
const guards = new Map<string, Guard>();

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** 取/建防护记录；顺带清理过期记录与到期的阶梯 */
function guardFor(ip: string, now: number): Guard {
  let g = guards.get(ip);
  // 阶梯归零仅限“确实锁过”的记录（lastLockAt>0）；新建记录该值为 0，若不设此守卫会被每次请求误删重建，失败计数永远攒不满
  if (g && g.lastLockAt > 0 && now >= g.lockedUntil && now - g.lastLockAt > LOCK_DECAY_MS) {
    guards.delete(ip);
    g = undefined;
  }
  if (!g) {
    // 控制内存增长：按最后活动时间惰性清理长期静默记录（单用户量级够用）
    if (guards.size > 1000) {
      for (const [k, v] of guards) if (now - v.updated > LOCK_DECAY_MS) guards.delete(k);
    }
    g = { fails: [], lockedUntil: 0, locks: 0, lastLockAt: 0, updated: now };
    guards.set(ip, g);
  }
  return g;
}

function lockedResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "失败次数过多，请稍后再试", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(req: NextRequest) {
  if (!isPasswordConfigured()) {
    return NextResponse.json({ error: "服务端未配置 MOLINOTES_PASSWORD，拒绝登录" }, { status: 500 });
  }
  const ip = clientIp(req);
  const now = Date.now();
  const g = guardFor(ip, now);
  // 锁定期内一律拒绝（含正确密码），否则锁定对爆破形同虚设
  if (now < g.lockedUntil) {
    return lockedResponse(Math.max(1, Math.ceil((g.lockedUntil - now) / 1000)));
  }
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (!checkPassword(password)) {
    g.updated = now;
    g.fails = g.fails.filter((t) => now - t < FAIL_WINDOW_MS);
    g.fails.push(now);
    if (g.fails.length >= FAIL_MAX) {
      const step = LOCK_STEPS_SEC[Math.min(g.locks, LOCK_STEPS_SEC.length - 1)];
      g.locks += 1;
      g.lastLockAt = now;
      g.lockedUntil = now + step * 1000;
      g.fails = []; // 锁满后重新计 5 次
      return lockedResponse(step);
    }
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  guards.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, expectedToken(), sessionCookieOptions());
  return res;
}
