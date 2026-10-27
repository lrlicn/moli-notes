"use client";

// 条目紧凑行：主从布局左侧列表用。信息优先级 = 内容值（主角）> 标题 > 复制
// 只保留 icon · 标题 · 内容值(值级复制)：管理操作（置顶/编辑/删除）统一收进右侧预览，避免行内 ⋯ 与预览 ⋯ 重复
// 列表栏与主壳同为 surface；行 hover/选中用 surface-muted 轻下沉胶囊 + 左侧 accent bar 标记（不用硬分隔线）
import { detectKind, kindLabel } from "@/lib/detect";
import { ENTRY_DRAG_TYPE, type Entry, type EntryKind } from "@/lib/types";
import { CheckIcon, CodeIcon, CopyIcon, FolderIcon, GlobeIcon, StarIcon, TerminalIcon, TextIcon } from "./icons";
import Tip from "./Tip";
import type { ComponentType, SVGProps } from "react";

const KIND_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  url: GlobeIcon,
  path: FolderIcon,
  command: TerminalIcon,
  code: CodeIcon,
  text: TextIcon,
};

interface Props {
  entry: Entry;
  selected: boolean;
  /** 多选模式：行点击改为勾选切换，隐藏类型/复制操作 */
  selectMode: boolean;
  checked: boolean;
  /** 点击行选中（驱动右侧预览） */
  onSelect(id: string): void;
  /** 多选态切换勾选 */
  onToggleCheck(id: string): void;
  onCopy(entry: Entry): void;
  onKindClick(kind: EntryKind): void;
}

export default function EntryRow({ entry, selected, selectMode, checked, onSelect, onToggleCheck, onCopy, onKindClick }: Props) {
  const kind = detectKind(entry.content);
  const Icon = KIND_ICONS[kind] ?? TextIcon;
  const firstLine = entry.content.split("\n")[0];
  const lineCount = entry.content.includes("\n") ? entry.content.split("\n").length : 0;

  return (
    <div
      data-entry-id={entry.id}
      role="button"
      tabIndex={0}
      onClick={() => (selectMode ? onToggleCheck(entry.id) : onSelect(entry.id))}
      onKeyDown={(e) => {
        // 行自身处理 Enter/Space 激活（与点击一致）；全局键盘已对 [role="button"] 让位，不会重复触发
        // 焦点随 ↑↓ 漫游到行后：Enter 执行主操作=复制，Space 仅选中（驱动预览）
        if (e.key === "Enter") {
          e.preventDefault();
          if (selectMode) onToggleCheck(entry.id);
          else onCopy(entry);
        } else if (e.key === " ") {
          e.preventDefault();
          if (selectMode) onToggleCheck(entry.id);
          else onSelect(entry.id);
        }
      }}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 ${
        (selectMode ? checked : selected) ? "bg-surface-muted" : "hover:bg-surface-muted"
      }`}
    >
      {/* 选中/勾选指示：左侧一道 accent bar */}
      {(selectMode ? checked : selected) && (
        <span aria-hidden className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" />
      )}

      {selectMode ? (
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            checked ? "border-brand bg-brand text-brand-on" : "border-border-base text-transparent"
          }`}
        >
          <CheckIcon width={13} height={13} />
        </span>
      ) : (
        <Tip label={`点击筛选${kindLabel(kind)}`} align="start">
          <button
            type="button"
            aria-label={`按类型 ${kindLabel(kind)} 筛选`}
            onClick={(e) => {
              e.stopPropagation();
              onKindClick(kind);
            }}
            className="mn-iconbtn flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-brand transition hover:text-brand-foreground"
          >
            <Icon width={15} height={15} />
          </button>
        </Tip>
      )}

      {entry.pinned && <StarIcon width={13} height={13} filled className="shrink-0 text-brand" />}

      <h3
        draggable={!selectMode}
        onDragStart={(e) => {
          e.dataTransfer.setData(ENTRY_DRAG_TYPE, entry.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className="max-w-[8rem] shrink-0 cursor-grab truncate text-sm font-medium active:cursor-grabbing"
      >
        {entry.title}
      </h3>

      {/* 内容值：行内主角，占剩余宽度；右侧 hover/选中时浮出复制图标 */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <code
          className={`min-w-0 flex-1 truncate text-xs ${kind === "text" ? "font-sans" : "font-mono"} ${selected ? "text-foreground" : "text-muted-foreground"}`}
        >
          {firstLine}
          {lineCount > 1 && <span className="ml-1.5 text-muted-foreground/70">共 {lineCount} 行</span>}
        </code>
        {!selectMode && (
          <Tip label="复制">
            <button
              type="button"
              aria-label="复制内容"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(entry);
              }}
              className={`mn-iconbtn shrink-0 rounded-md p-1 text-muted-foreground transition hover:text-brand ${
                selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <CopyIcon width={13} height={13} />
            </button>
          </Tip>
        )}
      </div>
    </div>
  );
}
