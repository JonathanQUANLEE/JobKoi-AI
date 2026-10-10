import { useState, useEffect, type FC } from "react";
import {
  AlertCircle,
  Sparkles,
  X,
  Layers,
  LayoutList,
  Trash2,
  Clock,
} from "lucide-react";
import { useRunStore, type NotificationItem } from "../store";
import SwipeRow from "./core/SwipeRow";

export const NotificationDock: FC = () => {
  const notifications = useRunStore((s) => s.notifications);
  const removeNotification = useRunStore((s) => s.removeNotification);
  const clearAllNotifications = useRunStore((s) => s.clearAllNotifications);
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");

  // "stacked" (平直层叠折叠态) 或 "flat" (多条平铺列表态)
  const [viewMode, setViewMode] = useState<"stacked" | "flat">("stacked");

  // 当通知被清空后，自动恢复默认折叠态
  useEffect(() => {
    if (notifications.length <= 1) {
      setViewMode("stacked");
    }
  }, [notifications.length]);

  if (notifications.length === 0) return null;

  const count = notifications.length;
  const isStacked = viewMode === "stacked" && count > 1;

  // 双击通知区域在「折叠堆叠态」与「多条平铺态」之间快速切换
  const handleDoubleClick = () => {
    if (count > 1) {
      setViewMode((prev) => (prev === "stacked" ? "flat" : "stacked"));
    }
  };

  return (
    <div className="px-2.5 pb-2 shrink-0 select-none animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* 顶部控制栏（仅在有多条通知时呈现切换胶囊） */}
      {count > 1 && (
        <div className="flex items-center justify-between px-1 mb-1.5 text-[10px] text-[var(--muted-fg)]">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "stacked" ? "flat" : "stacked")}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
              viewMode === "flat"
                ? isMonochrome
                  ? "bg-white/15 border-white/30 text-white font-medium"
                  : "bg-amber-500/20 border-amber-500/40 text-amber-300 font-medium"
                : "bg-stone-900/60 border-[var(--grid)] text-stone-400 hover:text-stone-200"
            }`}
            title="点击切换平铺/折叠（亦可双击卡片快速切换）"
          >
            {viewMode === "flat" ? (
              <>
                <Layers className="size-3 shrink-0" />
                <span>{count} 条通知 · 双击折叠</span>
              </>
            ) : (
              <>
                <LayoutList className="size-3 shrink-0" />
                <span>{count} 条通知 · 双击平铺</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={clearAllNotifications}
            className="text-[10px] text-stone-500 hover:text-red-400 transition-colors cursor-pointer px-1"
            title="一键清空所有活跃通知"
          >
            清空
          </button>
        </div>
      )}

      {/* 通知卡片展示区域 */}
      {isStacked ? (
        /* ================= 1. 折叠堆叠态 (正常平直层叠，不歪斜) ================= */
        <div
          className="relative cursor-pointer transition-transform active:scale-[0.99]"
          onDoubleClick={handleDoubleClick}
          title="双击即可展开全部平铺查看"
        >
          {/* 底层阴影卡片 2 (最底层) */}
          {notifications[2] && (
            <div
              className={`absolute inset-x-2 -top-3 h-12 rounded-xl border opacity-30 shadow-sm pointer-events-none ${
                isMonochrome
                  ? "bg-[#09090b] border-white/10"
                  : "bg-[#181512] border-amber-500/10"
              }`}
            />
          )}

          {/* 底层阴影卡片 1 (次层) */}
          {notifications[1] && (
            <div
              className={`absolute inset-x-1 -top-1.5 h-12 rounded-xl border opacity-60 shadow-sm pointer-events-none ${
                isMonochrome
                  ? "bg-[#0c0c0e] border-white/15"
                  : "bg-[#1b1814] border-amber-500/20"
              }`}
            />
          )}

          {/* 顶层主卡片（装备 React Bits SwipeRow 滑动删除） */}
          <div className="relative z-10">
            <NotificationRowItem
              item={notifications[0]}
              onDismiss={() => removeNotification(notifications[0].id)}
              isMonochrome={isMonochrome}
              stackedBadge={`+${count - 1}`}
            />
          </div>
        </div>
      ) : (
        /* ================= 2. 平铺展开态 (最多 5 条垂直排列，每条均支持滑动手势) ================= */
        <div
          className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5"
          onDoubleClick={handleDoubleClick}
        >
          {notifications.map((item) => (
            <NotificationRowItem
              key={item.id}
              item={item}
              onDismiss={() => removeNotification(item.id)}
              isMonochrome={isMonochrome}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface NotificationRowItemProps {
  item: NotificationItem;
  onDismiss: () => void;
  isMonochrome: boolean;
  stackedBadge?: string;
}

const NotificationRowItem: FC<NotificationRowItemProps> = ({
  item,
  onDismiss,
  isMonochrome,
  stackedBadge,
}) => {
  const rowBg = isMonochrome
    ? item.type === "success"
      ? "#0a130e"
      : item.type === "error"
      ? "#150a0a"
      : "#0f0f12"
    : item.type === "success"
    ? "#0d1a13"
    : item.type === "error"
    ? "#1c0d0d"
    : "#1a1612";

  const borderColor = isMonochrome
    ? item.type === "success"
      ? "rgba(16, 185, 129, 0.4)"
      : item.type === "error"
      ? "rgba(239, 68, 68, 0.4)"
      : "rgba(255, 255, 255, 0.2)"
    : item.type === "success"
    ? "rgba(16, 185, 129, 0.4)"
    : item.type === "error"
    ? "rgba(239, 68, 68, 0.4)"
    : "rgba(245, 158, 11, 0.4)";

  const barColor =
    item.type === "success"
      ? "#10b981"
      : item.type === "error"
      ? "#ef4444"
      : isMonochrome
      ? "#ffffff"
      : "#f59e0b";

  return (
    <div
      className="relative rounded-xl overflow-hidden border shadow-lg backdrop-blur-md transition-all group"
      style={{ borderColor }}
    >
      <SwipeRow
        height={48}
        radius={12}
        actionWidth={64}
        actionColor="#ef4444"
        drawerColor={isMonochrome ? "#1c1c20" : "#292420"}
        rowColor={rowBg}
        textColor={isMonochrome ? "#f4f4f5" : "#f5f5f4"}
        actions={[
          {
            id: "delete",
            label: "删除",
            icon: <Trash2 className="size-3.5 text-white" />,
            dismiss: true,
          },
        ]}
        onCommit={onDismiss}
        onAction={onDismiss}
        className="!w-full select-none"
      >
        <div className="flex items-center justify-between w-full h-full gap-2 pr-1">
          {/* 左侧：指示灯与来源徽章 */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {item.type === "success" ? (
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              </span>
            ) : item.type === "error" ? (
              <AlertCircle className="size-3.5 text-red-400 shrink-0" />
            ) : (
              <Sparkles className={`size-3.5 shrink-0 ${isMonochrome ? "text-white" : "text-amber-400"}`} />
            )}

            {item.source && (
              <span
                className={`text-[9px] font-bold px-1 py-0.2 rounded shrink-0 leading-tight uppercase ${
                  item.type === "success"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : item.type === "error"
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : isMonochrome
                    ? "bg-white/15 text-white border border-white/25"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}
              >
                {item.source}
              </span>
            )}

            {/* 消息正文（紧凑细长排版） */}
            <span className="text-xs font-medium truncate text-stone-200" title={item.text}>
              {item.text}
            </span>
          </div>

          {/* 右侧：时间标签、堆叠数量与快速关闭 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {item.timeFormatted && (
              <span className="text-[10px] text-stone-500 font-mono flex items-center gap-0.5">
                <Clock className="size-2.5 opacity-60" />
                <span>{item.timeFormatted}</span>
              </span>
            )}

            {stackedBadge && (
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-white/10 text-stone-300 border border-white/15">
                {stackedBadge}
              </span>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-stone-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title="点击关闭此通知（亦可左滑删除）"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      </SwipeRow>

      {/* 底部 20 秒倒计时动态进度光带 */}
      <div className="absolute bottom-0 inset-x-0 h-[2px] bg-white/10 overflow-hidden pointer-events-none">
        <div
          className="h-full origin-left animate-countdown-20s"
          style={{ backgroundColor: barColor }}
        />
      </div>
    </div>
  );
};

export default NotificationDock;
