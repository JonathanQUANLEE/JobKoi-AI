import { useState, useRef, type FC } from "react";
import { Clock, Moon, Sparkles } from "lucide-react";
import PetSprite from "./PetSprite";
import PetSpeechBubble from "./PetSpeechBubble";
import PetSchedulePopover, { loadScheduleConfig } from "./PetSchedulePopover";
import { usePetController } from "./usePetController";
import { useRunStore } from "../../store";

interface SidebarPetProps {
  running: boolean;
  onStartRun?: () => void;
  onOpenSettingsModal?: () => void;
}

export const SidebarPet: FC<SidebarPetProps> = ({
  running,
  onStartRun,
  onOpenSettingsModal,
}) => {
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    action,
    facing,
    tilt,
    speech,
    speechVisible,
    isSleeping,
    isDragging,
    dragOffset,
    handlePetClick,
    handleMouseDown,
    handleContainerMouseMove,
    handleContainerMouseLeave,
    setSpeechVisible,
  } = usePetController({ running, onStartRun });

  const scheduleConfig = loadScheduleConfig();

  // 鼠标悬停进入微板块呼出逻辑
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    // 延迟 200ms 触发，防止快速划过误触
    hoverTimeoutRef.current = setTimeout(() => {
      setScheduleOpen(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setScheduleOpen(false);
    }, 450); // 留出 450ms 缓冲让用户移入微板块内操作
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => {
        handleMouseLeave();
        handleContainerMouseLeave();
      }}
      onMouseMove={handleContainerMouseMove}
      className="relative px-3 py-2 shrink-0 select-none group"
    >
      {/* 快捷定时微板块悬浮层 (双轨融合系统入口) */}
      <PetSchedulePopover
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onOpenSettingsModal={onOpenSettingsModal}
        isMonochrome={isMonochrome}
      />

      {/* 宠物温情对话气泡 */}
      <PetSpeechBubble
        message={speech}
        visible={speechVisible && !scheduleOpen}
        isSleeping={isSleeping}
        isMonochrome={isMonochrome}
        onClick={() => setSpeechVisible(false)}
      />

      {/* 宠物底座栖息舱 (Pedestal Habitat) */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-2xl p-2.5 transition-all duration-300 border backdrop-blur-md overflow-visible ${
          isMonochrome
            ? "bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700/90 shadow-sm"
            : "bg-gradient-to-b from-stone-900/50 to-stone-950/80 border-[var(--grid)] hover:border-amber-500/30 shadow-md shadow-black/20"
        }`}
      >
        {/* 底座微光光晕 (Habitat Ambient Glow) */}
        <div
          className={`absolute inset-0 rounded-2xl opacity-40 pointer-events-none transition-opacity group-hover:opacity-75 ${
            isMonochrome
              ? "bg-[radial-gradient(ellipse_at_bottom,rgba(255,255,255,0.06),transparent_70%)]"
              : "bg-[radial-gradient(ellipse_at_bottom,rgba(245,158,11,0.08),transparent_70%)]"
          }`}
        />

        {/* 顶部小功能标签 (定时状态与瞌睡状态微标) */}
        <div className="w-full flex items-center justify-between mb-1 z-10 px-1 text-[10px]">
          <div className="flex items-center gap-1 text-[var(--muted-fg)]">
            {isSleeping ? (
              <span className="flex items-center gap-1 text-indigo-400">
                <Moon className="h-3 w-3 animate-pulse" />
                <span>小憩中</span>
              </span>
            ) : running ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>巡航中</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-stone-400">
                <Sparkles className="h-3 w-3 text-amber-400" />
                <span>求职特助</span>
              </span>
            )}
          </div>

          {/* 右上角定时入口微胶囊 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScheduleOpen((prev) => !prev);
            }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all cursor-pointer ${
              scheduleConfig.enabled
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-stone-800/80 hover:bg-stone-700/80 text-stone-400 hover:text-stone-200 border border-[var(--grid)]"
            }`}
            title="快捷定时微板块 (悬停或点击呼出)"
          >
            <Clock className="h-2.5 w-2.5" />
            <span>{scheduleConfig.enabled ? scheduleConfig.time : "定时"}</span>
          </button>
        </div>

        {/* 宠物精灵主体与底座阴影 */}
        <div
          style={{
            transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
            transition: isDragging
              ? "none"
              : "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
          className="relative z-10 flex flex-col items-center justify-center my-1"
        >
          <PetSprite
            action={action}
            facing={facing}
            tilt={tilt}
            onClick={handlePetClick}
            onMouseDown={handleMouseDown}
          />

          {/* 宠物脚底椭圆投影 (Shadow Cushion) */}
          <div
            style={{
              transform: `scale(${isDragging ? 0.6 : 1})`,
              opacity: isDragging ? 0.3 : 0.7,
              transition: "transform 0.2s ease, opacity 0.2s ease",
            }}
            className="w-14 h-2 rounded-full bg-black/60 blur-[2px] mt-0.5 pointer-events-none"
          />
        </div>

        {/* 底部互动辅助轻提示语 */}
        <div className="text-[9px] text-stone-500 text-center tracking-tight mt-1 opacity-75 group-hover:opacity-100 transition-opacity">
          {isDragging
            ? "松开鼠标落地 🐾"
            : "可戳戳互动 / 拖拽 / 悬停选时"}
        </div>
      </div>
    </div>
  );
};

export default SidebarPet;
