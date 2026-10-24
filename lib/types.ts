// 共享类型定义（客户端 / 服务端通用）

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Entry {
  id: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  content: string;
  notes: string;
  /** 来源：预设类别（自研项目/朋友推荐/网站/文档/其他）或自定义文本；空串为未设置 */
  source: string;
  /** 自定义来源的颜色（hex）；空串时按来源名 hash 自动分配 */
  sourceColor: string;
  pinned: boolean;
  lastUsedAt: string | null;
  /** 软删除时间：非 null 表示在「最近删除」中，可恢复 */
  deletedAt: string | null;
  /** 累计复制次数（复制一次 +1，卡片展示高频热度） */
  copyCount: number;
  createdAt: string;
  updatedAt: string;
}

// 条目内容的识别类型：链接 / 路径 / 命令 / 代码 / 普通文本
export type EntryKind = "url" | "path" | "command" | "code" | "text";

// HTML5 拖拽数据类型标识：条目卡片拖入侧边栏文件夹
export const ENTRY_DRAG_TYPE = "text/mn-entry";
