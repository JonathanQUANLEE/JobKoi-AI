import { useState, useEffect, type FC, type WheelEvent } from "react";
import { Clock, Sliders, ChevronUp, ChevronDown, Check, Power } from "lucide-react";
import { type PetScheduleConfig, DEFAULT_SCHEDULE_CONFIG } from "./types";

interface PetSchedulePopoverProps {
  visible: boolean;
  onClose?: () => void;
  onOpenSettingsModal?: (tab?: any) => void;
  isMonochrome?: boolean;
  onScheduleChange?: (config: PetScheduleConfig) => void;
}

const STORAGE_KEY = "jobhunter_pet_schedule";

export function loadScheduleConfig(): PetScheduleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SCHEDULE_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_SCHEDULE_CONFIG;
}

export function saveScheduleConfig(config: PetScheduleConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("jobhunter_pet_schedule_updated", { detail: config })
      );
    }
  } catch {}
}

export const PetSchedulePopover: FC<PetSchedulePopoverProps> = ({
  visible,
  onOpenSettingsModal,
  isMonochrome = false,
  onScheduleChange,
}) => {
  const [config, setConfig] = useState<PetScheduleConfig>(loadScheduleConfig);

  useEffect(() => {
    if (visible) {
      setConfig(loadScheduleConfig());
    }
  }, [visible]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<PetScheduleConfig>;
      if (customEvent.detail) {
        setConfig(customEvent.detail);
      }
    };
    window.addEventListener("jobhunter_pet_schedule_updated", handleUpdate);
    return () => {
      window.removeEventListener("jobhunter_pet_schedule_updated", handleUpdate);
    };
  }, []);

  useEffect(() => {
    saveScheduleConfig(config);
    onScheduleChange?.(config);
  }, [config, onScheduleChange]);

  if (!visible) return null;

  const [hoursStr, minutesStr] = config.time.split(":");
  const hours = parseInt(hoursStr || "9", 10);
  const minutes = parseInt(minutesStr || "0", 10);

  // 鼠标滚轮滑动调节小时 (00 - 23 循环滚动)
  const handleWheelHours = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 1 : -1;
    const newHours = (hours + delta + 24) % 24;
    const newTime = `${String(newHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    setConfig((prev) => ({ ...prev, time: newTime }));
  };

  // 鼠标滚轮滑动调节分钟 (00 - 55，按 5 分钟档位滚动)
  const handleWheelMinutes = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 5 : -5;
    const newMinutes = (minutes + delta + 60) % 60;
    const newTime = `${String(hours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
    setConfig((prev) => ({ ...prev, time: newTime }));
  };

  const adjustHours = (delta: number) => {
    const newHours = (hours + delta + 24) % 24;
    const newTime = `${String(newHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    setConfig((prev) => ({ ...prev, time: newTime }));
  };

  const adjustMinutes = (delta: number) => {
    const newMinutes = (minutes + delta + 60) % 60;
    const newTime = `${String(hours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
    setConfig((prev) => ({ ...prev, time: newTime }));
  };

  const toggleEnabled = () => {
    setConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-2xl p-3 shadow-2xl backdrop-blur-xl z-50 select-none border transition-all animate-in fade-in zoom-in-95 duration-150 ${
        isMonochrome
          ? "bg-zinc-950/95 text-zinc-100 border-zinc-700/80 shadow-black/80"
          : "bg-stone-950/95 text-stone-100 border-amber-500/30 shadow-amber-950/50"
      }`}
    >
      {/* 顶部标题与快速启停开关 */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--grid)]">
        <div className="flex items-center gap-1.5">
          <Clock className={`h-3.5 w-3.5 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
          <span className="text-xs font-bold">快捷定时巡航</span>
        </div>
        <button
          type="button"
          onClick={toggleEnabled}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
            config.enabled
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20"
              : "bg-stone-800 text-stone-400 border border-stone-700 hover:text-stone-300"
          }`}
          title={config.enabled ? "点击暂停定时" : "点击启动定时"}
        >
          <Power className={`h-2.5 w-2.5 ${config.enabled ? "text-emerald-400" : "text-stone-400"}`} />
          <span>{config.enabled ? "已开启" : "已关闭"}</span>
        </button>
      </div>

      {/* 滚轮滑动选择时间段主体区域 */}
      <div className="py-2.5 flex flex-col items-center">
        <div className="text-[10px] text-stone-400 mb-1.5 flex items-center gap-1">
          <span>滚动鼠标滚轮快速选时</span>
        </div>

        <div className="flex items-center justify-center gap-2">
          {/* 小时滚轮卡片 */}
          <div
            onWheel={handleWheelHours}
            className={`group relative flex flex-col items-center justify-center w-14 py-1 rounded-xl border transition-all cursor-ns-resize ${
              isMonochrome
                ? "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
                : "bg-stone-900 border-[var(--grid)] hover:border-amber-500/50"
            }`}
            title="鼠标滚轮向上/向下滚动增减小时"
          >
            <button
              type="button"
              onClick={() => adjustHours(1)}
              className="text-stone-500 hover:text-stone-200 p-0.5"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <div className="font-mono text-xl font-bold tracking-tight text-[var(--ink)]">
              {String(hours).padStart(2, "0")}
            </div>
            <button
              type="button"
              onClick={() => adjustHours(-1)}
              className="text-stone-500 hover:text-stone-200 p-0.5"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <span className="text-[9px] text-stone-400 pb-0.5">时</span>
          </div>

          <span className="text-xl font-bold font-mono text-stone-500 animate-pulse">:</span>

          {/* 分钟滚轮卡片 */}
          <div
            onWheel={handleWheelMinutes}
            className={`group relative flex flex-col items-center justify-center w-14 py-1 rounded-xl border transition-all cursor-ns-resize ${
              isMonochrome
                ? "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
                : "bg-stone-900 border-[var(--grid)] hover:border-amber-500/50"
            }`}
            title="鼠标滚轮向上/向下滚动增减分钟 (每次5分)"
          >
            <button
              type="button"
              onClick={() => adjustMinutes(5)}
              className="text-stone-500 hover:text-stone-200 p-0.5"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <div className="font-mono text-xl font-bold tracking-tight text-[var(--ink)]">
              {String(minutes).padStart(2, "0")}
            </div>
            <button
              type="button"
              onClick={() => adjustMinutes(-5)}
              className="text-stone-500 hover:text-stone-200 p-0.5"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <span className="text-[9px] text-stone-400 pb-0.5">分</span>
          </div>
        </div>

        {/* 状态轻提示 */}
        <div className="mt-2 text-[10px] text-stone-400 flex items-center gap-1">
          {config.enabled ? (
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              每天 {config.time} 准时帮您巡航
            </span>
          ) : (
            <span className="text-stone-500">点击右上角开启自动打卡</span>
          )}
        </div>
      </div>

      {/* 底部跳转进入详细系统设置 */}
      <div className="pt-2 border-t border-[var(--grid)] flex items-center justify-between">
        <span className="text-[10px] text-stone-400">周重复/告警</span>
        <button
          type="button"
          onClick={() => onOpenSettingsModal?.("schedule")}
          className={`flex items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer ${
            isMonochrome
              ? "text-zinc-300 hover:text-white"
              : "text-amber-400 hover:text-amber-300"
          }`}
        >
          <Sliders className="h-3 w-3" />
          <span>详细设置 »</span>
        </button>
      </div>
    </div>
  );
};

export default PetSchedulePopover;
