"use client";

// 快捷键总览弹窗：按 ? 唤出，分组列出导航 / 操作 / 视图全部快捷键
// 底部常驻条只留精简提示，完整清单收在此，避免提示条堆太多项显乱（仿 Linear / GitHub 的 ? 面板）
import { useEffect } from "react";
import type { ReactNode } from "react";
import { XIcon } from "./icons";

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-border-base bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-foreground">
      {children}
    </kbd>
  );
}

function Row({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{desc}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k) => (
          <Key key={k}>{k}</Key>
        ))}
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{title}</h3>
      <div className="divide-y divide-border-base/60">{children}</div>
    </div>
  );
}

export default function ShortcutsDialog({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="键盘快捷键"
        className="mn-pop fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-base bg-surface p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">键盘快捷键</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <XIcon width={16} height={16} />
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <Group title="导航">
            <Row keys={["↑", "↓"]} desc="选择条目" />
            <Row keys={["Ctrl", "K"]} desc="搜索" />
            <Row keys={["Esc"]} desc="关闭预览 / 退出多选" />
          </Group>
          <Group title="操作">
            <Row keys={["Enter"]} desc="复制选中" />
            <Row keys={["N"]} desc="新建条目" />
            <Row keys={["E"]} desc="编辑" />
            <Row keys={["P"]} desc="置顶 / 取消" />
            <Row keys={["Del"]} desc="移到最近删除" />
          </Group>
          <Group title="视图">
            <Row keys={["?"]} desc="打开本面板" />
          </Group>
        </div>
      </div>
    </div>
  );
}
