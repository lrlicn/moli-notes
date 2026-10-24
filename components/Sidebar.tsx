"use client";

// 侧边栏：搜索入口、导航（全部/最近复制/未分类）、文件夹树、主题与登出
import { useState } from "react";
import { ENTRY_DRAG_TYPE } from "@/lib/types";
import type { Folder } from "@/lib/types";
import FolderTree from "./FolderTree";
import Tip from "./Tip";
import { DownloadIcon, GridIcon, InboxIcon, LogoIcon, MoonIcon, SearchIcon, SunIcon, TrashIcon, UploadIcon, LogoutIcon, XIcon } from "./icons";

export interface FolderCounts {
  byFolder: Record<string, number>;
  unsorted: number;
  total: number;
  /** 最近删除（回收站）条目数 */
  trash: number;
}

interface SidebarProps {
  folders: Folder[];
  counts: FolderCounts;
  scope:
    | { type: "all" }
    | { type: "unsorted" }
    | { type: "folder"; id: string }
    | { type: "source"; value: string }
    | { type: "kind"; value: string }
    | { type: "deleted" }
    | { type: "entry"; entry: unknown };
  onSelectAll(): void;
  onSelectUnsorted(): void;
  onSelectDeleted(): void;
  onSelectFolder(id: string): void;
  onCreateFolder(name: string, parentId: string | null): Promise<void>;
  onRenameFolder(id: string, name: string): Promise<void>;
  onDeleteFolder(id: string): Promise<void>;
  onMoveFolder(id: string, parentId: string | null): Promise<void>;
  onReorderFolder(id: string, targetId: string, position: "before" | "after"): Promise<void>;
  /** 条目卡片拖入：folderId 为 null 时移到未分类 */
  onDropEntry(entryId: string, folderId: string | null): void;
  onOpenSearch(): void;
  onToggleTheme(): void;
  onLogout(): void;
  onExport(): void;
  onImport(): void;
  /** 轻量身份显示（可选）：如「模力的速查库」；未配置时回退显示版本号 */
  ownerLabel?: string;
  onCloseMobile?(): void;
}

const DRAG_TYPE = "text/mn-folder";

export default function Sidebar(props: SidebarProps) {
  const [dragOverUnsorted, setDragOverUnsorted] = useState(false);
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface-muted xl:w-72 xl:shrink-0">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <LogoIcon className="h-10 w-10 shrink-0 text-brand" />
        <div className="min-w-0">
          <div className="truncate text-lg font-bold leading-tight">模力笔记</div>
          <div className="truncate text-xs text-muted-foreground">碎片信息速查库</div>
        </div>
        {props.onCloseMobile && (
          <button
            type="button"
            aria-label="关闭侧边栏"
            onClick={props.onCloseMobile}
            className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground md:hidden"
          >
            <XIcon />
          </button>
        )}
      </div>

      <div className="px-3">
        <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-brand-soft hover:text-brand-foreground">
          <button
            type="button"
            onClick={props.onOpenSearch}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <SearchIcon width={15} height={15} />
            <span className="truncate">搜索…</span>
          </button>
          <kbd className="hidden shrink-0 rounded bg-surface-muted px-1 font-mono text-[11px] leading-4 text-muted-foreground md:block">
            Ctrl K
          </kbd>
        </div>
      </div>

      <nav className="mt-3 space-y-0.5 px-2">
        <button
          type="button"
          onClick={props.onSelectAll}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
          }}
          onDrop={(e) => {
            const dragId = e.dataTransfer.getData(DRAG_TYPE);
            if (dragId) props.onMoveFolder(dragId, null);
          }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            props.scope.type === "all"
              ? "bg-brand-soft font-medium text-brand-foreground"
              : "text-foreground hover:bg-surface"
          }`}
        >
          <GridIcon width={16} height={16} className="text-muted-foreground" />
          全部条目
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{props.counts.total}</span>
        </button>
        <button
          type="button"
          onClick={props.onSelectDeleted}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            props.scope.type === "deleted"
              ? "bg-brand-soft font-medium text-brand-foreground"
              : "text-foreground hover:bg-surface"
          }`}
        >
          <TrashIcon width={16} height={16} className="text-muted-foreground" />
          最近删除
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{props.counts.trash}</span>
        </button>
        <button
          type="button"
          onClick={props.onSelectUnsorted}
          onDragOver={(e) => {
            // 接收条目卡片拖入 = 移出文件夹（未分类）
            if (e.dataTransfer.types.includes(ENTRY_DRAG_TYPE)) {
              e.preventDefault();
              setDragOverUnsorted(true);
            }
          }}
          onDragLeave={() => setDragOverUnsorted(false)}
          onDrop={(e) => {
            const entryId = e.dataTransfer.getData(ENTRY_DRAG_TYPE);
            setDragOverUnsorted(false);
            if (entryId) props.onDropEntry(entryId, null);
          }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            props.scope.type === "unsorted"
              ? "bg-brand-soft font-medium text-brand-foreground"
              : "text-foreground hover:bg-surface"
          } ${dragOverUnsorted ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-muted" : ""}`}
        >
          <InboxIcon width={16} height={16} className="text-muted-foreground" />
          未分类
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{props.counts.unsorted}</span>
        </button>
      </nav>

      <FolderTree
        folders={props.folders}
        selectedId={props.scope.type === "folder" ? props.scope.id : null}
        counts={props.counts.byFolder}
        onSelect={props.onSelectFolder}
        onCreate={props.onCreateFolder}
        onRename={props.onRenameFolder}
        onDelete={props.onDeleteFolder}
        onMove={props.onMoveFolder}
        onReorder={props.onReorderFolder}
        onDropEntry={props.onDropEntry}
      />

      {/* 数据备份：两枚等宽幽灵按钮，与搜索框同视觉语言 */}
      <div className="mt-auto flex gap-2 px-3 pb-2">
        <button
          type="button"
          onClick={props.onExport}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:shadow-sm"
        >
          <DownloadIcon width={13} height={13} className="shrink-0" />
          导出备份
        </button>
        <button
          type="button"
          onClick={props.onImport}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:shadow-sm"
        >
          <UploadIcon width={13} height={13} className="shrink-0" />
          导入恢复
        </button>
      </div>

      <div className="flex items-center gap-1 px-3 py-2">
        <Tip label="切换主题" side="top" align="start">
          <button
            type="button"
            aria-label="切换主题"
            onClick={props.onToggleTheme}
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <SunIcon width={16} height={16} className="dark:hidden" />
            <MoonIcon width={16} height={16} className="hidden dark:block" />
          </button>
        </Tip>
        {props.ownerLabel ? (
          <span className="min-w-0 flex-1 truncate px-1 text-center text-xs">
            <span className="font-medium text-brand">{props.ownerLabel}</span>
            <span className="text-muted-foreground/70">的速查库</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 text-center text-xs text-muted-foreground/70">v0.1.0</span>
        )}
        <Tip label="退出登录" side="top" align="end">
          <button
            type="button"
            aria-label="退出登录"
            onClick={props.onLogout}
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <LogoutIcon width={16} height={16} />
          </button>
        </Tip>
      </div>
    </aside>
  );
}
