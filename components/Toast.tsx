"use client";

// 轻量 Toast 提示（可选撤销等操作按钮）
export default function Toast({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick(): void };
}) {
  return (
    <div className="mn-toast fixed bottom-6 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
      <span>{text}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 font-medium underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
