"use client";

// 条目操作菜单：把置顶/编辑/删除收进一枚 ⋯ 下拉，减少每张卡片的常驻按钮（大数据量下 DOM 更轻）
import { useEffect, useRef, useState } from "react";
import type { Entry } from "@/lib/types";
import { MoreIcon, PencilIcon, StarIcon, TrashIcon } from "./icons";

interface Props {
  entry: Entry;
  onTogglePin(entry: Entry): void;
  onEdit(entry: Entry): void;
  onDelete(entry: Entry): void;
  /** 触发按钮的额外类名（如卡片内 hover 显隐控制） */
  className?: string;
}

export default function EntryActions({ entry, onTogglePin, onEdit, onDelete, className = "" }: Props) {
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

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={boxRef} data-menu-open={open ? "" : undefined} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md p-2 transition-colors hover:bg-surface ${
          open ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <MoreIcon width={16} height={16} />
      </button>
      {open && (
        <div className="mn-pop absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] overflow-hidden rounded-lg border border-border-base bg-surface py-1 text-sm shadow-lg">
          <button
            type="button"
            onClick={() => run(() => onTogglePin(entry))}
            className="group flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-muted hover:text-brand"
          >
            <StarIcon width={14} height={14} filled={entry.pinned} className={entry.pinned ? "text-brand" : "text-muted-foreground group-hover:text-brand"} />
            {entry.pinned ? "取消置顶" : "置顶"}
          </button>
          <button
            type="button"
            onClick={() => run(() => onEdit(entry))}
            className="group flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-muted hover:text-brand"
          >
            <PencilIcon width={14} height={14} className="text-muted-foreground group-hover:text-brand" />
            编辑
          </button>
          <button
            type="button"
            onClick={() => run(() => onDelete(entry))}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-500 hover:bg-red-500/10"
          >
            <TrashIcon width={14} height={14} />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
