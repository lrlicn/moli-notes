"use client";

// 新建 / 编辑条目弹窗
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/client";
import type { Entry, Folder } from "@/lib/types";
import { SOURCE_COLORS, SOURCE_PRESETS, sourceStyle } from "@/lib/source";
import { CheckIcon, ChevronDownIcon, PencilIcon, XIcon } from "./icons";

interface Props {
  folders: Folder[];
  mode: "create" | "edit";
  entry?: Entry;
  defaultFolderId: string | null;
  onClose(): void;
  onSaved(entry: Entry): void;
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

  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

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

  const inputCls =
    "w-full rounded-lg border border-border-base bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="mn-pop w-full max-w-lg rounded-2xl border border-border-base bg-surface p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{mode === "create" ? "新建条目" : "编辑条目"}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <XIcon />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-sm font-medium">标题</label>
            <input
              ref={ref}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：Tailwind CSS 文档"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">内容（链接 / 路径 / 命令 / 代码）</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder={"https://…\nD:\\projects\\demo\npnpm dev\nssh root@…"}
              className={`${inputCls} font-mono`}
            />
            <p className="mt-1 text-xs text-muted-foreground">会自动识别类型并生成对应的复制按钮</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">备注（可选）</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="用途、注意事项等"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              来源 <span className="font-normal text-muted-foreground">（记录信息从哪里来）</span>
            </label>
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
            <label className="mb-1 block text-sm font-medium">所属文件夹</label>
            <FolderSelect value={folderId} options={options} onChange={setFolderId} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-base px-4 py-2 text-sm text-foreground hover:bg-surface-muted"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-on hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
          <div
            role="listbox"
            className="mn-pop absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border-base bg-surface p-1 shadow-lg"
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
          <div
            role="listbox"
            className="mn-pop absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border-base bg-surface p-1 shadow-lg"
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
