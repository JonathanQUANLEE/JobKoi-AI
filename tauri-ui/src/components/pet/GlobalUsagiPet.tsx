import { useState, useEffect, useRef, useCallback, type FC } from "react";
import { Sparkles, RotateCcw, Volume2, VolumeX } from "lucide-react";
import PetSprite from "./PetSprite";
import PetSpeechBubble from "./PetSpeechBubble";
import PetSignboard from "./PetSignboard";
import { loadScheduleConfig } from "./PetSchedulePopover";
import { useRunStore } from "../../store";
import { usagiSound } from "./soundManager";
import { type PetAction } from "./types";

interface GlobalUsagiPetProps {
  running: boolean;
  onStartRun?: () => void;
  onOpenSettingsModal?: (tab?: string) => void;
  lang?: string;
  sidebarCollapsed?: boolean;
}

const STORAGE_POS_KEY = "jobhunter_usagi_floating_pos";

const USAGI_LINES = [
  "打工！打工！今天也要元气满满投递，拿下好 Offer！🌟",
  "乌萨奇特助在此，冲冲冲拔草投递去喽！💪",
  "大风车转转转，好运 Offer 快快来！🌀",
  "点点我上面的小木牌，定时自动巡航超省心~ ⏰",
  "记得喝杯水，活动一下脖子和眼睛哦~ 🍵",
  "每一份投递都在向理想团队靠近！✨",
];

const POKE_LINES = [
  "摸摸耳朵，求职锦鲤附体！(*^▽^*)",
  "收到主人的拍拍，元气值爆表！💥",
  "大风车甩手蓄力中！🌀",
  "看什么看！还不快去刷Boss直聘！🐰",
  "求职打怪升级冲冲冲！🔥",
];

export const GlobalUsagiPet: FC<GlobalUsagiPetProps> = ({
  running,
  onStartRun,
  onOpenSettingsModal,
  lang = "zh",
  sidebarCollapsed = false,
}) => {
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");
  const notify = useRunStore((s) => s.notify);

  // 获取默认侧边栏底座坐标
  const getDefaultPos = useCallback(() => {
    const defaultX = sidebarCollapsed ? 20 : 38;
    const defaultY = typeof window !== "undefined" ? Math.max(100, window.innerHeight - 135) : 600;
    return { x: defaultX, y: defaultY };
  }, [sidebarCollapsed]);

  // 从本地存储恢复用户停放的绝对坐标 (方案 A：用户放置在哪里，就停留在哪里)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_POS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed;
        }
      }
    } catch {}
    return { x: 38, y: typeof window !== "undefined" ? window.innerHeight - 135 : 600 };
  });

  const [action, setAction] = useState<PetAction>("idle");
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [speech, setSpeech] = useState("我是你的求职特助乌萨奇！");
  const [speechVisible, setSpeechVisible] = useState(true);
  const [signboardOpen, setSignboardOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [soundOn, setSoundOn] = useState(() => usagiSound.isEnabled());

  const dragStartRef = useRef<{ startX: number; startY: number; petX: number; petY: number; moved: boolean } | null>(null);
  const cruiseScheduleCheckerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScheduledTriggerDateRef = useRef<string>("");

  // 1. 初始化气泡问候
  useEffect(() => {
    setSpeech("打工！打工！今天也要拿下好Offer！🌟");
    const t = setTimeout(() => {
      setSpeech(USAGI_LINES[0]);
    }, 4500);
    return () => clearTimeout(t);
  }, []);

  // 2. 窗口尺寸调整时防止乌萨奇掉出屏幕边界
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        const maxX = Math.max(20, window.innerWidth - 85);
        const maxY = Math.max(60, window.innerHeight - 95);
        const nextX = Math.min(Math.max(10, prev.x), maxX);
        const nextY = Math.min(Math.max(50, prev.y), maxY);
        if (nextX !== prev.x || nextY !== prev.y) {
          const clamped = { x: nextX, y: nextY };
          try {
            localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(clamped));
          } catch {}
          return clamped;
        }
        return prev;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 3. 全局拖拽逻辑（方案 A：无死角全窗口随意拖拽、松手定格停靠）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      petX: pos.x,
      petY: pos.y,
      moved: false,
    };
    setIsDragging(true);
  }, [pos.x, pos.y]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;

      if (!dragStartRef.current.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        dragStartRef.current.moved = true;
        setAction("jump");
        const msg = "快放我下来！快放我下来！抓本兔子干嘛！救命啊！🎈";
        setSpeech(msg);
        usagiSound.play("grabbed");
      }

      if (dragStartRef.current.moved) {
        if (dx > 0) setFacing("right");
        else if (dx < 0) setFacing("left");

        const maxX = Math.max(20, window.innerWidth - 85);
        const maxY = Math.max(60, window.innerHeight - 95);
        const nextX = Math.min(Math.max(10, dragStartRef.current.petX + dx), maxX);
        const nextY = Math.min(Math.max(50, dragStartRef.current.petY + dy), maxY);

        setPos({ x: nextX, y: nextY });
      }
    };

    const handleMouseUp = () => {
      if (!dragStartRef.current) return;
      const didMove = dragStartRef.current.moved;
      setIsDragging(false);

      if (didMove) {
        // 拖拽落地：保存停靠位置，播放短视频 AI 落地音效 (zh_dock.mp3)
        setAction("jump");
        const msg = "打工！打工！今天也要拿下好Offer！冲冲冲！🐾";
        setSpeech(msg);
        usagiSound.play("dock");
        try {
          localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(pos));
        } catch {}
        setTimeout(() => setAction("idle"), 600);
      } else {
        // 纯点击：触发单击互动，弹出定时木牌
        setAction("jump");
        const msg = "你要开启定时巡航打招呼吗？快点我设定！⏰";
        setSpeech(msg);
        setSpeechVisible(true);
        setSignboardOpen(true);
        usagiSound.play("signboard_ask");
        setTimeout(() => setAction("idle"), 500);
      }

      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, pos]);

  // 4. 双击乌萨奇：经典大风车甩手旋转 + 短视频爆款大风车音效 (zh_windmill.mp3)
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAction("roll");
    const msg = "大风车转转转！转死所有不理人的HR！转转转！🌀💥";
    setSpeech(msg);
    setSpeechVisible(true);
    usagiSound.play("windmill");
    setTimeout(() => {
      setAction("idle");
    }, 2400);
  };

  // 5. 一键归位回侧边栏
  const handleResetToSidebar = (e: React.MouseEvent) => {
    e.stopPropagation();
    const def = getDefaultPos();
    setPos(def);
    try {
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(def));
    } catch {}
    const msg = "回工位打卡！时刻待命！🏠";
    setSpeech(msg);
    usagiSound.play("reset_sidebar");
  };

  // 6. 巡航状态联动
  useEffect(() => {
    if (running) {
      setAction("running");
      const msg = "开始巡航打招呼！全速冲刺！今天必拿Offer！🚀";
      setSpeech(msg);
      usagiSound.play("cruise");
    } else {
      if (action === "running") {
        setAction("jump");
        const msg = "太棒啦！本次巡航圆满完成🎉";
        setSpeech(msg);
        usagiSound.play("dock");
        setTimeout(() => setAction("idle"), 3000);
      }
    }
  }, [running]);

  // 7. 定时巡航后台检查器 (每 30 秒核验一次)
  useEffect(() => {
    const checkCruiseSchedule = () => {
      const schedule = loadScheduleConfig();
      if (!schedule.enabled) return;

      const now = new Date();
      const currentDay = now.getDay();
      if (!schedule.repeatDays.includes(currentDay)) return;

      const [targetH, targetM] = schedule.time.split(":").map(Number);
      if (isNaN(targetH) || isNaN(targetM)) return;

      const nowH = now.getHours();
      const nowM = now.getMinutes();
      const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${targetH}:${targetM}`;

      if (nowH === targetH && nowM === targetM && lastScheduledTriggerDateRef.current !== todayStr) {
        lastScheduledTriggerDateRef.current = todayStr;
        if (!running) {
          notify?.({
            type: "info",
            source: "定时打卡",
            text: `特助乌萨奇准时为您启动每日巡航！(${schedule.time})`,
          });
          setSpeech(`每日定时到点啦！(${schedule.time}) 乌萨奇全速出击！🚀`);
          setSpeechVisible(true);
          usagiSound.play("cruise");
          onStartRun?.();
        }
      }
    };

    checkCruiseSchedule();
    cruiseScheduleCheckerRef.current = setInterval(checkCruiseSchedule, 30000);
    return () => {
      if (cruiseScheduleCheckerRef.current) {
        clearInterval(cruiseScheduleCheckerRef.current);
      }
    };
  }, [running, onStartRun, notify]);

  // 8. 闲置气泡与动作周期
  useEffect(() => {
    const speechTimer = setInterval(() => {
      if (!isDragging && !signboardOpen && action !== "running" && action !== "roll") {
        const pool = USAGI_LINES;
        const line = pool[Math.floor(Math.random() * pool.length)];
        setSpeech(line);
        setSpeechVisible(true);
      }
    }, 18000);

    const actionTimer = setInterval(() => {
      if (!isDragging && !signboardOpen && action !== "running" && action !== "roll") {
        const rnd = Math.random();
        if (rnd < 0.35) {
          setAction("jump");
          setTimeout(() => setAction("idle"), 600);
        } else if (rnd < 0.6) {
          setFacing((prev) => (prev === "left" ? "right" : "left"));
        }
      }
    }, 7000);

    return () => {
      clearInterval(speechTimer);
      clearInterval(actionTimer);
    };
  }, [isDragging, signboardOpen, action]);

  return (
    <div
      style={{
        position: "fixed",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: 50,
        touchAction: "none",
        transition: isDragging ? "none" : "box-shadow 0.2s ease",
      }}
      className="select-none flex flex-col items-center"
    >
      {/* 顶部对话气泡 */}
      <div className="absolute bottom-[68px] z-50 pointer-events-none">
        <PetSpeechBubble
          message={speech}
          visible={speechVisible && !signboardOpen}
          isMonochrome={isMonochrome}
        />
      </div>

      {/* 点击弹出的卡通定时小木牌 */}
      <PetSignboard
        visible={signboardOpen}
        onClose={() => setSignboardOpen(false)}
        onOpenSettingsModal={onOpenSettingsModal}
        isMonochrome={isMonochrome}
        lang={lang}
        placement={pos.y < 280 ? "bottom" : "top"}
      />

      {/* 乌萨奇本体交互区域 */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="relative group cursor-grab active:cursor-grabbing flex flex-col items-center"
      >
        <PetSprite
          action={action}
          facing={facing}
          interactive={false}
        />

        {/* 乌萨奇脚底柔和悬浮阴影 */}
        <div
          style={{
            transform: `scale(${isDragging ? 0.45 : 1})`,
            opacity: isDragging ? 0.2 : 0.65,
            transition: "transform 0.2s ease, opacity 0.2s ease",
          }}
          className="w-12 h-1.5 rounded-full bg-black/60 blur-[2px] -mt-1 pointer-events-none"
        />

        {/* 悬停微按钮条 (一键归位回侧边栏 / 快速静音) */}
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-stone-900/90 border border-stone-700/80 rounded-full px-2 py-0.5 shadow-lg backdrop-blur-md text-[9px] text-stone-300 pointer-events-auto whitespace-nowrap">
          <button
            type="button"
            onClick={handleResetToSidebar}
            className="hover:text-amber-300 flex items-center gap-0.5 cursor-pointer"
            title="一键放回侧边栏"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>归位</span>
          </button>
          <span className="text-stone-600">|</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const next = !soundOn;
              setSoundOn(next);
              usagiSound.setEnabled(next);
              if (next) usagiSound.play("click");
            }}
            className="hover:text-amber-300 cursor-pointer flex items-center gap-0.5"
            title={soundOn ? "静音" : "开启声音"}
          >
            {soundOn ? <Volume2 className="h-2.5 w-2.5" /> : <VolumeX className="h-2.5 w-2.5 text-stone-500" />}
            <span>{soundOn ? "声音" : "静音"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalUsagiPet;
