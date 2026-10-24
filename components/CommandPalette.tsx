"use client";

// Ctrl+K 全局搜索面板：即时搜索、键盘上下选择、回车直接复制
import { useEffect, useRef, useState } from "react";
import { api, copyText } from "@/lib/client";
import { detectKind } from "@/lib/detect";
import { sourceStyle } from "@/lib/source";
import type { Entry } from "@/lib/types";
import {
  ChevronRightIcon,
  CodeIcon,
  CopyIcon,
  FolderIcon,
  GlobeIcon,
  SearchIcon,
  TerminalIcon,
  TextIcon,
} from "./icons";
import type { ComponentType, SVGProps } from "react";

const KIND_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  url: GlobeIcon,
  path: FolderIcon,
  command: TerminalIcon,
  code: CodeIcon,
  text: TextIcon,
};

interface Props {
  onClose(): void;
  onCopied(entry: Entry): void;
  /** 查看条目：关闭面板并让列表只显示该条目 */
  onView(entry: Entry): void;
}

/** 关键词高亮：把查询词（大小写不敏感）在文本中的出现处包上 mark 标记 */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (;;) {
    const idx = lower.indexOf(lq, i);
    if (idx < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      // 荧光黄高亮（搜索结果关键词的行业惯例色，浅暗主题均有足够对比度）
      <mark key={idx} className="rounded-sm bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-800 dark:text-amber-100">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
  }
  return <>{parts}</>;
}

export default function CommandPalette({ onClose, onCopied, onView }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await api<{ entries: Entry[] }>(`/api/entries?q=${encodeURIComponent(q)}`);
        setResults(q ? r.entries.slice(0, 12) : r.entries.slice(0, 8));
        setActive(0);
      } catch {
        setResults([]);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function pick(entry: Entry) {
    const ok = await copyText(entry.content);
    if (ok) onCopied(entry);
    onClose();
  }

  function view(entry: Entry) {
    onView(entry);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && e.shiftKey && results[active]) {
      e.preventDefault();
      view(results[active]);
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={onClose}>
      <div
        className="mn-pop mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-border-base bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border-base px-4">
          <SearchIcon width={16} height={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索标题、内容、备注、来源…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border-base px-1.5 font-mono text-[11px] text-muted-foreground sm:block">
            Esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {q ? "没有匹配的条目" : "暂无条目，先去新建一条吧"}
            </p>
          )}
          {results.map((e, i) => {
            const kind = detectKind(e.content);
            const Icon = KIND_ICONS[kind] ?? TextIcon;
            const ss = sourceStyle(e.source, e.sourceColor);
            return (
              <button
                key={e.id}
                type="button"
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(e)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ${
                  i === active ? "bg-brand-soft" : ""
                }`}
              >
                <span className="icon-chip flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                  <Icon width={13} height={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      <Hl text={e.title} q={q} />
                    </span>
                    {e.source && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ss.badge}`}
                        style={ss.badgeStyle}
                      >
                        {e.source}
                      </span>
                    )}
                    {e.folderName && (
                      <span className="shrink-0 text-xs text-muted-foreground">{e.folderName}</span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    <Hl text={e.content} q={q} />
                  </span>
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  title="查看条目（Shift+Enter）"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    view(e);
                  }}
                  className={`shrink-0 p-1 ${i === active ? "text-brand" : "text-muted-foreground/50"} hover:text-brand`}
                >
                  <ChevronRightIcon width={14} height={14} />
                </span>
                <CopyIcon
                  width={14}
                  height={14}
                  className={`shrink-0 ${i === active ? "text-brand" : "text-muted-foreground/50"}`}
                />
              </button>
            );
          })}
        </div>
        {results.length > 0 && (
          <div className="border-t border-border-base px-4 py-2 text-xs text-muted-foreground">
            ↑↓ 选择 · Enter 复制 · Shift+Enter 查看
          </div>
        )}
      </div>
    </div>
  );
}
