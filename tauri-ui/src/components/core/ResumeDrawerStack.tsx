import { useState, useRef, useEffect, type FC } from "react";
import {
  FileText,
  Star,
  Layers,
  LayoutGrid,
  RotateCw,
  Image as ImageIcon,
  ChevronRight,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";
import type { ResumeItem } from "../../lib/ipc";
import "./ResumeDrawerStack.css";

export interface ResumeDrawerStackProps {
  items: ResumeItem[];
  selectedName: string | null;
  onSelect: (item: ResumeItem) => void;
  onSetDefault?: (name: string) => void;
  onDelete?: (name: string) => void;
}

export const ResumeDrawerStack: FC<ResumeDrawerStackProps> = ({
  items,
  selectedName,
  onSelect,
  onSetDefault,
  onDelete,
}) => {
  // 是否处于立体层叠模式（true 为 3D 抽屉层叠，false 为平铺展开）
  const [isStacked, setIsStacked] = useState(true);
  
  // 层叠顺序：数组内存储的是 items 的索引
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [isSwapping, setIsSwapping] = useState(false);

  // 当 items 数量改变时，更新层叠顺序
  useEffect(() => {
    setOrder(items.map((_, i) => i));
  }, [items.length]);

  // 当外部 selectedName 改变时，确保该项排在最前
  useEffect(() => {
    if (!selectedName || items.length === 0) return;
    const foundIdx = items.findIndex((it) => it.name === selectedName);
    if (foundIdx !== -1 && order[0] !== foundIdx) {
      setOrder((prev) => {
        const without = prev.filter((idx) => idx !== foundIdx);
        return [foundIdx, ...without];
      });
    }
  }, [selectedName, items]);

  if (items.length === 0) {
    return null;
  }

  // 抽屉抽出并切换到下一张 (Drawer Pull-out Swap)
  const handleSwapNext = () => {
    if (items.length < 2 || isSwapping) return;
    setIsSwapping(true);

    setTimeout(() => {
      setOrder((prev) => {
        const [front, ...rest] = prev;
        const nextOrder = [...rest, front];
        const nextTopItem = items[nextOrder[0]];
        if (nextTopItem) {
          onSelect(nextTopItem);
        }
        return nextOrder;
      });
      setIsSwapping(false);
    }, 280);
  };

  // 点击具体的某一张卡片
  const handleCardClick = (slotIndex: number, originalIndex: number) => {
    const clickedItem = items[originalIndex];
    if (!clickedItem) return;

    if (!isStacked) {
      // 平铺模式下：直接选中
      onSelect(clickedItem);
      return;
    }

    // 3D 抽屉模式下：
    if (slotIndex === 0) {
      // 点击了最顶层的卡片内容方框 -> 立即触发平铺展开！
      setIsStacked(false);
      onSelect(clickedItem);
    } else {
      // 点击了后方的卡片 -> 抽屉抽出，并将其提升至最前端
      setOrder((prev) => {
        const target = originalIndex;
        const rest = prev.filter((i) => i !== target);
        const nextOrder = [target, ...rest];
        onSelect(items[target]);
        return nextOrder;
      });
    }
  };

  return (
    <div className="drawer-stack-viewport space-y-3">
      {/* 顶部控制栏：视图模式切换与抽屉抽出按钮 */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            {isStacked ? (
              <>
                <Layers className="size-3.5 text-amber-400" />
                <span>3D 抽屉层叠视图</span>
              </>
            ) : (
              <>
                <LayoutGrid className="size-3.5 text-amber-400" />
                <span>平铺全览视图</span>
              </>
            )}
          </span>
          <span className="text-[10px] text-stone-500 font-mono">
            ({items.length} 份资料)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* 3D 抽屉抽拉下一份按钮 */}
          {isStacked && items.length > 1 && (
            <button
              type="button"
              onClick={handleSwapNext}
              disabled={isSwapping}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-400 text-[11px] font-semibold transition-all cursor-pointer active:scale-95"
              title="像抽屉一样抽换下一份资料"
            >
              <RotateCw className={`size-3 ${isSwapping ? "animate-spin" : ""}`} />
              <span>抽换下一份</span>
            </button>
          )}

          {/* 平铺 / 层叠一键切换按钮 */}
          <button
            type="button"
            onClick={() => setIsStacked(!isStacked)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 hover:border-amber-500/40 text-stone-300 hover:text-stone-100 text-[11px] transition-all cursor-pointer"
            title={isStacked ? "点击平铺展开所有文件" : "点击收拢为 3D 抽屉层叠"}
          >
            {isStacked ? (
              <>
                <Maximize2 className="size-3 text-stone-400" />
                <span>平铺展开</span>
              </>
            ) : (
              <>
                <Minimize2 className="size-3 text-stone-400" />
                <span>收拢抽屉</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 核心卡片容器：立体层叠模式 vs 平铺网格模式 */}
      {isStacked ? (
        <div className="drawer-stack-stage">
          {order.slice(0, 4).map((itemIndex, slotIndex) => {
            const item = items[itemIndex];
            if (!item) return null;

            const isTop = slotIndex === 0;
            const ext = getExtension(item.name);
            const isImg = ["png", "jpg", "jpeg", "webp"].includes(ext);
            const isDoc = ["docx", "doc"].includes(ext);

            // 计算 3D 深度与偏移（线形立体感）
            const xOffset = slotIndex * 14;
            const yOffset = -slotIndex * 16;
            const zOffset = -slotIndex * 40;
            const scale = 1 - slotIndex * 0.05;
            const opacity = 1 - slotIndex * 0.16;
            const zIndex = items.length - slotIndex;

            return (
              <div
                key={item.name}
                onClick={() => handleCardClick(slotIndex, itemIndex)}
                className={`drawer-stack-card ${isSwapping && isTop ? "card-drawer-pulling" : ""}`}
                style={{
                  transform: `translate3d(${xOffset}px, ${yOffset}px, ${zOffset}px) scale(${scale}) rotateX(3.5deg)`,
                  opacity,
                  zIndex,
                }}
                title={isTop ? "点击卡片内容立即平铺展开" : "点击抽提到最前端"}
              >
                <div className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* 格式角标 */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase border ${
                          ext === "pdf"
                            ? "bg-red-950/60 border-red-500/40 text-red-400"
                            : isDoc
                              ? "bg-blue-950/60 border-blue-500/40 text-blue-400"
                              : "bg-purple-950/60 border-purple-500/40 text-purple-400"
                        }`}
                      >
                        {ext}
                      </span>
                      <span className="font-semibold text-xs text-stone-100 truncate max-w-[200px]">
                        {item.name}
                      </span>
                    </div>

                    {item.is_default && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 border border-amber-500/30">
                        <Star className="size-2.5 fill-amber-400 text-amber-400" />
                        <span>默认</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1 border-t border-stone-800/80">
                    <div className="flex items-center gap-2">
                      <span>{formatSize(item.size)}</span>
                      <span>·</span>
                      <span>{item.mtime.slice(5)}</span>
                    </div>
                    {isTop && (
                      <span className="text-[10px] text-amber-400/90 font-medium">
                        点击卡片平铺 ➔
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 平铺展开视图 (Flat Grid) */
        <div className="drawer-flat-grid">
          {items.map((item) => {
            const isSelected = selectedName === item.name;
            const ext = getExtension(item.name);
            const isDoc = ["docx", "doc"].includes(ext);

            return (
              <div
                key={item.name}
                onClick={() => onSelect(item)}
                className={`flex items-center justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                  isSelected
                    ? "border-amber-500 bg-amber-500/10 shadow-sm shadow-amber-500/10 ring-1 ring-amber-500/30"
                    : "border-stone-800/80 bg-[#191715] hover:border-stone-700 hover:bg-[#201d1a]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase border ${
                      ext === "pdf"
                        ? "bg-red-950/60 border-red-500/40 text-red-400"
                        : isDoc
                          ? "bg-blue-950/60 border-blue-500/40 text-blue-400"
                          : "bg-purple-950/60 border-purple-500/40 text-purple-400"
                    }`}
                  >
                    {ext}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-100 truncate max-w-[220px]">
                        {item.name}
                      </span>
                      {item.is_default && (
                        <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-amber-400 border border-amber-500/30">
                          <Star className="size-2.5 fill-amber-400 text-amber-400" />
                          <span>默认</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-stone-500 mt-0.5">
                      {formatSize(item.size)} · {item.mtime}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isSelected && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
                      当前预览
                    </span>
                  )}
                  <ChevronRight className="size-4 text-stone-600" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export default ResumeDrawerStack;
