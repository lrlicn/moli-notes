"use client";

// 轻量悬停提示：纯 CSS group-hover 实现，无 JS 依赖
// side: 弹出方向（top/bottom/left）；align: 水平对齐（贴近容器左右边缘的按钮用 end 防止气泡溢出被裁）
import type { ReactNode } from "react";

export default function Tip({
  label,
  side = "bottom",
  align = "center",
  className,
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** 附加到外层 wrapper 的类（如 flex-1 让被包裹的弹性子项保持布局） */
  className?: string;
  children: ReactNode;
}) {
  // 垂直/主轴定位
  const v =
    side === "top"
      ? "bottom-full mb-1.5"
      : side === "left"
        ? "right-full mr-1.5 top-1/2 -translate-y-1/2"
        : "top-full mt-1.5";
  // 水平对齐（left 侧弹时不需要）：start=左缘对齐（贴容器左缘的按钮用），end=右缘对齐（贴容器右缘用）
  const h = side === "left" ? "" : align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span data-tip className={`group/tip relative inline-flex ${className ?? ""}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs leading-none text-background opacity-0 shadow-md transition-opacity duration-100 ${v} ${h}`}
      >
        {label}
      </span>
    </span>
  );
}
