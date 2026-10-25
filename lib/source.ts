// 条目来源：预设类别与颜色映射（EntryDialog 选择器与 EntryRow/EntryPreview 徽章共用）
import type { CSSProperties } from "react";

export const SOURCE_PRESETS = ["自研项目", "朋友推荐", "网站", "文档", "其他"];

type SourceStyle = {
  badge: string;
  dot: string;
  badgeStyle?: CSSProperties;
  dotStyle?: CSSProperties;
};

const STYLES: Record<string, SourceStyle> = {
  自研项目: {
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  朋友推荐: {
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  网站: {
    badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  文档: {
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  其他: {
    badge: "bg-rose-400/10 text-rose-500 dark:text-rose-400",
    dot: "bg-rose-400",
  },
};

// 非预设且无色值时的兜底（仅未设置来源时可能出现）
const FALLBACK: SourceStyle = {
  badge: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  dot: "bg-zinc-400",
};

// 自定义来源色板：颜色随条目持久化（source_color 列），未选时按来源名 hash 自动分配（同名恒定）
export const SOURCE_COLORS = [
  "#8b5cf6", // 紫
  "#3b82f6", // 蓝
  "#06b6d4", // 青
  "#22c55e", // 绿
  "#f59e0b", // 琥珀
  "#f97316", // 橙
  "#ef4444", // 红
  "#ec4899", // 粉
];

export function autoColor(source: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) >>> 0;
  return SOURCE_COLORS[h % SOURCE_COLORS.length];
}

export function sourceStyle(source: string, color?: string | null): SourceStyle {
  const preset = STYLES[source];
  if (preset) return preset;
  if (!source) return FALLBACK;
  const c = color || autoColor(source);
  return {
    badge: "",
    dot: "",
    badgeStyle: {
      backgroundColor: `color-mix(in srgb, ${c} 13%, transparent)`,
      color: c,
    },
    dotStyle: { backgroundColor: c },
  };
}
