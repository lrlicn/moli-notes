"use client";

// 主界面容器：状态编排、数据加载、复制/置顶/删除、弹窗与搜索面板
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, copyText } from "@/lib/client";
import { kindLabel } from "@/lib/detect";
import type { Entry, EntryKind, Folder } from "@/lib/types";
import Sidebar, { type FolderCounts } from "./Sidebar";
import EntryCard from "./EntryCard";
import DeletedList from "./DeletedList";
import EntryDialog from "./EntryDialog";
import CommandPalette from "./CommandPalette";
import ConfirmDialog from "./ConfirmDialog";
import Toast from "./Toast";
import Tip from "./Tip";
import { InboxIcon, MenuIcon, PlusIcon, XIcon } from "./icons";

type Scope =
  | { type: "all" }
  | { type: "unsorted" }
  | { type: "folder"; id: string }
  | { type: "source"; value: string }
  | { type: "kind"; value: EntryKind }
  | { type: "deleted" }
  | { type: "entry"; entry: Entry };
type DialogState = { mode: "create"; folderId: string | null } | { mode: "edit"; entry: Entry } | null;

export default function AppShell({ ownerLabel }: { ownerLabel?: string }) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<FolderCounts>({ byFolder: {}, unsorted: 0, total: 0, trash: 0, totalCopies: 0 });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scope, setScope] = useState<Scope>({ type: "all" });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  // 复制去重窗口：记录最近一次复制的条目与时间（10 秒内同条目重复复制不重复计数）
  const lastCopyRef = useRef<{ id: string; at: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; action?: { label: string; onClick(): void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback(
    (text: string, action?: { label: string; onClick(): void }, duration = 2000) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ id: Date.now(), text, action });
      toastTimer.current = setTimeout(() => setToast(null), duration);
    },
    []
  );

  const fetchFolders = useCallback(async () => {
    const r = await api<{ folders: Folder[]; counts: FolderCounts }>("/api/folders");
    setFolders(r.folders);
    setCounts(r.counts);
  }, []);

  const fetchEntries = useCallback(async (s: Scope) => {
    // 单条目视图：数据已在 scope 内，无需请求
    if (s.type === "entry") {
      setEntries([s.entry]);
      setLoading(false);
      setListError("");
      return;
    }
    setLoading(true);
    setListError("");
    try {
      const p = new URLSearchParams();
      if (s.type === "unsorted") p.set("folderId", "");
      else if (s.type === "folder") p.set("folderId", s.id);
      else if (s.type === "source") p.set("source", s.value);
      else if (s.type === "kind") p.set("kind", s.value);
      else if (s.type === "deleted") p.set("deleted", "1");
      const r = await api<{ entries: Entry[] }>(`/api/entries?${p.toString()}`);
      setEntries(r.entries);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 挂载时加载文件夹与计数（在 Promise 回调中更新状态，避免 effect 内同步 setState）
  useEffect(() => {
    let alive = true;
    api<{ folders: Folder[]; counts: FolderCounts }>("/api/folders")
      .then((r) => {
        if (alive) {
          setFolders(r.folders);
          setCounts(r.counts);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 作用域变化时加载对应条目列表（单条目视图不需要加载，渲染期直接派生）
  useEffect(() => {
    if (scope.type === "entry") return;
    let alive = true;
    const p = new URLSearchParams();
    if (scope.type === "unsorted") p.set("folderId", "");
    else if (scope.type === "folder") p.set("folderId", scope.id);
    else if (scope.type === "source") p.set("source", scope.value);
    else if (scope.type === "kind") p.set("kind", scope.value);
    else if (scope.type === "deleted") p.set("deleted", "1");
    api<{ entries: Entry[] }>(`/api/entries?${p.toString()}`)
      .then((r) => {
        if (alive) {
          setEntries(r.entries);
          setListError("");
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setListError(err instanceof Error ? err.message : "加载失败");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  // Ctrl/Cmd + K 打开搜索
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchFolders(), fetchEntries(scope)]);
  }, [fetchFolders, fetchEntries, scope]);

  // ---------- 条目操作 ----------

  const copyEntry = useCallback(
    async (entry: Entry, content?: string) => {
      const ok = await copyText(content ?? entry.content);
      if (ok) {
        showToast("已复制到剪贴板");
        // 10 秒去重窗口：同一条目连点只算一次复制（与服务端 touch 的判据一致）
        const now = Date.now();
        const counted = !(lastCopyRef.current?.id === entry.id && now - lastCopyRef.current.at < 10_000);
        lastCopyRef.current = { id: entry.id, at: now };
        if (counted) {
          api(`/api/entries/${entry.id}/touch`, { method: "POST" }).catch(() => {});
          // 侧边栏身份卡副行「已帮你复制 N 次」本地即时 +1（与 touch 去重窗口一致）
          setCounts((c) => ({ ...c, totalCopies: c.totalCopies + 1 }));
        }
        // 本地更新最近使用时间与复制次数（窗口内不重复 +1），不重排当前列表（避免跳动）
        const stamped = {
          ...entry,
          lastUsedAt: new Date().toISOString(),
          copyCount: counted ? (entry.copyCount ?? 0) + 1 : (entry.copyCount ?? 0),
        };
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? stamped : e)));
        // 单条目视图同步刷新 scope 内的数据，保持卡片显示一致
        setScope((s) => (s.type === "entry" && s.entry.id === entry.id ? { type: "entry", entry: stamped } : s));
      } else {
        showToast("复制失败，请手动复制");
      }
    },
    [showToast]
  );

  const togglePin = useCallback(
    async (entry: Entry) => {
      const pinned = !entry.pinned;
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, pinned } : e)));
      setScope((s) => (s.type === "entry" && s.entry.id === entry.id ? { type: "entry", entry: { ...s.entry, pinned } } : s));
      try {
        await api(`/api/entries/${entry.id}`, { method: "PATCH", body: JSON.stringify({ pinned }) });
        // 服务端按置顶优先排序，重新拉取让卡片立即置顶/取消置顶（闭包里的 scope 需同步 pinned 修正）
        const s = scope;
        await fetchEntries(s.type === "entry" && s.entry.id === entry.id ? { ...s, entry: { ...s.entry, pinned } } : s);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "操作失败");
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, pinned: !pinned } : e)));
        setScope((s) => (s.type === "entry" && s.entry.id === entry.id ? { type: "entry", entry: { ...s.entry, pinned: !pinned } } : s));
      }
    },
    [showToast, fetchEntries, scope]
  );

  const deleteEntry = useCallback(
    async (entry: Entry) => {
      // 软删除：立即移入「最近删除」（可恢复），UI 乐观移除
      setScope((s) => (s.type === "entry" && s.entry.id === entry.id ? { type: "all" } : s));
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      showToast(`已移到最近删除：「${entry.title}」`);
      // 先等删除完成再刷新计数，避免并发时拿到删除前的 trash 数
      try {
        await api(`/api/entries/${entry.id}`, { method: "DELETE" });
      } catch {}
      fetchFolders().catch(() => {});
    },
    [fetchFolders, showToast]
  );

  // 从最近删除恢复
  const restoreEntry = useCallback(
    async (entryId: string) => {
      try {
        await api(`/api/entries/${entryId}`, { method: "PATCH", body: JSON.stringify({ restore: true }) });
        showToast("已恢复");
        await Promise.all([fetchFolders(), fetchEntries(scope)]);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "恢复失败");
      }
    },
    [fetchEntries, fetchFolders, scope, showToast]
  );

  // 彻底删除（不可恢复）——确认弹窗由统一 confirm state 触发
  const purgeEntry = useCallback(
    async (entry: Entry) => {
      try {
        await api(`/api/entries/${entry.id}?purge=1`, { method: "DELETE" });
        showToast(`已彻底删除「${entry.title}」`);
        await Promise.all([fetchFolders(), fetchEntries(scope)]);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "删除失败");
      }
    },
    [fetchEntries, fetchFolders, scope, showToast]
  );

  // ---------- 文件夹操作 ----------

  const createFolder = useCallback(
    async (name: string, parentId: string | null) => {
      try {
        await api("/api/folders", { method: "POST", body: JSON.stringify({ name, parentId }) });
        await fetchFolders();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "创建失败");
      }
    },
    [fetchFolders, showToast]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      try {
        await api(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
        await refreshAll();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "重命名失败");
      }
    },
    [refreshAll, showToast]
  );

  // 确认弹窗（统一替代 window.confirm）：存确认动作，确认后执行
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    action: () => void | Promise<void>;
  } | null>(null);

  const deleteFolder = useCallback(
    async (id: string) => {
      setConfirm({
        title: "删除文件夹",
        message: "确定删除该文件夹吗？（仅允许删除空文件夹）",
        action: async () => {
          try {
            await api(`/api/folders/${id}`, { method: "DELETE" });
            if (scope.type === "folder" && scope.id === id) setScope({ type: "all" });
            else await refreshAll();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "删除失败");
          }
        },
      });
    },
    [refreshAll, scope, showToast]
  );

  const moveFolder = useCallback(
    async (id: string, parentId: string | null) => {
      try {
        await api(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify({ parentId }) });
        await fetchFolders();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "移动失败");
      }
    },
    [fetchFolders, showToast]
  );

  // 拖拽排序：把 id 插到 targetId 前/后（target 的父级为新层级，跨层级一次完成）
  const reorderFolder = useCallback(
    async (id: string, targetId: string, position: "before" | "after") => {
      const drag = folders.find((f) => f.id === id);
      const target = folders.find((f) => f.id === targetId);
      if (!drag || !target || id === targetId) return;
      // 防环：新父级（target 的父级）不能在 drag 的祖先链上
      const byId = new Map(folders.map((f) => [f.id, f]));
      let cur = byId.get(targetId);
      while (cur?.parentId) {
        if (cur.parentId === id) {
          showToast("不能移动到自身子文件夹内");
          return;
        }
        cur = byId.get(cur.parentId);
      }
      // 新同级序列：去掉被拖项后按目标位置插回
      const parentId = target.parentId ?? null;
      const siblings = folders
        .filter((f) => (f.parentId ?? null) === parentId && f.id !== id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = siblings.findIndex((f) => f.id === targetId);
      siblings.splice(position === "before" ? idx : idx + 1, 0, drag);
      try {
        await api("/api/folders/reorder", {
          method: "POST",
          body: JSON.stringify({ items: siblings.map((f, i) => ({ id: f.id, parentId, sortOrder: i + 1 })) }),
        });
        await fetchFolders();
        showToast(`已移动「${drag.name}」`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "移动失败");
      }
    },
    [fetchFolders, folders, showToast]
  );

  // 条目卡片拖到侧边栏文件夹/未分类：改归属并刷新列表与计数
  const moveEntryToFolder = useCallback(
    async (entryId: string, folderId: string | null) => {
      try {
        await api(`/api/entries/${entryId}`, { method: "PATCH", body: JSON.stringify({ folderId }) });
        const target = folderId ? folders.find((f) => f.id === folderId)?.name : null;
        showToast(target ? `已移动到「${target}」` : "已移出文件夹");
        await Promise.all([fetchFolders(), fetchEntries(scope)]);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "移动失败");
      }
    },
    [fetchEntries, fetchFolders, folders, scope, showToast]
  );

  // ---------- 会话 ----------

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  // ---------- 数据备份 ----------

  const exportData = useCallback(() => {
    // 通过临时 <a> 触发下载（同源请求自动携带会话 Cookie，非页面导航）
    const a = document.createElement("a");
    a.href = "/api/export";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const importData = useCallback(
    async (file: File) => {
      if (!window.confirm(`导入「${file.name}」？相同 ID 的数据会被备份内容覆盖。`)) return;
      try {
        const data = JSON.parse(await file.text());
        const r = await api<{ imported: number; folders: number }>("/api/import", {
          method: "POST",
          body: JSON.stringify(data),
        });
        await refreshAll();
        showToast(`导入成功：${r.folders} 个文件夹、${r.imported} 条条目`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "导入失败，请检查备份文件");
      }
    },
    [refreshAll, showToast]
  );

  const scopeTitle =
    scope.type === "all"
      ? "全部条目"
      : scope.type === "unsorted"
        ? "未分类"
        : scope.type === "source"
          ? `来源：${scope.value}`
          : scope.type === "kind"
              ? `类型：${kindLabel(scope.value)}`
              : scope.type === "deleted"
                ? "最近删除"
                : scope.type === "entry"
                  ? scope.entry.title
                  : folders.find((f) => f.id === scope.id)?.name ?? "文件夹";

  // 单条目视图：渲染期派生，不走加载
  const visibleEntries = scope.type === "entry" ? [scope.entry] : entries;

  const sidebar = (
    <Sidebar
      folders={folders}
      counts={counts}
      scope={scope}
      onSelectAll={() => {
        setScope({ type: "all" });
        setSidebarOpen(false);
      }}
      onSelectUnsorted={() => {
        setScope({ type: "unsorted" });
        setSidebarOpen(false);
      }}
      onSelectDeleted={() => {
        setScope({ type: "deleted" });
        setSidebarOpen(false);
      }}
      onSelectFolder={(id) => {
        setScope({ type: "folder", id });
        setSidebarOpen(false);
      }}
      onCreateFolder={createFolder}
      onRenameFolder={renameFolder}
      onDeleteFolder={deleteFolder}
      onMoveFolder={moveFolder}
      onReorderFolder={reorderFolder}
      onDropEntry={moveEntryToFolder}
      onOpenSearch={() => {
        setPaletteOpen(true);
        setSidebarOpen(false);
      }}
      onToggleTheme={() => {
        const root = document.documentElement;
        const dark = root.classList.toggle("dark");
        try {
          localStorage.setItem("mn-theme", dark ? "dark" : "light");
        } catch {}
      }}
      onLogout={logout}
      onExport={exportData}
      onImport={() => importRef.current?.click()}
      ownerLabel={ownerLabel}
      onCloseMobile={sidebarOpen ? () => setSidebarOpen(false) : undefined}
    />
  );

  return (
    <div className="mn-safe flex h-dvh gap-2 overflow-hidden p-2">
      {/* 桌面侧边栏 */}
      <div className="hidden xl:block">{sidebar}</div>

      {/* 移动端抽屉 */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[82vw] p-2 xl:hidden">{sidebar}</div>
        </>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface">
        <header className="flex items-center gap-2.5 px-5 py-3.5">
          <Tip label="打开侧边栏">
            <button
              type="button"
              aria-label="打开菜单"
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground xl:hidden"
            >
              <MenuIcon />
            </button>
          </Tip>
          <h1 className="truncate text-lg font-semibold">{scopeTitle}</h1>
          {(scope.type === "source" || scope.type === "kind" || scope.type === "deleted" || scope.type === "entry") && (
            <Tip
              label={
                scope.type === "source"
                  ? "清除来源筛选"
                  : scope.type === "kind"
                    ? "清除类型筛选"
                    : "返回全部条目"
              }
            >
              <button
                type="button"
                aria-label="清除筛选"
                onClick={() => setScope({ type: "all" })}
                className="rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <XIcon width={14} height={14} />
              </button>
            </Tip>
          )}
          <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {visibleEntries.length}
          </span>
          <button
            type="button"
            onClick={() => setDialog({ mode: "create", folderId: scope.type === "folder" ? scope.id : null })}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-on transition-opacity hover:opacity-90"
          >
            <PlusIcon width={15} height={15} />
            新建条目
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {listError && (
            <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              {listError}
            </p>
          )}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-5 py-28 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-soft text-brand">
                <InboxIcon width={40} height={40} />
              </span>
              <div className="space-y-1.5">
                <p className="text-lg font-medium">
                  {scope.type === "all"
                    ? "还没有任何条目"
                    : scope.type === "deleted"
                      ? "最近删除是空的"
                      : "这个位置还没有条目"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {scope.type === "all"
                    ? "把常用的网址、路径、命令存进来，需要时秒查秒复制"
                    : scope.type === "deleted"
                      ? "删除的条目会先放到这里，可随时恢复"
                      : "新建一条速查信息试试"}
                </p>
              </div>
              {scope.type !== "deleted" && (
                <button
                  type="button"
                  onClick={() => setDialog({ mode: "create", folderId: scope.type === "folder" ? scope.id : null })}
                  className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-medium text-brand-on transition-opacity hover:opacity-90"
                >
                  <PlusIcon width={16} height={16} />
                  记录第一条速查信息
                </button>
              )}
            </div>
          ) : scope.type === "deleted" ? (
            <DeletedList
              entries={visibleEntries}
              onRestore={restoreEntry}
              onPurge={(e) =>
                setConfirm({
                  title: "彻底删除条目",
                  message: `「${e.title}」将被永久移除，此操作不可恢复。`,
                  confirmLabel: "彻底删除",
                  danger: true,
                  action: () => purgeEntry(e),
                })
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleEntries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  onCopy={copyEntry}
                  onTogglePin={togglePin}
                  onEdit={(entry) => setDialog({ mode: "edit", entry })}
                  onDelete={deleteEntry}
                  onSourceClick={(source) => setScope({ type: "source", value: source })}
                  onKindClick={(kind) => setScope({ type: "kind", value: kind })}
                  onCopyLine={(entry, line) => copyEntry(entry, line)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            void c.action();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onView={(entry) => setScope({ type: "entry", entry })}
          onCopied={(entry) => {
            showToast("已复制到剪贴板");
            api(`/api/entries/${entry.id}/touch`, { method: "POST" }).catch(() => {});
            fetchEntries(scope).catch(() => {});
          }}
        />
      )}

      {dialog && (
        <EntryDialog
          folders={folders}
          mode={dialog.mode}
          entry={dialog.mode === "edit" ? dialog.entry : undefined}
          defaultFolderId={dialog.mode === "create" ? dialog.folderId : null}
          onClose={() => setDialog(null)}
          onSaved={(updated) => {
            setDialog(null);
            refreshAll();
            // 单条目视图同步为编辑后的数据，保持标题等显示一致
            setScope((s) => (s.type === "entry" && s.entry.id === updated.id ? { type: "entry", entry: updated } : s));
            showToast(dialog.mode === "create" ? "已保存" : "已更新");
          }}
        />
      )}

      {toast && <Toast key={toast.id} text={toast.text} action={toast.action} />}

      {/* 导入备份的隐藏文件选择器 */}
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importData(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
