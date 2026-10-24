"use client";

// 最近删除视图：管理表格风格（斑马纹 + 排序），支持恢复与彻底删除
import { useMemo, useState } from "react";
import { detectKind, kindLabel } from "@/lib/detect";
import { sourceStyle } from "@/lib/source";
import type { Entry } from "@/lib/types";
import { ChevronDownIcon, CodeIcon, FolderIcon, GlobeIcon, TerminalIcon, TextIcon } from "./icons";
import type { ComponentType, SVGProps } from "react";

const KIND_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  url: GlobeIcon,
  path: FolderIcon,
  command: TerminalIcon,
  code: CodeIcon,
  text: TextIcon,
};

type SortKey = "title" | "deletedAt";
type SortDir = "asc" | "desc";

function formatDeletedTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 可排序表头：当前列品牌色高亮，箭头方向指示升/降序 */
function SortTh({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort(k: SortKey): void;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`px-4 py-3 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground ${
          active ? "font-semibold text-brand-foreground" : "font-medium"
        }`}
      >
        {label}
        <ChevronDownIcon
          width={12}
          height={12}
          className={`transition-transform ${active && sort.dir === "asc" ? "rotate-180 text-brand" : active ? "text-brand" : "opacity-40"}`}
        />
      </button>
    </th>
  );
}

interface Props {
  entries: Entry[];
  onRestore(entryId: string): void;
  onPurge(entry: Entry): void;
}

export default function DeletedList({ entries, onRestore, onPurge }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "deletedAt", dir: "desc" });

  const sorted = useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => {
      if (sort.key === "title") {
        const c = a.title.localeCompare(b.title, "zh-CN");
        return sort.dir === "asc" ? c : -c;
      }
      const ta = new Date(a.deletedAt ?? 0).getTime();
      const tb = new Date(b.deletedAt ?? 0).getTime();
      return sort.dir === "asc" ? ta - tb : tb - ta;
    });
    return arr;
  }, [entries, sort]);

  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "title" ? "asc" : "desc" }));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-xs text-muted-foreground">
        删除的条目会先保存在这里；只有「彻底删除」才会永久移除，恢复后回到原来的文件夹。
      </p>
      <div className="overflow-x-auto rounded-xl border border-border-base bg-surface-muted">
        <table className="mn-table w-full min-w-[540px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-base text-xs text-muted-foreground">
              <SortTh label="条目" k="title" sort={sort} onSort={toggleSort} className="px-5" />
              <SortTh label="删除时间" k="deletedAt" sort={sort} onSort={toggleSort} className="w-44 text-center" />
              <th className="hidden w-28 px-4 py-3 text-center font-medium md:table-cell">类型</th>
              <th className="hidden w-32 px-4 py-3 text-center font-medium md:table-cell">来源</th>
              <th className="w-52 px-5 py-3 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const kind = detectKind(e.content);
              const Icon = KIND_ICONS[kind] ?? TextIcon;
              const ss = e.source ? sourceStyle(e.source, e.sourceColor) : null;
              return (
                <tr key={e.id} className="border-b border-border-base transition-colors last:border-b-0">
                  <td className="max-w-[280px] px-5 py-3.5">
                    <div className="truncate font-medium">{e.title}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{e.content}</div>
                  </td>
                  <td className="px-4 py-3.5 text-center text-xs tabular-nums text-muted-foreground">
                    {formatDeletedTime(e.deletedAt ?? "")}
                  </td>
                  <td className="hidden px-4 py-3.5 text-center md:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Icon width={14} height={14} />
                      {kindLabel(kind)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 text-center md:table-cell">
                    {ss ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ss.badge}`}>
                        {e.source}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      type="button"
                      onClick={() => onRestore(e.id)}
                      className="rounded-lg border border-border-base bg-surface px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand-soft"
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      onClick={() => onPurge(e)}
                      className="ml-2 rounded-lg border border-border-base bg-surface px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white"
                    >
                      彻底删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
