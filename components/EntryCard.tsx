"use client";

// 条目卡片：类型识别图标（点击按类型筛选）、一键复制、置顶/编辑/删除、多行内容分条复制
import { useState } from "react";
import { detectKind, kindLabel, copyLabel } from "@/lib/detect";
import { formatRelative } from "@/lib/format";
import { sourceStyle } from "@/lib/source";
import { ENTRY_DRAG_TYPE, type Entry, type EntryKind } from "@/lib/types";
import {
  ChevronDownIcon,
  CodeIcon,
  CopyIcon,
  FolderIcon,
  GlobeIcon,
  PencilIcon,
  StarIcon,
  TerminalIcon,
  TextIcon,
  TrashIcon,
} from "./icons";
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
  onCopy(entry: Entry): void;
  onTogglePin(entry: Entry): void;
  onEdit(entry: Entry): void;
  onDelete(entry: Entry): void;
  /** 点击来源徽章：按来源筛选 */
  onSourceClick(source: string): void;
  /** 点击类型图标：按类型筛选 */
  onKindClick(kind: EntryKind): void;
  /** 逐行复制单行文本（复用全局复制 + 最近使用上报） */
  onCopyLine(entry: Entry, line: string): void;
}

export default function EntryCard({
  entry,
  onCopy,
  onTogglePin,
  onEdit,
  onDelete,
  onSourceClick,
  onKindClick,
  onCopyLine,
}: Props) {
  const kind = detectKind(entry.content);
  const Icon = KIND_ICONS[kind] ?? TextIcon;
  const ss = entry.source ? sourceStyle(entry.source, entry.sourceColor) : null;
  const lines = entry.content.split("\n");
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`group relative flex flex-col gap-2.5 rounded-2xl bg-surface-muted p-5 transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-sm ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {/* 左对齐向右延伸：图标贴近主区域左缘，居中对齐的气泡会左半截断 */}
        <Tip label={`点击筛选${kindLabel(kind)}`} align="start">
          <button
            type="button"
            aria-label={`按类型 ${kindLabel(kind)} 筛选`}
            onClick={() => onKindClick(kind)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-brand transition-colors hover:text-brand-foreground"
          >
            <Icon width={16} height={16} />
          </button>
        </Tip>
        {/* 标题即拖拽把手：按住标题拖到侧边栏文件夹/未分类即移动（零视觉占用，光标抓手暗示） */}
        <h3
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ENTRY_DRAG_TYPE, entry.id);
            e.dataTransfer.effectAllowed = "move";
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
          title={entry.title}
          className="min-w-0 flex-1 cursor-grab truncate text-base font-medium active:cursor-grabbing"
        >
          {entry.title}
        </h3>
        {ss && (
          <button
            type="button"
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-75 sm:inline-block ${ss.badge}`}
            style={ss.badgeStyle}
            title={`查看来源为「${entry.source}」的条目`}
            onClick={() => onSourceClick(entry.source)}
          >
            {entry.source}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-0.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <Tip label={entry.pinned ? "取消置顶" : "置顶"}>
            <button
              type="button"
              aria-label={entry.pinned ? "取消置顶" : "置顶"}
              onClick={() => onTogglePin(entry)}
              className={`rounded-md p-2 hover:bg-surface ${
                entry.pinned ? "text-brand" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <StarIcon width={16} height={16} filled={entry.pinned} />
            </button>
          </Tip>
          <Tip label="编辑">
            <button
              type="button"
              aria-label="编辑"
              onClick={() => onEdit(entry)}
              className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <PencilIcon width={16} height={16} />
            </button>
          </Tip>
          <Tip label="删除">
            <button
              type="button"
              aria-label="删除"
              onClick={() => onDelete(entry)}
              className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-red-500"
            >
              <TrashIcon width={16} height={16} />
            </button>
          </Tip>
        </div>

        <button
          type="button"
          onClick={() => onCopy(entry)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-on transition-opacity hover:opacity-90"
        >
          <CopyIcon width={14} height={14} />
          {copyLabel(kind)}
        </button>
      </div>

      {lines.length > 1 ? (
        expanded ? (
          <div className="flex flex-col gap-1">
            {lines.map((line, i) => (
              <div
                key={i}
                className="mn-line flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5"
              >
                <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground" title={line}>
                  {line || " "}
                </code>
                <Tip label="复制此行">
                  <button
                    type="button"
                    aria-label={`复制第 ${i + 1} 行`}
                    onClick={() => onCopyLine(entry, line)}
                    className="mn-line-copy shrink-0 rounded-md p-1 text-muted-foreground transition-opacity hover:text-foreground"
                  >
                    <CopyIcon width={13} height={13} />
                  </button>
                </Tip>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDownIcon width={12} height={12} className="rotate-180" />
              收起
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-full items-center gap-2 rounded-lg bg-surface px-3 py-2 text-left"
            title={entry.content}
          >
            {/* 收起态只显示首行，避免多行内容拼接成一长串把右侧标签挤出卡片 */}
            <code className="min-w-0 flex-1 truncate font-mono text-sm leading-6 text-foreground">
              {lines[0]}
            </code>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              共 {lines.length} 行
              <ChevronDownIcon width={12} height={12} />
            </span>
          </button>
        )
      ) : (
        <code
          className="block overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-surface px-3 py-2 font-mono text-sm leading-6 text-foreground"
          title={entry.content}
        >
          {entry.content}
        </code>
      )}

      {entry.notes && (
        <p className="truncate text-[13px] leading-6 text-muted-foreground" title={entry.notes}>
          {entry.notes}
        </p>
      )}

      {/* 手机上标题行挤不下来源徽章：移到 meta 行开头，信息不丢 */}
      {ss && (
        <button
          type="button"
          className={`self-start rounded-full px-2 py-0.5 text-xs font-medium sm:hidden ${ss.badge}`}
          style={ss.badgeStyle}
          onClick={() => onSourceClick(entry.source)}
        >
          {entry.source}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {entry.folderName && <span>{entry.folderName}</span>}
        {entry.copyCount > 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 tabular-nums ${entry.folderName ? "" : "ml-auto"}`}
            title="累计复制次数"
          >
            <CopyIcon width={11} height={11} />
            {entry.copyCount} 次
          </span>
        )}
        <span className={`tabular-nums ${entry.copyCount > 0 || entry.folderName ? "ml-auto" : ""}`}>
          {entry.lastUsedAt ? (
            <>
              <span className="hidden sm:inline">最近使用 </span>
              {formatRelative(entry.lastUsedAt)}
            </>
          ) : (
            formatRelative(entry.updatedAt)
          )}
        </span>
      </div>
    </div>
  );
}
