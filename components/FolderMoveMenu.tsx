"use client";

// 批量「移动到…」：复用 SortMenu / EntryActions 那套弹出菜单，取代原生 <select> 的系统样式
// 位于列表底部操作条，故菜单向上弹出（bottom-full）；文件夹多时限高滚动；无选中项时禁用触发按钮
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, FolderIcon } from "./icons";

type FolderItem = { id: string; name: string };

export default function FolderMoveMenu({
  folders,
  disabled,
  onMove,
}: {
  folders: FolderItem[];
  disabled: boolean;
  /** 传 null 表示移到「未分类」 */
  onMove(folderId: string | null): void;
}) {
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

  const pick = (folderId: string | null) => {
    setOpen(false);
    onMove(folderId);
  };

  return (
    <div ref={boxRef} data-menu-open={open ? "" : undefined} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "bg-surface-muted text-brand"
            : "text-muted-foreground hover:bg-surface-muted hover:text-brand"
        }`}
      >
        <FolderIcon width={13} height={13} />
        移动到…
        <ChevronDownIcon width={12} height={12} />
      </button>
      {open && (
        <div className="mn-pop absolute bottom-full left-0 z-30 mb-1 max-h-60 min-w-[8.5rem] overflow-y-auto rounded-lg border border-border-base bg-surface py-1 text-sm shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(null)}
            className="flex w-full items-center px-3 py-1.5 text-left text-foreground transition-colors hover:bg-surface-muted hover:text-brand"
          >
            未分类
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              onClick={() => pick(f.id)}
              className="flex w-full items-center truncate px-3 py-1.5 text-left text-foreground transition-colors hover:bg-surface-muted hover:text-brand"
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
