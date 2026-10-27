// 站点图标代理：服务端抓取目标站首页，解析 <link rel="icon"> 的真实地址并回传图片字节
// 前端直连 /favicon.ico 命中不了现代站点（自定义路径 / svg / hash 文件名），故走此代理
// 同源回传顺带规避 mixed-content 与 CORS；解析结果按 origin 内存缓存，避免每次预览都抓首页
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 部分站点会拒绝 Node 默认 UA，用常见浏览器 UA 提高可达性
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_TIMEOUT = 5000; // 单次上游请求超时
const MAX_HTML = 512 * 1024; // 首页最多读 512KB 用于找 <link>
const MAX_ICON = 256 * 1024; // 图标字节上限 256KB
const CACHE_TTL = 24 * 60 * 60 * 1000; // 解析结果缓存 1 天
const CACHE_MAX = 500; // 最多缓存 500 个 origin，防无界增长

// origin -> 解析出的图标绝对地址（null 表示已解析但没找到，负缓存避免反复抓首页）
const iconUrlCache = new Map<string, { url: string | null; at: number }>();

/** 从首页 HTML 中挑选最合适的 favicon 链接：apple-touch-icon / 带 sizes 的大图 / png·ico 优先 */
function pickIconUrl(html: string, base: URL): string | null {
  let best: { url: string; score: number } | null = null;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/rel\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "").toLowerCase();
    if (!rel.includes("icon")) continue; // icon / shortcut icon / apple-touch-icon / fluid-icon
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    let score = 0;
    if (rel.includes("apple-touch-icon")) score += 5;
    if (rel === "icon" || rel === "shortcut icon") score += 3;
    if (/\.png$/i.test(abs.pathname)) score += 2;
    if (/\.ico$/i.test(abs.pathname)) score += 1;
    const sizes = tag.match(/sizes\s*=\s*["']?(\d+)\s*x\s*\d+/i)?.[1];
    if (sizes) score += Math.min(Number.parseInt(sizes, 10) / 64, 4);
    if (!best || score > best.score) best = { url: abs.toString(), score };
  }
  return best?.url ?? null;
}

/** 带超时与大小上限地抓取首页 HTML 并解析出图标地址 */
async function resolveIconUrl(origin: string): Promise<string | null> {
  const cached = iconUrlCache.get(origin);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.url;

  let url: string | null = null;
  try {
    const res = await fetch(`${origin}/`, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    const ctype = res.headers.get("content-type") ?? "";
    if (res.ok && ctype.includes("html")) {
      const html = (await res.text()).slice(0, MAX_HTML);
      url = pickIconUrl(html, new URL(res.url || `${origin}/`));
    }
  } catch {
    /* 抓首页失败：走下方兜底 */
  }
  // 兜底：约定俗成的根 favicon.ico（部分老站仍有效）
  if (!url) url = `${origin}/favicon.ico`;

  if (iconUrlCache.size >= CACHE_MAX) {
    const oldest = iconUrlCache.keys().next().value;
    if (oldest) iconUrlCache.delete(oldest);
  }
  iconUrlCache.set(origin, { url, at: Date.now() });
  return url;
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.get("u")?.trim() ?? "";
  let origin: string;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return new NextResponse(null, { status: 400 });
    }
    origin = u.origin;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const iconUrl = await resolveIconUrl(origin);
  if (!iconUrl) return new NextResponse(null, { status: 404 });

  try {
    const res = await fetch(iconUrl, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { "User-Agent": UA, Accept: "image/*,*/*" },
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_ICON) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/x-icon",
        // 浏览器侧缓存一天，减少对上游的重复请求
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
