"use client";

// 排序切换：复用 ⋯（EntryActions）那套弹出菜单——ghost 按钮显示当前维度 + ⌄，点开 3 项、当前项打勾
// 取代原生 <select> 的系统样式，保持全站「无原生 chrome」的一致观感
import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, UnfoldMoreIcon } from "./icons";

export type SortKey = "recent" | "name" | "copies";

const LABELS: Record<SortKey, string> = { recent: "最近使用", name: "名称", copies: "复制次数" };
const ORDER: SortKey[] = ["recent", "name", "copies"];

export default function SortMenu({ value, onChange }: { value: SortKey; onChange(k: SortKey): void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 打开时：点击外部或 Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} data-menu-open={open ? "" : undefined} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
          open
            ? "bg-surface-muted text-brand"
            : "text-muted-foreground hover:bg-surface-muted hover:text-brand"
        }`}
      >
        <UnfoldMoreIcon width={13} height={13} />
        {LABELS[value]}
        <ChevronDownIcon width={12} height={12} />
      </button>
      {open && (
        <div className="mn-pop absolute left-0 top-full z-30 mt-1 min-w-[8.5rem] overflow-hidden rounded-lg border border-border-base bg-surface py-1 text-sm shadow-lg">
          {ORDER.map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChange(k);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-muted hover:text-brand ${
                k === value ? "text-brand" : "text-foreground"
              }`}
            >
              <span className="flex w-3.5 shrink-0 justify-center">{k === value && <CheckIcon width={13} height={13} />}</span>
              {LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
