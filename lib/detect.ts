// 根据条目内容启发式识别类型，用于展示对应图标和复制按钮文案
import type { EntryKind } from "./types";

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const WIN_PATH_RE = /^[a-zA-Z]:[\\/][^\s]*$/;
const UNC_PATH_RE = /^\\\\[^\s]+$/;
const NIX_PATH_RE = /^(~\/|\.{1,2}\/|\/(?:[^/\s]+\/)*[^/\s]*)$/;
// 常见命令行工具开头
const CMD_HINT =
  /^(npm|npx|pnpm|yarn|node|git|docker|kubectl|ssh|scp|curl|wget|pip|python|python3|cargo|go|mvn|gradle|make|brew|apt|choco|winget|code|cd|ls|dir|mkdir|rm|cp|mv|cat|echo|export|set|netstat|ipconfig|ping|telnet|tail|head|grep|find|jq|sql|mysql|redis-cli|ssh-keygen|systemctl|service|pm2|forever|concurrently|vite|webpack|tsc|eslint|prettier|jest|vitest|pytest)\b/;

export function detectKind(raw: string): EntryKind {
  const content = raw.trim();
  if (!content) return "text";
  if (URL_RE.test(content)) return "url";

  if (WIN_PATH_RE.test(content) || UNC_PATH_RE.test(content) || NIX_PATH_RE.test(content)) {
    return "path";
  }

  // 命令：单行，以已知命令开头，或明显是 shell 语法
  if (
    !content.includes("\n") &&
    (CMD_HINT.test(content) ||
      /^(sudo\s+)/.test(content) ||
      /^\.\??\//.test(content))
  ) {
    return "command";
  }

  // 代码：多行，或包含明显代码符号
  if (
    content.includes("\n") ||
    /[{}();=<>]|=>|\$\{|<\/?\w+>/.test(content)
  ) {
    return "code";
  }

  return "text";
}

export function kindLabel(kind: EntryKind): string {
  switch (kind) {
    case "url":
      return "链接";
    case "path":
      return "路径";
    case "command":
      return "命令";
    case "code":
      return "代码";
    default:
      return "文本";
  }
}

export function copyLabel(kind: EntryKind): string {
  switch (kind) {
    case "url":
      return "复制链接";
    case "path":
      return "复制路径";
    case "command":
      return "复制命令";
    case "code":
      return "复制代码";
    default:
      return "复制";
  }
}
