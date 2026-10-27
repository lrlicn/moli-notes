"use client";

// 新建 / 编辑条目弹窗：标题栏可拖动定位（钳制视口内），面板右下角可缩放并记忆尺寸
// 内容为核心字段：随面板弹性增高，实时类型识别徽章；Ctrl/⌘+Enter 快捷保存
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import { api } from "@/lib/client";
import { detectKind, kindLabel } from "@/lib/detect";
import type { Entry, Folder } from "@/lib/types";
import { SOURCE_COLORS, SOURCE_PRESETS, sourceStyle } from "@/lib/source";
import {
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  FolderIcon,
  GlobeIcon,
  PencilIcon,
  TerminalIcon,
  TextIcon,
  XIcon,
} from "./icons";

interface Props {
  folders: Folder[];
  mode: "create" | "edit";
  entry?: Entry;
  defaultFolderId: string | null;
  onClose(): void;
  onSaved(entry: Entry): void;
}

// 弹窗尺寸记忆：右下角缩放后写 localStorage，下次打开恢复
const SIZE_KEY = "moli.entryDialog.size";
const FORM_ID = "entry-dialog-form";

const KIND_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  url: GlobeIcon,
  path: FolderIcon,
  command: TerminalIcon,
  code: CodeIcon,
  text: TextIcon,
};

/** 读取并钳制持久化宽高（防止上次大屏的尺寸越界本次视口） */
function readSavedSize(): { w: number; h: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const p = JSON.parse(window.localStorage.getItem(SIZE_KEY) ?? "");
    if (typeof p?.w !== "number" || typeof p?.h !== "number") return null;
    return {
      w: Math.min(Math.max(p.w, 380), window.innerWidth - 32),
      h: Math.min(Math.max(p.h, 280), window.innerHeight - 32),
    };
  } catch {
    return null;
  }
}

export default function EntryDialog({ folders, mode, entry, defaultFolderId, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [source, setSource] = useState(entry?.source ?? "");
  const [sourceColor, setSourceColor] = useState(entry?.sourceColor ?? "");
  const [folderId, setFolderId] = useState<string>(entry ? entry.folderId ?? "" : defaultFolderId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 拖动偏移（相对默认居中位）；left0/top0 为按下时面板未变换的视口位置，用于钳制
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ mx: number; my: number; bx: number; by: number; left0: number; top0: number; w: number } | null>(null);
  // 缩放后的宽高；null = 默认限宽、高度自适应
  const [size, setSize] = useState<{ w: number; h: number } | null>(readSavedSize);
  // 缩放手柄拖拽起始数据；mode：x=右缘 y=底缘 xy=右下角
  const resizeRef = useRef<{ mx: number; my: number; bw: number; bh: number; mode: "x" | "y" | "xy" } | null>(null);

  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // 自定义缩放：原生 CSS resize 在宽度为 100%/限宽时横向拖不动，改为把手 pointer 拖拽，宽高自由
  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>, mode: "x" | "y" | "xy") {
    if (e.button !== 0) return;
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    resizeRef.current = { mx: e.clientX, my: e.clientY, bw: r.width, bh: r.height, mode };
    // 把默认 auto 尺寸固化为 px，后续拖拽以此为基准
    setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = resizeRef.current;
    if (!d) return;
    // 下限保证字段可用，上限不超出视口
    const w = d.mode === "y" ? d.bw : Math.min(Math.max(d.bw + e.clientX - d.mx, 380), window.innerWidth - 32);
    const h = d.mode === "x" ? d.bh : Math.min(Math.max(d.bh + e.clientY - d.my, 260), window.innerHeight - 32);
    setSize({ w: Math.round(w), h: Math.round(h) });
  }

  function onResizeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (size) {
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(size));
      } catch {
        /* localStorage 不可用时静默跳过 */
      }
    }
  }

  function onDragStart(e: ReactPointerEvent<HTMLDivElement>) {
    // 关闭按钮让位给点击；仅左键
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    dragRef.current = { mx: e.clientX, my: e.clientY, bx: pos.x, by: pos.y, left0: r.left - pos.x, top0: r.top - pos.y, w: r.width };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDragMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    // 钳制：面板距左右/上至少 8px，且顶栏至少留 56px 在视口内（保证还能拖回来）
    const minLeft = 8 - d.left0;
    const maxLeft = Math.max(minLeft, window.innerWidth - 8 - d.w);
    const minTop = 8 - d.top0;
    const maxTop = Math.max(minTop, window.innerHeight - 56 - d.top0);
    setPos({
      x: Math.min(Math.max(d.bx + e.clientX - d.mx, minLeft), maxLeft),
      y: Math.min(Math.max(d.by + e.clientY - d.my, minTop), maxTop),
    });
  }

  function onDragEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // 文件夹下拉选项（按父层级展开排列，附带缩进深度）
  const options = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const depth = (f: Folder): number => {
      let d = 0;
      let cur: Folder | undefined = f;
      while (cur?.parentId) {
        d++;
        cur = byId.get(cur.parentId);
      }
      return d;
    };
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (parentId: string | null) => {
      for (const f of folders.filter((x) => x.parentId === parentId)) {
        out.push({ id: f.id, name: f.name, depth: depth(f) });
        walk(f.id);
      }
    };
    walk(null);
    return out;
  }, [folders]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!title.trim()) return setError("标题不能为空");
    if (!content.trim()) return setError("内容不能为空");
    setSaving(true);
    setError("");
    const payload = {
      title: title.trim(),
      content: content.trim(),
      notes: notes.trim(),
      source: source.trim(),
      sourceColor: sourceColor.trim(),
      folderId: folderId || null,
    };
    try {
      const res =
        mode === "create"
          ? await api<{ entry: Entry }>("/api/entries", { method: "POST", body: JSON.stringify(payload) })
          : await api<{ entry: Entry }>(`/api/entries/${entry!.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
      onSaved(res.entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  }

  // 内容类型实时识别：徽章展示在编辑器标题行右侧
  const kind = detectKind(content);
  const KindIcon = KIND_ICONS[kind] ?? TextIcon;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        style={{ width: size?.w, height: size?.h, transform: `translate(${pos.x}px, ${pos.y}px)` }}
        className={`mn-pop relative flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface p-6 shadow-2xl ${size ? "" : "w-full max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 标题栏：整条即拖动把手（关闭按钮除外），位置钳制在视口内 */}
        <div
          className="mb-4 flex shrink-0 touch-none cursor-grab items-center justify-between select-none active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <h2 className="text-sm font-medium text-muted-foreground">{mode === "create" ? "新建条目" : "编辑条目"}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <XIcon />
          </button>
        </div>
        <form
          id={FORM_ID}
          ref={formRef}
          onSubmit={onSubmit}
          onKeyDown={(e) => {
            // Ctrl/⌘ + Enter 表单内任意焦点处保存
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto"
        >
          {/* 标题：无边框页头式，搜索/识别用；大号但不与内容抢框 */}
          <div className="shrink-0">
            <input
              ref={ref}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给这条起个名…"
              aria-label="标题"
              className="w-full border-b border-transparent bg-transparent pb-1 text-lg font-semibold outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-brand/40"
            />
          </div>
          {/* 内容：被复制的主 payload，占最大区；下沉编辑器卡 + 强焦点环 + 实时识别徽章 */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground">内容</label>
              {content.trim() ? (
                <span className="flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand-foreground">
                  <KindIcon width={12} height={12} />
                  {kindLabel(kind)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">链接 / 路径 / 命令 / 代码</span>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border-base bg-background transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder={"https://…\nD:\\projects\\demo\npnpm dev\nssh root@…"}
                className="min-h-[8rem] w-full flex-1 resize-none rounded-xl bg-transparent px-3 py-2.5 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <p className="mt-1 shrink-0 text-xs text-muted-foreground">会自动识别类型并生成对应的复制按钮</p>
          </div>
          {/* 补充信息：备注 + 来源 + 文件夹降级为底部一个分组，视觉变轻 */}
          <div className="shrink-0 rounded-xl border border-border-base bg-surface-muted/50 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">补充信息（可选）</p>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注：用途、注意事项等"
              aria-label="备注"
              className="w-full border-b border-border-base bg-transparent pb-1.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-brand"
            />
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">来源</p>
                <SourceSelect
                  value={source}
                  color={sourceColor}
                  onCommit={(v, c) => {
                    setSource(v);
                    setSourceColor(c);
                  }}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">文件夹</p>
                <FolderSelect value={folderId} options={options} onChange={setFolderId} />
              </div>
            </div>
          </div>
        </form>
        {error && <p className="mt-2 shrink-0 text-sm text-red-500">{error}</p>}
        {/* 底部：快捷键提示条（与列表页提示条同款）+ 操作按钮；在滚动区外，面板缩小也始终可见 */}
        <div className="@container mt-4 flex shrink-0 items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
            <span>保存</span>
            {/* 辅助说明：按面板宽度显隐（@container 非视口），窄面板直接隐藏避免换行撑高挤压底部 */}
            <span className="mx-0.5 hidden text-muted-foreground/60 @md:inline">·</span>
            <span className="hidden @md:inline">拖标题栏移动 · 右下角缩放</span>
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-base px-4 py-2 text-sm text-foreground hover:bg-surface-muted"
            >
              取消
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-on hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
        {/* 缩放手柄：右缘调宽 / 底缘调高 / 右下角双向，结束后持久化尺寸 */}
        <div
          aria-hidden
          className="absolute top-8 right-0 bottom-8 w-1.5 cursor-ew-resize touch-none"
          onPointerDown={(e) => onResizeStart(e, "x")}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-8 right-8 h-1.5 cursor-ns-resize touch-none"
          onPointerDown={(e) => onResizeStart(e, "y")}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
        />
        <div
          aria-hidden
          className="absolute right-0 bottom-0 flex h-4 w-4 cursor-nwse-resize touch-none items-end justify-end p-[3px] text-muted-foreground/40 hover:text-muted-foreground"
          onPointerDown={(e) => onResizeStart(e, "xy")}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
            <path d="M8 2 2 8M8 5.5 5.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** 提示条键帽：与列表页提示条同款（11px 常规字体、细边框、低对比） */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex shrink-0 items-center justify-center rounded border border-border-base bg-surface px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

/** 自定义来源下拉：预设类别 + 自定义文本（可选颜色）；Esc 仅关闭下拉不关弹窗 */
function SourceSelect({
  value,
  color,
  onCommit,
}: {
  value: string;
  color: string;
  onCommit(v: string, color: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("");
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (customMode) customRef.current?.focus();
  }, [customMode]);

  // Esc 仅关闭下拉（capture 阶段拦截，避免冒泡到弹窗的关闭监听）
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open]);

  const st = value ? sourceStyle(value, color) : null;
  const itemCls = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
      active ? "bg-brand-soft font-medium text-brand-foreground" : "text-foreground hover:bg-surface-muted"
    }`;

  function startCustom() {
    // 编辑已有自定义来源时带出名称与颜色
    setDraft(value && !SOURCE_PRESETS.includes(value) ? value : "");
    setDraftColor(color);
    setCustomMode(true);
  }

  function saveCustom() {
    const v = draft.trim();
    if (!v) return;
    onCommit(v, draftColor);
    setCustomMode(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setCustomMode(false);
        }}
        className="flex w-full items-center gap-2 rounded-lg border border-border-base bg-surface px-3 py-2 text-sm outline-none transition-colors hover:border-brand/50 focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        {st ? (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} style={st.dotStyle} />
            <span className="min-w-0 flex-1 truncate text-left">{value}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">未设置</span>
        )}
        <ChevronDownIcon
          width={14}
          height={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* 面板 overflow-hidden 会裁切浮层：来源在表单下部，改为向上弹出 */}
          <div
            role="listbox"
            className="mn-pop absolute bottom-full z-50 mb-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border-base bg-surface p-1 shadow-lg"
          >
            {customMode ? (
              <div className="p-1">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={customRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveCustom();
                      }
                    }}
                    placeholder="例如：同事老王、掘金文章…"
                    className="min-w-0 flex-1 rounded-md border border-border-base bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={saveCustom}
                    disabled={!draft.trim()}
                    className="shrink-0 rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-on disabled:opacity-50"
                  >
                    确定
                  </button>
                </div>
                {/* 自定义来源色板：点选设置颜色，再次点击取消（自动按名称配色） */}
                <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                  {SOURCE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={draftColor === c ? "取消选择此颜色" : `选择颜色 ${c}`}
                      onClick={() => setDraftColor(draftColor === c ? "" : c)}
                      className="h-5 w-5 shrink-0 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        boxShadow:
                          draftColor === c
                            ? "0 0 0 2px var(--surface), 0 0 0 4px var(--foreground)"
                            : undefined,
                      }}
                    />
                  ))}
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">不选则自动配色</span>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ""}
                  onClick={() => {
                    onCommit("", "");
                    setOpen(false);
                  }}
                  className={itemCls(value === "")}
                >
                  <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">不设置</span>
                  {value === "" && <CheckIcon width={14} height={14} className="shrink-0 text-brand" />}
                </button>
                {SOURCE_PRESETS.map((p) => {
                  const s = sourceStyle(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      role="option"
                      aria-selected={value === p}
                      onClick={() => {
                        onCommit(p, "");
                        setOpen(false);
                      }}
                      className={itemCls(value === p)}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} style={s.dotStyle} />
                      <span className="min-w-0 flex-1 truncate text-left">{p}</span>
                      {value === p && <CheckIcon width={14} height={14} className="shrink-0 text-brand" />}
                    </button>
                  );
                })}
                <div className="mx-2 my-1 border-t border-border-base" />
                <button type="button" onClick={startCustom} className={itemCls(false)}>
                  <PencilIcon width={14} height={14} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-left">自定义来源…</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 自定义文件夹下拉：与全局设计语言一致的圆角浮层，替代原生 select */
function FolderSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; name: string; depth: number }[];
  onChange(v: string): void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);

  // Esc 仅关闭下拉（capture 阶段拦截，避免冒泡到弹窗的关闭监听）
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open]);

  const itemCls = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
      active ? "bg-brand-soft font-medium text-brand-foreground" : "text-foreground hover:bg-surface-muted"
    }`;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-border-base bg-surface px-3 py-2 text-sm outline-none transition-colors hover:border-brand/50 focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        <span className={current ? "truncate" : "text-muted-foreground"}>
          {current ? current.name : "未分类"}
        </span>
        <ChevronDownIcon
          width={14}
          height={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* 面板 overflow-hidden 会裁切浮层：文件夹是末位字段，改为向上弹出 */}
          <div
            role="listbox"
            className="mn-pop absolute bottom-full z-50 mb-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border-base bg-surface p-1 shadow-lg"
          >
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={itemCls(value === "")}
              style={{ paddingLeft: 12 }}
            >
              <span className="min-w-0 flex-1 truncate text-left">未分类</span>
              {value === "" && <CheckIcon width={14} height={14} className="shrink-0 text-brand" />}
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={value === o.id}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={itemCls(value === o.id)}
                style={{ paddingLeft: 12 + o.depth * 16 }}
              >
                <span className="min-w-0 flex-1 truncate text-left">{o.name}</span>
                {value === o.id && <CheckIcon width={14} height={14} className="shrink-0 text-brand" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
