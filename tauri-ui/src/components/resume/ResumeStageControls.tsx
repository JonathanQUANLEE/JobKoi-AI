import {
  Layers,
  LayoutGrid,
  RotateCw,
} from "lucide-react";

interface ResumeStageControlsProps {
  viewMode: "3d" | "flat";
  onViewModeChange: (mode: "3d" | "flat") => void;
  isReadingMode: boolean;
  onExitReadingMode: () => void;
  isMonochrome: boolean;
  resumesCount: number;
  onSwap?: () => void;
  flatSpreadAll: boolean;
  onSetFlatSpreadAll: (val: boolean) => void;
}

export default function ResumeStageControls({
  viewMode,
  onViewModeChange,
  isReadingMode,
  onExitReadingMode,
  isMonochrome,
  resumesCount,
  onSwap,
  flatSpreadAll,
  onSetFlatSpreadAll,
}: ResumeStageControlsProps) {
  return (
    <div className="w-full flex flex-wrap items-center justify-between gap-2.5 pb-3 px-1 text-xs text-stone-400">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-stone-200 flex items-center gap-1.5">
          {viewMode === "3d" ? (
            <>
              <Layers className="size-3.5 text-amber-400" />
              <span>3D 书架抽屉层叠视图</span>
            </>
          ) : (
            <>
              <LayoutGrid className="size-3.5 text-amber-400" />
              <span>经典纯净平铺模式</span>
            </>
          )}
        </span>

        {isReadingMode ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[11px] font-semibold animate-in fade-in">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>📜 正在专注阅读中 · 滚轮/双指浏览文档 · 点击外部恢复</span>
          </span>
        ) : (
          <span className="text-[11px] text-stone-500 hidden sm:inline">
            {viewMode === "3d"
              ? "· 鼠标滚轮上下滚动或点击卡片即可轮换 · 点击正文进入阅读"
              : "· 2D 纯平面直读 · 点击正文进入专注阅读 · 零倾角无景深"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* 核心功能：3D 抽屉 vs 平铺模式 视图切换胶囊 */}
        <div className="flex items-center p-0.5 rounded-xl bg-stone-900 border border-stone-800 shadow-inner">
          <button
            type="button"
            onClick={() => onViewModeChange("3d")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "3d"
                ? isMonochrome
                  ? "bg-white text-black shadow-md font-bold"
                  : "bg-amber-500 text-stone-950 shadow-md font-bold"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="切换至 3D 书架抽屉层叠视图（立体景深，滚轮抽拉切换）"
          >
            <Layers className="size-3.5" />
            <span>3D 抽屉</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("flat")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "flat"
                ? isMonochrome
                  ? "bg-white text-black shadow-md font-bold"
                  : "bg-amber-500 text-stone-950 shadow-md font-bold"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="切换至纯净平铺模式（2D 平面无透视，适合沉浸直接阅读文档）"
          >
            <LayoutGrid className="size-3.5" />
            <span>平铺模式</span>
          </button>
        </div>

        {/* 阅读模式退出按钮（3D 与平铺模式通用） */}
        {isReadingMode && (
          <button
            type="button"
            onClick={onExitReadingMode}
            className="px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs transition-colors cursor-pointer"
            title="退出正文阅读模式"
          >
            退出阅读模式 (Esc)
          </button>
        )}

        {/* 3D 模式抽换按钮 */}
        {viewMode === "3d" && resumesCount > 1 && onSwap && (
          <button
            type="button"
            onClick={onSwap}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
            title="像拉抽屉一样切换下一张"
          >
            <RotateCw className="size-3.5 text-amber-400" />
            <span>抽换下一份 (Swap)</span>
          </button>
        )}

        {/* 平铺模式专属控制：单份直读 vs 全部展开 */}
        {viewMode === "flat" && resumesCount > 1 && (
          <div className="flex items-center p-0.5 rounded-xl bg-stone-900 border border-stone-800">
            <button
              type="button"
              onClick={() => onSetFlatSpreadAll(false)}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                !flatSpreadAll
                  ? "bg-stone-800 text-stone-200 border border-stone-700 shadow-sm"
                  : "text-stone-400 hover:text-stone-300"
              }`}
              title="单份大视窗直读"
            >
              单份直读
            </button>
            <button
              type="button"
              onClick={() => onSetFlatSpreadAll(true)}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                flatSpreadAll
                  ? "bg-stone-800 text-stone-200 border border-stone-700 shadow-sm"
                  : "text-stone-400 hover:text-stone-300"
              }`}
              title="全部并排网格平铺"
            >
              全部平铺
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
