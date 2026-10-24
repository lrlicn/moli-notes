"use client";

// 文件夹树：递归渲染、折叠展开、拖拽移动、内联重命名/新建、右键菜单
import { useEffect, useMemo, useRef, useState } from "react";
import { ENTRY_DRAG_TYPE, type Folder } from "@/lib/types";
import Tip from "./Tip";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UnfoldLessIcon,
  UnfoldMoreIcon,
} from "./icons";

interface TreeProps {
  folders: Folder[];
  selectedId: string | null;
  counts: Record<string, number>;
  onSelect(id: string): void;
  onCreate(name: string, parentId: string | null): Promise<void>;
  onRename(id: string, name: string): Promise<void>;
  onDelete(id: string): Promise<void>;
  onMove(id: string, parentId: string | null): Promise<void>;
  /** 拖拽排序：把 id 插到 targetId 的前/后（target 父级为新层级，跨层级一次完成） */
  onReorder(id: string, targetId: string, position: "before" | "after"): Promise<void>;
  /** 条目卡片拖入文件夹节点：移动条目归属 */
  onDropEntry(entryId: string, folderId: string | null): void;
}

const DRAG_TYPE = "text/mn-folder";
/** 文件夹节点拖放分区：上/下边缘=排序，中间=成为子级 */
type DropZone = "before" | "into" | "after";

export default function FolderTree(props: TreeProps) {
  const { folders } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creatingIn, setCreatingIn] = useState<string | "root" | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // 文件夹拖拽悬停：记录目标节点与分区（before/after=排序提示线，into=成为子级）
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: DropZone } | null>(null);
  // 拖拽经过根区域空白处：松手可把文件夹移到顶层
  const [dragOverRoot, setDragOverRoot] = useState(false);

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    }
    return map;
  }, [folders]);

  // 有子级的文件夹 id 集合（全部展开/收起用）
  const parentIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of folders) if (f.parentId) set.add(f.parentId);
    return set;
  }, [folders]);
  const hasCollapsed = [...parentIds].some((id) => collapsed.has(id));

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startCreate(parentId: string | "root") {
    setCreatingIn(parentId);
    setRenamingId(null);
    setMenuFor(null);
  }

  function startRename(f: Folder) {
    setRenamingId(f.id);
    setDraft(f.name);
    setMenuFor(null);
  }

  async function saveRename() {
    const id = renamingId;
    const name = draft.trim();
    setRenamingId(null);
    if (id && name) await props.onRename(id, name);
  }

  const roots = childrenMap.get(null) ?? [];

  function renderNode(f: Folder, depth: number) {
    const children = childrenMap.get(f.id) ?? [];
    const expanded = !collapsed.has(f.id);
    const selected = props.selectedId === f.id;
    const count = props.counts[f.id] ?? 0;
    const zone = dropTarget?.id === f.id ? dropTarget.zone : null;
    return (
      <div key={f.id}>
        <div
          className={`group relative flex items-center gap-1 rounded-lg pr-1 text-sm transition-colors ${
            selected
              ? "bg-brand-soft text-brand-foreground font-medium"
              : "text-foreground hover:bg-surface"
          } ${zone === "into" ? "ring-2 ring-brand" : ""}`}
          style={{ paddingLeft: 4 + depth * 16 }}
          draggable={renamingId !== f.id}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, f.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            // 兜底清理：子节点 onDrop 会 stopPropagation，容器的 drop 清理收不到；
            // dragend 在拖拽源元素上必然触发（正常落下/Esc 取消/拖出窗口均覆盖）
            setDragOverRoot(false);
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            // 同时接受文件夹拖拽（层级/排序）与条目卡片拖拽（移动归属）
            const t = e.dataTransfer.types;
            if (!t.includes(DRAG_TYPE) && !t.includes(ENTRY_DRAG_TYPE)) return;
            e.preventDefault();
            e.stopPropagation();
            if (!t.includes(DRAG_TYPE)) {
              setDropTarget({ id: f.id, zone: "into" });
              return;
            }
            // 三区判定：上/下边缘=插到前/后（排序），中间=成为子级
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientY - rect.top) / rect.height;
            const z: DropZone = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into";
            setDropTarget({ id: f.id, zone: z });
          }}
          onDragLeave={() => setDropTarget((cur) => (cur?.id === f.id ? null : cur))}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const zone0 = dropTarget?.id === f.id ? dropTarget.zone : null;
            setDropTarget(null);
            const folderDragId = e.dataTransfer.getData(DRAG_TYPE);
            if (folderDragId) {
              if (folderDragId === f.id) return;
              if (zone0 === "before" || zone0 === "after") props.onReorder(folderDragId, f.id, zone0);
              else props.onMove(folderDragId, f.id);
              return;
            }
            const entryId = e.dataTransfer.getData(ENTRY_DRAG_TYPE);
            if (entryId) props.onDropEntry(entryId, f.id);
          }}
        >
          {/* 排序提示线：拖到节点上/下边缘时显示插入位置 */}
          {zone === "before" && <span className="pointer-events-none absolute inset-x-1 top-0 h-0.5 rounded-full bg-brand" />}
          {zone === "after" && <span className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand" />}
          <button
            type="button"
            aria-label={expanded ? "折叠" : "展开"}
            onClick={() => toggle(f.id)}
            className={`shrink-0 p-0.5 text-muted-foreground hover:text-foreground ${
              children.length ? "" : "invisible"
            }`}
          >
            {expanded ? <ChevronDownIcon width={15} height={15} /> : <ChevronRightIcon width={15} height={15} />}
          </button>
          {renamingId === f.id ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              onBlur={saveRename}
              className="my-0.5 min-w-0 flex-1 rounded-md border border-brand bg-surface px-1.5 py-0.5 text-sm outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => props.onSelect(f.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
            >
              <FolderIcon width={16} height={16} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
            </button>
          )}
          {count > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
          )}
          <Tip label="文件夹操作" side="left">
            <button
              type="button"
              aria-label="文件夹操作"
              onClick={(e) => {
                e.stopPropagation();
                setMenuFor(menuFor === f.id ? null : f.id);
              }}
              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <MoreIcon width={15} height={15} />
            </button>
          </Tip>

          {menuFor === f.id && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
              <div className="mn-pop absolute right-1 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-border-base bg-surface py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => startCreate(f.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-muted"
                >
                  <FolderPlusIcon width={14} height={14} /> 新建子文件夹
                </button>
                <button
                  type="button"
                  onClick={() => startRename(f)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-muted"
                >
                  <PencilIcon width={14} height={14} /> 重命名
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    props.onDelete(f.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-surface-muted"
                >
                  <TrashIcon width={14} height={14} /> 删除
                </button>
              </div>
            </>
          )}
        </div>

        {expanded && (
          <div>
            {children.map((c) => renderNode(c, depth + 1))}
            {creatingIn === f.id && (
              <div style={{ paddingLeft: 18 + depth * 14 }} className="py-0.5 pr-1">
                <InlineInput
                  onCancel={() => setCreatingIn(null)}
                  onSave={async (name) => {
                    setCreatingIn(null);
                    await props.onCreate(name, f.id);
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      next.delete(f.id);
                      return next;
                    });
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-2 pb-1 pt-4">
        <span className="text-xs font-medium text-muted-foreground">文件夹</span>
        <span className="flex items-center gap-0.5">
          {parentIds.size > 0 && (
            <Tip label={hasCollapsed ? "全部展开" : "全部收起"} align="end">
              <button
                type="button"
                aria-label={hasCollapsed ? "全部展开" : "全部收起"}
                onClick={() => setCollapsed(hasCollapsed ? new Set() : new Set(parentIds))}
                className="rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                {hasCollapsed ? <UnfoldMoreIcon width={14} height={14} /> : <UnfoldLessIcon width={14} height={14} />}
              </button>
            </Tip>
          )}
          <Tip label="新建文件夹" align="end">
            <button
              type="button"
              aria-label="新建根文件夹"
              onClick={() => startCreate("root")}
              className="rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <PlusIcon width={14} height={14} />
            </button>
          </Tip>
        </span>
      </div>
      <div
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2 px-1"
        style={
          dragOverRoot
            ? { outline: "2px dashed var(--brand)", outlineOffset: -4, borderRadius: 12 }
            : undefined
        }
        onDragOver={(e) => {
          // 仅接受文件夹拖拽（空白处松手=移到顶层）；条目拖拽只在文件夹节点上接收
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setDragOverRoot(true);
        }}
        onDragLeave={(e) => {
          // 仅当真正离开容器（而非在子节点间移动）时清除虚线提示
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverRoot(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setDragOverRoot(false);
          const dragId = e.dataTransfer.getData(DRAG_TYPE);
          if (dragId) props.onMove(dragId, null);
        }}
      >
        {roots.map((f) => renderNode(f, 0))}
        {creatingIn === "root" && (
          <div className="px-1 py-0.5">
            <InlineInput
              onCancel={() => setCreatingIn(null)}
              onSave={async (name) => {
                setCreatingIn(null);
                await props.onCreate(name, null);
              }}
            />
          </div>
        )}
        {roots.length === 0 && creatingIn === null && (
          <p className="px-2 py-2 text-xs leading-5 text-muted-foreground">
            还没有文件夹，点击右上角 + 新建
          </p>
        )}
      </div>
    </div>
  );
}

function InlineInput({
  onSave,
  onCancel,
}: {
  onSave(name: string): void | Promise<void>;
  onCancel(): void;
}) {
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  useEffect(() => ref.current?.focus(), []);
  return (
    <input
      ref={ref}
      value={v}
      placeholder="文件夹名称"
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim() && !saving.current) {
          saving.current = true;
          onSave(v.trim());
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (v.trim() && !saving.current) {
          saving.current = true;
          onSave(v.trim());
        } else if (!v.trim()) {
          onCancel();
        }
      }}
      className="w-full rounded-md border border-brand bg-surface px-2 py-1 text-sm outline-none"
    />
  );
}
