import { useState, useEffect, type FC } from "react";
import { Clock, Volume2, VolumeX, Sparkles, Moon } from "lucide-react";
import PetSprite from "./PetSprite";
import PetSpeechBubble from "./PetSpeechBubble";
import PetSignboard from "./PetSignboard";
import { loadScheduleConfig } from "./PetSchedulePopover";
import { usePetController } from "./usePetController";
import { useRunStore } from "../../store";
import { usagiSound } from "./soundManager";

interface SidebarPetProps {
  running: boolean;
  onStartRun?: () => void;
  onOpenSettingsModal?: (tab?: string) => void;
  lang?: string;
}

export const SidebarPet: FC<SidebarPetProps> = ({
  running,
  onStartRun,
  onOpenSettingsModal,
  lang = "zh",
}) => {
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");
  const [scheduleConfig, setScheduleConfig] = useState(loadScheduleConfig);
  const [soundOn, setSoundOn] = useState(() => usagiSound.isEnabled());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail) {
        setScheduleConfig(customEvent.detail);
      } else {
        setScheduleConfig(loadScheduleConfig());
      }
    };
    window.addEventListener("jobhunter_pet_schedule_updated", handleUpdate);
    return () => {
      window.removeEventListener("jobhunter_pet_schedule_updated", handleUpdate);
    };
  }, []);

  const {
    action,
    facing,
    tilt,
    posX,
    speech,
    speechVisible,
    isDragging,
    dragOffset,
    signboardOpen,
    handlePetClick,
    handlePetDoubleClick,
    handleMouseDown,
    setSignboardOpen,
    setSpeechVisible,
  } = usePetController({ running, onStartRun, lang });

  const isJa = lang === "ja";

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !soundOn;
    setSoundOn(next);
    usagiSound.setEnabled(next);
    if (next) {
      usagiSound.play("yaha");
    }
  };

  return (
    <div className="relative w-full px-3 py-1.5 shrink-0 select-none overflow-visible">
      {/* 快捷定时告示小木牌 (点击乌萨奇后触发弹出) */}
      <PetSignboard
        visible={signboardOpen}
        onClose={() => setSignboardOpen(false)}
        onOpenSettingsModal={onOpenSettingsModal}
        isMonochrome={isMonochrome}
        lang={lang}
      />

      {/* 顶部极简状态标签 (非方框，纯文本轻量装饰) */}
      <div className="flex items-center justify-between px-1 mb-1 text-[10px] text-stone-400">
        <div className="flex items-center gap-1.5">
          {running ? (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>{isJa ? "巡航中" : "巡航中"}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400/90 font-medium">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>{isJa ? "ウサギ特助" : "乌萨奇特助"}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* 声音切换图标 */}
          <button
            type="button"
            onClick={toggleSound}
            className={`p-0.5 rounded transition-colors cursor-pointer ${
              soundOn ? "text-amber-400/80 hover:text-amber-300" : "text-stone-500 hover:text-stone-300"
            }`}
            title={soundOn ? (isJa ? "ボイス: オン" : "语音已开启") : (isJa ? "ボイス: オフ" : "语音已静音")}
          >
            {soundOn ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
          </button>

          {/* 右上角定时入口微胶囊 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSignboardOpen((prev) => !prev);
              if (!signboardOpen) usagiSound.play("yaha");
            }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all cursor-pointer ${
              scheduleConfig.enabled
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-stone-800/80 hover:bg-stone-700/80 text-stone-400 hover:text-stone-200 border border-stone-700/60"
            }`}
            title={isJa ? "定時看板を開く" : "点击弹出定时小木牌"}
          >
            <Clock className="h-2.5 w-2.5" />
            <span>{scheduleConfig.enabled ? scheduleConfig.time : (isJa ? "定時" : "定时")}</span>
          </button>
        </div>
      </div>

      {/* 乌萨奇自由走动开放走廊 (无边框约束，彻底移除外框与底座) */}
      <div className="relative w-full h-[95px] overflow-visible">
        {/* 对话气泡 (跟随乌萨奇水平移动) */}
        <div
          style={{
            transform: `translate3d(${posX + dragOffset.x}px, ${dragOffset.y}px, 0)`,
            transition: isDragging ? "none" : "transform 0.08s linear",
          }}
          className="absolute -top-3 left-0 z-20 pointer-events-none"
        >
          <div className="pointer-events-auto">
            <PetSpeechBubble
              message={speech}
              visible={speechVisible && !signboardOpen}
              isMonochrome={isMonochrome}
              onClick={() => setSpeechVisible(false)}
            />
          </div>
        </div>

        {/* 乌萨奇精灵本体 (沿轨道自主漫步) */}
        <div
          style={{
            transform: `translate3d(${posX + dragOffset.x}px, ${dragOffset.y}px, 0)`,
            transition: isDragging ? "none" : "transform 0.08s linear",
          }}
          className="absolute bottom-0 left-0 z-10 flex flex-col items-center cursor-pointer"
        >
          <PetSprite
            action={action}
            facing={facing}
            tilt={tilt}
            onClick={handlePetClick}
            onDoubleClick={handlePetDoubleClick}
            onMouseDown={handleMouseDown}
          />

          {/* 乌萨奇脚底柔和阴影 */}
          <div
            style={{
              transform: `scale(${isDragging ? 0.5 : 1})`,
              opacity: isDragging ? 0.2 : 0.6,
              transition: "transform 0.2s ease, opacity 0.2s ease",
            }}
            className="w-12 h-1.5 rounded-full bg-black/60 blur-[2px] -mt-1 pointer-events-none"
          />
        </div>

        {/* 地面微光浅导轨 (给视觉提供自然的物理着地感，无生硬外框) */}
        <div className="absolute bottom-0 left-2 right-2 h-[1px] bg-gradient-to-r from-transparent via-stone-700/40 to-transparent pointer-events-none" />
      </div>

      {/* 底部极轻量互动提示 */}
      <div className="text-[9px] text-stone-500 text-center tracking-tight mt-0.5 opacity-60 hover:opacity-100 transition-opacity">
        {isDragging
          ? (isJa ? "放すと着地 🐾" : "松开鼠标落地 🐾")
          : (isJa ? "クリックで定時看板 / ダブルクリックで回転！" : "点击弹出定时木牌 · 双击甩手旋转")}
      </div>
    </div>
  );
};

export default SidebarPet;
