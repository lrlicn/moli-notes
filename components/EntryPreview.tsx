"use client";

// 条目预览（右侧详情面板）：主从布局的「记录视图」，内容铺满预览面板（detail-as-page）
// 预览面板是灰画布（main bg-background）上的白色圆角卡片（bg-surface），与列表同级、靠 m-2 缝隙 + 圆角区分
// 内容放宽版心（max-w-6xl）贴顶排布，常见屏宽下基本铺满、避免居中窄栏造成的大片左右留白；底部「信息」元数据栅格以细分隔收口
// 管理操作（⋯）只在此处出现（列表行已移除 ⋯，避免重复）；来源/类型在信息区可直接点击筛选
import { copyLabel, detectKind, kindLabel } from "@/lib/detect";
import { formatDate, formatRelative } from "@/lib/format";
import { sourceStyle } from "@/lib/source";
import type { Entry, EntryKind } from "@/lib/types";
import { CodeIcon, CopyIcon, FolderIcon, GlobeIcon, TerminalIcon, TextIcon, XIcon } from "./icons";
import EntryActions from "./EntryActions";
import Tip from "./Tip";
import type { ComponentType, ReactNode, SVGProps } from "react";

const KIND_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  url: GlobeIcon,
  path: FolderIcon,
  command: TerminalIcon,
  code: CodeIcon,
  text: TextIcon,
};

interface Props {
  entry: Entry;
  /** 传 content 为逐行复制，否则复制全文 */
  onCopy(entry: Entry, content?: string): void;
  onTogglePin(entry: Entry): void;
  onEdit(entry: Entry): void;
  onDelete(entry: Entry): void;
  onSourceClick(source: string): void;
  onKindClick(kind: EntryKind): void;
  /** 移动端 overlay 场景传入以显示关闭按钮；常驻右栏不传 */
  onClose?(): void;
}

// 信息区一行：标签 + 值（值可为可点击的筛选按钮）
function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default function EntryPreview({
  entry,
  onCopy,
  onTogglePin,
  onEdit,
  onDelete,
  onSourceClick,
  onKindClick,
  onClose,
}: Props) {
  const kind = detectKind(entry.content);
  const Icon = KIND_ICONS[kind] ?? TextIcon;
  const ss = entry.source ? sourceStyle(entry.source, entry.sourceColor) : null;
  const lines = entry.content.split("\n");
  const multi = lines.length > 1;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* 铺满 detail 页：与列表同级 surface 面板；版心放宽到 max-w-6xl，常见屏宽下基本铺满，仅超宽时留安全边距 */}
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-6 lg:px-8">
        {/* 头部：图标 + 标题（左）· 操作组（右）；items-center 使图标与单行标题垂直居中 */}
        <div className="flex items-center gap-3.5">
              <Tip label={`点击筛选${kindLabel(kind)}`} align="start">
                <button
                  type="button"
                  aria-label={`按类型 ${kindLabel(kind)} 筛选`}
                  onClick={() => onKindClick(kind)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-brand transition-colors hover:text-brand-foreground"
                >
                  <Icon width={18} height={18} />
                </button>
              </Tip>
              <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug">
                {entry.title}
              </h2>
              <div className="flex shrink-0 items-center gap-1.5">
                <EntryActions entry={entry} onTogglePin={onTogglePin} onEdit={onEdit} onDelete={onDelete} />
                <Tip label="复制全部（Enter）" side="bottom" align="end">
                  <button
                    type="button"
                    onClick={() => onCopy(entry)}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-on transition-opacity hover:opacity-90"
                  >
                    <CopyIcon width={14} height={14} />
                    {copyLabel(kind)}
                  </button>
                </Tip>
                {onClose && (
                  <button
                    type="button"
                    aria-label="关闭预览"
                    onClick={onClose}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  >
                    <XIcon width={16} height={16} />
                  </button>
                )}
              </div>
            </div>

        {/* 内容：类型名做小标题，值卡片 / 代码表 */}
        <div className="mt-6">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {kindLabel(kind)}
                {multi && (
                  <span className="font-normal text-muted-foreground/70"> · 共 {lines.length} 行 · 悬停某行可单独复制</span>
                )}
              </p>
              {multi ? (
                <div className="overflow-hidden rounded-xl border border-border-base">
                  {lines.map((line, i) => (
                    <div
                      key={i}
                      className="mn-line flex items-start gap-2.5 border-b border-border-base px-3 py-2 last:border-b-0 hover:bg-surface-muted"
                    >
                      <span className="w-6 shrink-0 select-none pt-1 text-right font-mono text-xs text-muted-foreground/60">
                        {i + 1}
                      </span>
                      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-sm leading-6 text-foreground">
                        {line || " "}
                      </code>
                      <Tip label="复制此行" side="left">
                        <button
                          type="button"
                          aria-label={`复制第 ${i + 1} 行`}
                          onClick={() => onCopy(entry, line)}
                          className="mn-line-copy shrink-0 rounded-md p-1 text-muted-foreground transition-opacity hover:text-brand"
                        >
                          <CopyIcon width={13} height={13} />
                        </button>
                      </Tip>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="group relative rounded-xl bg-surface-muted p-4">
                  <code className="block whitespace-pre-wrap break-all pr-9 font-mono text-sm leading-7 text-foreground">
                    {entry.content}
                  </code>
                  {/* 值级复制：整块 hover 时靠右垂直居中浮出复制按钮（单行时与文本对齐；统一用 Tip，不用原生 title） */}
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                    <Tip label="复制内容" side="left">
                      <button
                        type="button"
                        aria-label="复制内容"
                        onClick={() => onCopy(entry)}
                        className="mn-iconbtn rounded-md p-1.5 text-muted-foreground hover:text-brand"
                      >
                        <CopyIcon width={14} height={14} />
                      </button>
                    </Tip>
                  </span>
                </div>
              )}

              {entry.notes && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">备注</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{entry.notes}</p>
                </div>
              )}
            </div>

        {/* 信息：元数据栅格，顶部细分隔收口 */}
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-base pt-5 sm:grid-cols-3">
              <MetaRow label="类型">
                <button type="button" onClick={() => onKindClick(kind)} className="hover:text-brand hover:underline">
                  {kindLabel(kind)}
                </button>
              </MetaRow>
              <MetaRow label="来源">
                {entry.source ? (
                  <button
                    type="button"
                    onClick={() => onSourceClick(entry.source)}
                    className={`max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-75 ${ss?.badge ?? ""}`}
                    style={ss?.badgeStyle}
                  >
                    {entry.source}
                  </button>
                ) : (
                  <span className="text-muted-foreground">未设置</span>
                )}
              </MetaRow>
              <MetaRow label="文件夹">{entry.folderName ?? <span className="text-muted-foreground">未分类</span>}</MetaRow>
              <MetaRow label="复制次数">
                <span className="tabular-nums">{entry.copyCount > 0 ? `${entry.copyCount} 次` : "—"}</span>
              </MetaRow>
              <MetaRow label="最近使用">
                <span className="tabular-nums">{entry.lastUsedAt ? formatRelative(entry.lastUsedAt) : "从未"}</span>
              </MetaRow>
              <MetaRow label="更新于">{formatDate(entry.updatedAt)}</MetaRow>
              <MetaRow label="创建于">{formatDate(entry.createdAt)}</MetaRow>
        </dl>
      </div>
    </div>
  );
}
