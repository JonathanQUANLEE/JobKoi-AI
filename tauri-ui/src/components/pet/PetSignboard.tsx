import { useState, useEffect, type FC, type WheelEvent } from "react";
import { Clock, Sliders, ChevronUp, ChevronDown, Power, Volume2, VolumeX, X, Sparkles } from "lucide-react";
import { type PetScheduleConfig } from "./types";
import { loadScheduleConfig, saveScheduleConfig } from "./PetSchedulePopover";
import { usagiSound } from "./soundManager";

interface PetSignboardProps {
  visible: boolean;
  onClose: () => void;
  onOpenSettingsModal?: (tab?: string) => void;
  isMonochrome?: boolean;
  lang?: string;
  placement?: "top" | "bottom";
  horizontalAlign?: "center" | "left" | "right";
}

export const PetSignboard: FC<PetSignboardProps> = ({
  visible,
  onClose,
  onOpenSettingsModal,
  isMonochrome = false,
  lang = "zh",
  placement = "top",
  horizontalAlign = "center",
}) => {
  const [config, setConfig] = useState<PetScheduleConfig>(loadScheduleConfig);
  const [mode, setMode] = useState<"ask" | "picker">("ask");
  const [soundEnabled, setSoundEnabled] = useState(() => usagiSound.isEnabled());

  useEffect(() => {
    if (visible) {
      const current = loadScheduleConfig();
      setConfig(current);
      // 如果已经开启了定时，打开牌子时直接进入查看/调节状态，否则先问是否要开启
      setMode(current.enabled ? "picker" : "ask");
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

  const updateConfig = (updater: (prev: PetScheduleConfig) => PetScheduleConfig) => {
    setConfig((prev) => {
      const next = updater(prev);
      saveScheduleConfig(next);
      return next;
    });
  };

  if (!visible) return null;

  const [hoursStr, minutesStr] = config.time.split(":");
  const hours = parseInt(hoursStr || "9", 10);
  const minutes = parseInt(minutesStr || "0", 10);

  const handleWheelHours = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 1 : -1;
    const newHours = (hours + delta + 24) % 24;
    const newTime = `${String(newHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    updateConfig((prev) => ({ ...prev, time: newTime }));
  };

  const handleWheelMinutes = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 5 : -5;
    const newMinutes = (minutes + delta + 60) % 60;
    const newTime = `${String(hours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
    updateConfig((prev) => ({ ...prev, time: newTime }));
  };

  const adjustHours = (delta: number) => {
    const newHours = (hours + delta + 24) % 24;
    const newTime = `${String(newHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    updateConfig((prev) => ({ ...prev, time: newTime }));
  };

  const adjustMinutes = (delta: number) => {
    const newMinutes = (minutes + delta + 60) % 60;
    const newTime = `${String(hours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
    updateConfig((prev) => ({ ...prev, time: newTime }));
  };

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !soundEnabled;
    setSoundEnabled(next);
    usagiSound.setEnabled(next);
    if (next) {
      usagiSound.play("yaha");
    }
  };

  const isJa = lang === "ja";
  const placementClass = placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";
  const alignClass =
    horizontalAlign === "left"
      ? "left-0 translate-x-0"
      : horizontalAlign === "right"
      ? "right-0 translate-x-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`absolute ${placementClass} ${alignClass} w-64 z-50 select-none animate-in fade-in zoom-in-95 duration-200`}
    >
      {/* 卡通木质公告牌本体 */}
      <div
        className={`relative rounded-2xl p-3 shadow-2xl backdrop-blur-xl border transition-all ${
          isMonochrome
            ? "bg-zinc-950/95 text-zinc-100 border-zinc-700/80 shadow-black/80"
            : "bg-gradient-to-b from-stone-900/95 via-stone-950/95 to-black/95 text-stone-100 border-amber-600/40 shadow-amber-950/60 shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
        }`}
      >
        {/* 顶部木钉与标题行 */}
        <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 text-xs">🪧</span>
            <span className="text-[12px] font-bold tracking-tight text-amber-200">
              {isJa ? "ウサギの定時立て看板" : "定时巡航小木牌"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* 乌萨奇语音开关 */}
            <button
              type="button"
              onClick={handleToggleSound}
              className={`p-1 rounded-md text-[10px] transition-colors cursor-pointer ${
                soundEnabled
                  ? "text-amber-300 hover:bg-amber-500/20"
                  : "text-stone-500 hover:bg-stone-800"
              }`}
              title={soundEnabled ? (isJa ? "ボイス: オン" : "乌萨奇语音: 已开启") : (isJa ? "ボイス: オフ" : "乌萨奇语音: 已静音")}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
            </button>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-stone-400 hover:text-stone-200 hover:bg-stone-800/80 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 内容展示区 */}
        {mode === "ask" ? (
          /* 第一阶段：牌子询问模式 “你要定时吗？” */
          <div className="py-2.5 flex flex-col items-center text-center space-y-2.5">
            <div className="space-y-1">
              <div className="text-[13px] font-bold text-amber-100 flex items-center justify-center gap-1">
                <span>{isJa ? "定時巡航をセットする？⏰" : "你要开启定时巡航吗？⏰"}</span>
              </div>
              <p className="text-[10px] text-stone-400 px-1 leading-relaxed">
                {isJa
                  ? "毎日決まった時間に自動で求人巡航・応募を開始します！"
                  : "设定时间后，特助每天会在指定时刻准时自动帮您启动巡航打卡投递！"}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full pt-1">
              <button
                type="button"
                onClick={() => {
                  usagiSound.play("yaha");
                  setMode("picker");
                  updateConfig((prev) => ({ ...prev, enabled: true }));
                }}
                className="flex-1 py-1.5 px-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-[11px] shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
              >
                {isJa ? "はい、設定する！" : "是的，设定时间"}
              </button>

              <button
                type="button"
                onClick={() => {
                  usagiSound.play("ura");
                  onClose();
                }}
                className="py-1.5 px-3 rounded-xl bg-stone-800/90 hover:bg-stone-700/90 text-stone-300 font-medium text-[11px] border border-stone-700/60 active:scale-95 transition-all cursor-pointer"
              >
                {isJa ? "今はいいや" : "先不用啦"}
              </button>
            </div>
          </div>
        ) : (
          /* 第二阶段：时间段滚轮选择微板块 */
          <div className="py-2 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-[10px] text-stone-400">
                {isJa ? "マウスホイールで時間選択" : "鼠标滚轮滑动选时"}
              </span>

              {/* 快速总启停开关 */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !config.enabled;
                  updateConfig((prev) => ({ ...prev, enabled: nextState }));
                  if (nextState) usagiSound.play("celebrate");
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                  config.enabled
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20"
                    : "bg-stone-800 text-stone-400 border border-stone-700 hover:text-stone-300"
                }`}
              >
                <Power className={`h-2.5 w-2.5 ${config.enabled ? "text-emerald-400" : "text-stone-400"}`} />
                <span>{config.enabled ? (isJa ? "有効" : "已开启") : (isJa ? "無効" : "已暂停")}</span>
              </button>
            </div>

            {/* 滚轮小时与分钟选择器 */}
            <div className="flex items-center justify-center gap-2 my-1">
              {/* 小时卡片 */}
              <div
                onWheel={handleWheelHours}
                className={`group relative flex flex-col items-center justify-center w-14 py-1 rounded-xl border transition-all cursor-ns-resize ${
                  isMonochrome
                    ? "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
                    : "bg-stone-900 border-stone-700 hover:border-amber-500/50"
                }`}
                title={isJa ? "ホイールで時間を変更" : "鼠标滚轮增减小时"}
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
                <span className="text-[9px] text-stone-400 pb-0.5">{isJa ? "時" : "时"}</span>
              </div>

              <span className="text-xl font-bold font-mono text-amber-500/70 animate-pulse">:</span>

              {/* 分钟卡片 */}
              <div
                onWheel={handleWheelMinutes}
                className={`group relative flex flex-col items-center justify-center w-14 py-1 rounded-xl border transition-all cursor-ns-resize ${
                  isMonochrome
                    ? "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
                    : "bg-stone-900 border-stone-700 hover:border-amber-500/50"
                }`}
                title={isJa ? "ホイールで分を変更 (5分刻み)" : "鼠标滚轮增减分钟 (步长5分)"}
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
                <span className="text-[9px] text-stone-400 pb-0.5">{isJa ? "分" : "分"}</span>
              </div>
            </div>

            {/* 底部操作行 */}
            <div className="w-full mt-2.5 pt-2 border-t border-stone-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onOpenSettingsModal?.("schedule")}
                className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-medium transition-colors cursor-pointer"
              >
                <Sliders className="h-3 w-3" />
                <span>{isJa ? "詳細設定 »" : "详细设置 »"}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[10px] font-medium transition-colors cursor-pointer"
              >
                {isJa ? "完了" : "完成"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 牌子底部的小木桩支架 */}
      <div className="flex justify-center items-center gap-12 -mt-0.5 pointer-events-none">
        <div className="w-1.5 h-3 bg-gradient-to-b from-amber-700 to-amber-900 rounded-b shadow-md" />
        <div className="w-1.5 h-3 bg-gradient-to-b from-amber-700 to-amber-900 rounded-b shadow-md" />
      </div>
    </div>
  );
};

export default PetSignboard;
