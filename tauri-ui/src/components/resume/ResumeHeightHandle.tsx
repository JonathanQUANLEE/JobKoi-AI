import React from "react";
import { AlertCircle } from "lucide-react";

interface ResumeHeightHandleProps {
  cardHeight: number;
  isResizingHeight: boolean;
  isExceedingMax: boolean;
  isMonochrome: boolean;
  onResizeStart: (e: React.MouseEvent) => void;
  onResetDefault: () => void;
}

export default function ResumeHeightHandle({
  cardHeight,
  isResizingHeight,
  isExceedingMax,
  isMonochrome,
  onResizeStart,
  onResetDefault,
}: ResumeHeightHandleProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center pt-2 pb-1 select-none">
      <div
        onMouseDown={onResizeStart}
        className={`group flex items-center justify-center gap-2.5 py-1.5 px-6 rounded-full border transition-all cursor-ns-resize shadow-sm ${
          isResizingHeight
            ? isExceedingMax
              ? "border-red-500 bg-red-500/15 text-red-300 shadow-red-500/20 animate-pulse"
              : isMonochrome
              ? "border-white bg-white/10 text-white shadow-white/10 ring-2 ring-white/20"
              : "border-amber-400 bg-amber-500/20 text-amber-200 shadow-amber-500/20 ring-2 ring-amber-500/20"
            : "border-stone-800/90 bg-stone-900/90 text-stone-500 hover:text-stone-300 hover:border-stone-600 hover:bg-stone-800/90"
        }`}
        title="向下拖动可拉长视窗高度，向上拖动可缩小（双击重置默认高度 640px）"
        onDoubleClick={onResetDefault}
      >
        <div className="w-6 h-0.5 rounded-full bg-current opacity-40 group-hover:opacity-80 transition-opacity" />
        <span className="text-[11px] font-mono font-medium flex items-center gap-1.5">
          {isExceedingMax ? (
            <span className="text-red-400 font-bold flex items-center gap-1">
              <AlertCircle className="size-3.5" />
              <span>已超出界面最大限制 (松手自动贴底)</span>
            </span>
          ) : (
            <span>↕ 拖拽调整视窗高度 ({cardHeight}px)</span>
          )}
        </span>
        <div className="w-6 h-0.5 rounded-full bg-current opacity-40 group-hover:opacity-80 transition-opacity" />
      </div>
    </div>
  );
}
