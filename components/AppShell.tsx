"use client";

// 主界面容器：状态编排、数据加载、复制/置顶/删除、弹窗与搜索面板
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, copyText } from "@/lib/client";
import { kindLabel } from "@/lib/detect";
import type { Entry, EntryKind, Folder } from "@/lib/types";
import Sidebar, { type FolderCounts } from "./Sidebar";
import EntryPreview from "./EntryPreview";
import EntryRow from "./EntryRow";
import DeletedList from "./DeletedList";
import EntryDialog from "./EntryDialog";
import CommandPalette from "./CommandPalette";
import ConfirmDialog from "./ConfirmDialog";
import Toast from "./Toast";
import Tip from "./Tip";
import SortMenu, { type SortKey } from "./SortMenu";
import ShortcutsDialog from "./ShortcutsDialog";
import { CheckIcon, InboxIcon, MenuIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

type Scope =
  | { type: "all" }
  | { type: "unsorted" }
  | { type: "folder"; id: string }
  | { type: "source"; value: string }
  | { type: "kind"; value: EntryKind }
  | { type: "deleted" }
  | { type: "entry"; entry: Entry };
type DialogState = { mode: "create"; folderId: string | null } | { mode: "edit"; entry: Entry } | null;

// 每页加载条数（与后端 listEntries 默认一致）：无限滚动逐页累加，避免一次渲染全量卡片
const PAGE_SIZE = 60;

// 作用域 → 列表查询参数（不含分页；分页由调用处追加 limit/offset）
function buildParams(s: Scope, sort: SortKey): URLSearchParams {
  const p = new URLSearchParams();
  if (s.type === "unsorted") p.set("folderId", "");
  else if (s.type === "folder") p.set("folderId", s.id);
  else if (s.type === "source") p.set("source", s.value);
  else if (s.type === "kind") p.set("kind", s.value);
  else if (s.type === "deleted") p.set("deleted", "1");
  p.set("sort", sort);
  return p;
}

// 快捷键提示条里的键帽（Raycast 风：极轻、与说明文字同字体同字号、双主题低对比）
function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-border-base bg-surface px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

export default function AppShell({ ownerLabel }: { ownerLabel?: string }) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<FolderCounts>({ byFolder: {}, unsorted: 0, total: 0, trash: 0, totalCopies: 0 });
  const [entries, setEntries] = useState<Entry[]>([]);
  // 分页：是否还有下一页 / 正在加载下一页 / 已加载条数（作为下一页 offset）
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedRef = useRef(0);
  // 请求序号：切换作用域/排序并发时只认最新一次响应，丢弃过期响应（避免列表串到旧作用域数据）
  const reqSeqRef = useRef(0);
  // 当前作用域总条数（后端首页 COUNT 返回；顶部徽章用，分页态不偏差）
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<Scope>({ type: "all" });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  // 复制去重窗口：记录最近一次复制的条目与时间（10 秒内同条目重复复制不重复计数）
  const lastCopyRef = useRef<{ id: string; at: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 主从式：selectedId 驱动右侧预览；previewOpen 仅用于 <lg 的预览抽屉
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; action?: { label: string; onClick(): void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  // 无限滚动哨兵：列表底部的观察目标
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 排序维度（localStorage 持久化）：recent / name / copies
  const [sort, setSort] = useState<SortKey>("recent");
  // 批量多选：模式开关 + 勾选集合
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // 快捷键总览弹窗（? 唤出）
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
    const seq = ++reqSeqRef.current;
    // 单条目视图：数据已在 scope 内，无需请求
    if (s.type === "entry") {
      setEntries([s.entry]);
      setHasMore(false);
      setTotal(1);
      setLoading(false);
      setListError("");
      return;
    }
    setLoading(true);
    setListError("");
    try {
      const p = buildParams(s, sort);
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", "0");
      p.set("total", "1");
      const r = await api<{ entries: Entry[]; hasMore: boolean; total?: number }>(`/api/entries?${p.toString()}`);
      if (seq !== reqSeqRef.current) return; // 已有更新的请求，丢弃过期响应
      setEntries(r.entries);
      setHasMore(r.hasMore);
      setTotal(r.total ?? r.entries.length);
      loadedRef.current = r.entries.length;
    } catch (err) {
      if (seq !== reqSeqRef.current) return;
      setListError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }, [sort]);

  // 加载下一页并追加（无限滚动）；并发/无更多/单条目视图时短路
  const loadMore = useCallback(async () => {
    if (scope.type === "entry" || loading || loadingMore || !hasMore) return;
    const seq = ++reqSeqRef.current;
    const offset = loadedRef.current; // 已消费的服务端偏移（与展示条数解耦，删除时同步回退）
    setLoadingMore(true);
    try {
      const p = buildParams(scope, sort);
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String(offset));
      const r = await api<{ entries: Entry[]; hasMore: boolean }>(`/api/entries?${p.toString()}`);
      if (seq !== reqSeqRef.current) return; // 已有更新的请求，丢弃过期响应
      // 偏移按服务端返回页长推进；合并按 id 去重，避免删除/复制重排导致的重复条目（重复 key）
      loadedRef.current = offset + r.entries.length;
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...r.entries.filter((e) => !seen.has(e.id))];
      });
      setHasMore(r.hasMore);
    } catch {
      /* 追加失败保留已加载内容，用户可再次滚动重试 */
    } finally {
      if (seq === reqSeqRef.current) setLoadingMore(false);
    }
  }, [scope, loading, loadingMore, hasMore, sort]);

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

  // 作用域变化时重新加载首页（单条目视图渲染期直接派生，fetchEntries 内部已处理）
  useEffect(() => {
    // 切换作用域/排序时退出多选（旧勾选 id 未必存在于新结果）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    { setSelectMode(false); setChecked(new Set()); }
    // 按作用域取数属于与外部系统（后端）同步，是官方认可的合法 effect 用法（setState 在 fetchEntries 函数体内，effect 不直接命中）
    void fetchEntries(scope);
  }, [scope, fetchEntries]);

  // 挂载后从 localStorage 恢复排序偏好（放 effect 里读，避免 SSR 水合不一致）
  useEffect(() => {
    try {
      const v = localStorage.getItem("mn-sort");
      if (v === "name" || v === "copies") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSort(v);
      }
    } catch {
      /* 隐私模式等读取失败：保持默认 recent */
    }
  }, []);

  const changeSort = useCallback((next: SortKey) => {
    setSort(next);
    try {
      localStorage.setItem("mn-sort", next);
    } catch {
      /* 写入失败不影响本次会话 */
    }
  }, []);

  // 无限滚动：哨兵进入视口（提前 300px）即加载下一页
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (records) => {
        if (records[0].isIntersecting) void loadMore();
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

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
      loadedRef.current = Math.max(0, loadedRef.current - 1); // 服务端活跃集少一条，回退偏移避免下一页漏项
      setTotal((t) => Math.max(0, t - 1)); // 软删后活跃总数 -1（该操作不重拉列表）
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

  // ---------- 批量多选 ----------
  const toggleCheck = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setChecked(new Set());
  }, []);

  // 批量删除：复用确认弹窗，逐项软删（单用户量级下并发可接受）
  const batchDelete = useCallback(() => {
    const ids = [...checked];
    if (ids.length === 0) return;
    setConfirm({
      title: "批量移到最近删除",
      message: `将 ${ids.length} 个条目移到最近删除，可随时恢复。`,
      confirmLabel: "删除",
      danger: true,
      action: async () => {
        await Promise.all(ids.map((id) => api(`/api/entries/${id}`, { method: "DELETE" }).catch(() => {})));
        setTotal((t) => Math.max(0, t - ids.length));
        setChecked(new Set());
        showToast(`已移到最近删除：${ids.length} 项`);
        fetchFolders().catch(() => {});
        void fetchEntries(scope);
      },
    });
  }, [checked, fetchEntries, fetchFolders, scope, showToast]);

  // 批量移动：改归属后刷新列表与计数
  const batchMove = useCallback(
    async (folderId: string | null) => {
      const ids = [...checked];
      if (ids.length === 0) return;
      await Promise.all(
        ids.map((id) => api(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify({ folderId }) }).catch(() => {}))
      );
      const target = folderId ? folders.find((f) => f.id === folderId)?.name : null;
      showToast(target ? `已移动 ${ids.length} 项到「${target}」` : `已移出 ${ids.length} 项所在文件夹`);
      setChecked(new Set());
      await Promise.all([fetchFolders(), fetchEntries(scope)]);
    },
    [checked, fetchEntries, fetchFolders, folders, scope, showToast]
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

  // 单条目视图：渲染期派生，不走加载（useMemo 稳定数组身份，避免下游 effect 每轮重建）
  const visibleEntries = useMemo(
    () => (scope.type === "entry" ? [scope.entry] : entries),
    [scope, entries]
  );

  // ---------- 主从式：选中与预览 ----------
  const selected = visibleEntries.find((e) => e.id === selectedId) ?? null;

  const selectEntry = useCallback((id: string) => {
    setSelectedId(id);
    setPreviewOpen(true); // <lg 打开预览抽屉；lg+ 右栏常驻忽略此值
  }, []);

  // 列表变化时自愈选中：回收站不选；selectedId 失效则回首条（软删/切作用域后保持预览有内容）
  useEffect(() => {
    const next =
      scope.type === "deleted"
        ? null
        : visibleEntries.some((e) => e.id === selectedId)
          ? selectedId
          : (visibleEntries[0]?.id ?? null);
    if (next !== selectedId) {
      // 与外部数据同步后回灌选中，属合法 effect 用法
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(next);
    }
  }, [visibleEntries, selectedId, scope.type]);

  // 选中项滚动进视口（键盘导航时跟随）
  useEffect(() => {
    if (!selectedId) return;
    document.querySelector<HTMLElement>(`[data-entry-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // 键盘集：↑/↓ 选择 · Enter 复制 · N 新建 · E 编辑 · P 置顶 · Del 删除 · Esc 关预览/退多选（护栏：弹窗/输入框/回收站不响应）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || paletteOpen || confirm || shortcutsOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // Enter/Space 是交互控件的原生激活键：焦点落在按钮/链接/菜单项/列表行上时让位给控件自身，避免被全局快捷键劫持
      if ((e.key === "Enter" || e.key === " ") && t?.closest('button, a, select, [role="menuitem"], [role="button"]')) return;
      if (scope.type === "deleted") return;
      // ? 打开快捷键总览（多选态也可用）
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      // 多选态：单行操作交给操作条，仅 Esc 退出
      if (selectMode) {
        if (e.key === "Escape") {
          e.preventDefault();
          exitSelectMode();
        }
        return;
      }
      if (e.key === "Escape") {
        setPreviewOpen(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (visibleEntries.length === 0) return;
        e.preventDefault();
        const idx = Math.max(visibleEntries.findIndex((x) => x.id === selectedId), 0);
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = Math.min(Math.max(idx + delta, 0), visibleEntries.length - 1);
        setSelectedId(visibleEntries[next].id);
        return;
      }
      if (e.key === "Enter") {
        if (selected) {
          e.preventDefault();
          void copyEntry(selected);
        }
        return;
      }
      const mod = e.ctrlKey || e.metaKey || e.altKey;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selected) return;
        e.preventDefault();
        const entry = selected;
        setConfirm({
          title: "移到最近删除",
          message: `「${entry.title}」将移到最近删除，可随时恢复。`,
          confirmLabel: "删除",
          danger: true,
          action: () => deleteEntry(entry),
        });
        return;
      }
      if (!mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setDialog({ mode: "create", folderId: scope.type === "folder" ? scope.id : null });
        return;
      }
      if (!mod && e.key.toLowerCase() === "e" && selected) {
        e.preventDefault();
        setDialog({ mode: "edit", entry: selected });
        return;
      }
      if (!mod && e.key.toLowerCase() === "p" && selected) {
        e.preventDefault();
        void togglePin(selected);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, paletteOpen, confirm, shortcutsOpen, scope, visibleEntries, selectedId, selected, copyEntry, selectMode, exitSelectMode, deleteEntry, togglePin]);

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

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background">
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
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs tabular-nums text-brand">
            {total}
          </span>
          {scope.type !== "deleted" && scope.type !== "entry" && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Tip label={selectMode ? "退出多选" : "多选"}>
                <button
                  type="button"
                  aria-pressed={selectMode}
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setChecked(new Set());
                  }}
                  className={`rounded-md p-1.5 transition-colors ${
                    selectMode
                      ? "bg-brand-soft text-brand"
                      : "text-muted-foreground hover:bg-surface-muted hover:text-brand"
                  }`}
                >
                  <CheckIcon width={16} height={16} />
                </button>
              </Tip>
              <SortMenu value={sort} onChange={changeSort} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setDialog({ mode: "create", folderId: scope.type === "folder" ? scope.id : null })}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-on transition-opacity hover:opacity-90"
          >
            <PlusIcon width={15} height={15} />
            新建条目
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* 左：密集列表 / 回收站 */}
          <section
            className={`m-2 flex min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-surface ${
              scope.type === "deleted" ? "" : "lg:w-[380px] xl:w-[430px]"
            }`}
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {listError && (
                <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                  {listError}
                </p>
              )}
              {loading ? (
                <div className="flex flex-col gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-muted" />
                  ))}
                </div>
              ) : visibleEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-5 px-4 py-24 text-center">
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
                <div className="flex flex-col gap-1">
                  {visibleEntries.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      selected={e.id === selectedId}
                      selectMode={selectMode}
                      checked={checked.has(e.id)}
                      onSelect={selectEntry}
                      onToggleCheck={toggleCheck}
                      onCopy={(entry) => copyEntry(entry)}
                      onKindClick={(kind) => setScope({ type: "kind", value: kind })}
                    />
                  ))}
                </div>
              )}
              {/* 无限滚动哨兵：仅非单条目视图且还有下一页时渲染 */}
              {!loading && scope.type !== "entry" && (hasMore || loadingMore) && (
                <div ref={sentinelRef} className="py-6 text-center text-xs text-muted-foreground">
                  {loadingMore ? "加载中…" : "继续滚动加载更多"}
                </div>
              )}
              {/* 到底提示：已加载全部时轻提示总数 */}
              {!loading && !hasMore && scope.type !== "entry" && visibleEntries.length > 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">没有更多 · 共 {total} 条</div>
              )}
            </div>
            {/* 底部：多选态显示批量操作条，否则显示快捷键提示条（回收站不显示） */}
            {scope.type !== "deleted" &&
              (selectMode ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border-base px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    已选 <span className="font-medium tabular-nums text-foreground">{checked.size}</span> 项
                  </span>
                  <select
                    value=""
                    disabled={checked.size === 0}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) void batchMove(v === "__unsorted" ? null : v);
                    }}
                    className="cursor-pointer rounded-md border border-border-base bg-surface px-1.5 py-1 text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" disabled>
                      移动到…
                    </option>
                    <option value="__unsorted">未分类</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={checked.size === 0}
                    onClick={batchDelete}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <TrashIcon width={13} height={13} /> 删除
                  </button>
                  <button
                    type="button"
                    onClick={exitSelectMode}
                    className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  >
                    <XIcon width={13} height={13} /> 取消
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-x-3 border-t border-border-base px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>↑↓</Kbd>
                    <span>选择</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>Enter</Kbd>
                    <span>复制</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>N</Kbd>
                    <span>新建</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShortcutsOpen(true)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    <Kbd>?</Kbd>
                    <span>全部快捷键</span>
                  </button>
                </div>
              ))}
          </section>

          {/* 右：预览（lg+ 常驻；回收站不显示）：与列表同为灰画布上的白色圆角卡片，靠 m-2 缝隙 + 圆角区分 */}
          {scope.type !== "deleted" && (
            <section className="m-2 hidden min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface lg:flex">
              {selected ? (
                <EntryPreview
                  entry={selected}
                  onCopy={copyEntry}
                  onTogglePin={togglePin}
                  onEdit={(entry) => setDialog({ mode: "edit", entry })}
                  onDelete={deleteEntry}
                  onSourceClick={(source) => setScope({ type: "source", value: source })}
                  onKindClick={(kind) => setScope({ type: "kind", value: kind })}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
                  选择左侧条目查看与复制
                </div>
              )}
            </section>
          )}
        </div>

        {/* <lg 预览抽屉（点击行滑入） */}
        {scope.type !== "deleted" && previewOpen && selected && (
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onMouseDown={() => setPreviewOpen(false)}>
            <div
              className="mn-pop absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <EntryPreview
                entry={selected}
                onCopy={copyEntry}
                onTogglePin={togglePin}
                onEdit={(entry) => setDialog({ mode: "edit", entry })}
                onDelete={deleteEntry}
                onSourceClick={(source) => setScope({ type: "source", value: source })}
                onKindClick={(kind) => setScope({ type: "kind", value: kind })}
                onClose={() => setPreviewOpen(false)}
              />
            </div>
          </div>
        )}
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
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
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
