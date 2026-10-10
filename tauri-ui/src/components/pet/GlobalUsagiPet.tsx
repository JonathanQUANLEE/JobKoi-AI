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

const USAGI_LINES_ZH = [
  "ヤハ！打工！打工！今天也要元气满满投递，拿下好 Offer！🌟",
  "ウラ！乌萨奇特助在此，冲冲冲拔草投递去喽！💪",
  "プルルルル！大风车转转转，好运 Offer 快快来！🌀",
  "哈？！点点我上面的木牌，定时自动巡航超省心~ ⏰",
  "记得喝杯水，活动一下脖子和眼睛哦~ 🍵",
  "フゥン！每一份投递都在向理想团队靠近！✨",
];

const USAGI_LINES_JA = [
  "ヤハ！今日も元気に巡航して内定を勝ち取ろう！🌟",
  "ウラ！ウサギ特助がいつでもサポートするよ！💪",
  "プルルルル！看板をクリックして定時巡航をセットしてね⏰",
  "水分補給とお茶休憩も忘れずにね🍵",
  "フゥン！一歩ずつ希望の職場に近づいてるよ！✨",
];

const POKE_LINES_ZH = [
  "ヤハッ！摸摸耳朵，求职锦鲤附体！(*^▽^*)",
  "ウラララ！收到主人的拍拍，元气值爆表！💥",
  "プルルルル！大风车甩手蓄力中！🌀",
  "哈？（歪头呆萌斜视）🐰",
  "呜啦啦啦啦！求职打怪升级冲冲冲！🔥",
];

const POKE_LINES_JA = [
  "ヤハッ！耳をなでなで、内定運UP！(*^▽^*)",
  "ウラララ！タップされて元気満タン！💥",
  "プルルルル！ぐるぐる腕回しチャージ中！🌀",
  "ハァ？（首をかしげる）🐰",
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
  const [speech, setSpeech] = useState("");
  const [speechVisible, setSpeechVisible] = useState(true);
  const [signboardOpen, setSignboardOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [soundOn, setSoundOn] = useState(() => usagiSound.isEnabled());

  const dragStartRef = useRef<{ startX: number; startY: number; petX: number; petY: number; moved: boolean } | null>(null);
  const cruiseScheduleCheckerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScheduledTriggerDateRef = useRef<string>("");
  const isJa = lang === "ja";

  // 1. 初始化气泡语言与问候
  useEffect(() => {
    setSpeech(isJa ? "ヤハ！求人巡航ウサギ特助だよ！" : "ヤハ！我是你的求职特助乌萨奇！");
    const t = setTimeout(() => {
      const pool = isJa ? USAGI_LINES_JA : USAGI_LINES_ZH;
      setSpeech(pool[0]);
    }, 4500);
    return () => clearTimeout(t);
  }, [isJa]);

  // 2. 窗口尺寸调整时防止乌萨奇掉出屏幕边界
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        const maxX = Math.max(20, window.innerWidth - 85);
        const maxY = Math.max(60, window.innerHeight - 95);
        const clampedX = Math.min(Math.max(10, prev.x), maxX);
        const clampedY = Math.min(Math.max(50, prev.y), maxY);
        if (clampedX !== prev.x || clampedY !== prev.y) {
          const next = { x: clampedX, y: clampedY };
          try {
            localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(next));
          } catch {}
          return next;
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
        usagiSound.play("grabbed");
        setSpeech(isJa ? "ウラ！お引越し中！🎈" : "哇！被抓起来转移阵地啦！🎈");
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
        // 拖拽落地：保存停靠位置，播放落地音效 (spawn.wav)
        setAction("jump");
        usagiSound.play("spawn");
        setSpeech(isJa ? "ここに決めた！🐾" : "就在这里安家啦！🐾");
        try {
          localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(pos));
        } catch {}
        setTimeout(() => setAction("idle"), 600);
      } else {
        // 纯点击：触发单击互动，随机播放问候 (hi.wav) 或经典歪头 (mock.wav)
        setAction("jump");
        if (Math.random() < 0.25) {
          usagiSound.play("mock");
        } else {
          usagiSound.play("hi");
        }
        const pool = isJa ? POKE_LINES_JA : POKE_LINES_ZH;
        setSpeech(pool[Math.floor(Math.random() * pool.length)]);
        setSpeechVisible(true);
        setSignboardOpen(true);
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
  }, [isDragging, pos, isJa]);

  // 4. 双击乌萨奇：经典大风车甩手旋转 (Usagi Roll) + 狂舞音效 (danceswirl.wav)
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAction("roll");
    usagiSound.play("danceswirl");
    setSpeech(isJa ? "プルルルルルル！🌀💥" : "プルルルルルル！🌀💥");
    setSpeechVisible(true);
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
    usagiSound.play("hi");
    setSpeech(isJa ? "側辺に戻ったよ！🏠" : "回到侧边栏啦！🏠");
  };

  // 6. 巡航状态联动 (开启狂欢进行曲 dance.wav)
  useEffect(() => {
    if (running) {
      setAction("running");
      setSpeech(isJa ? "ヤハ！全速力で求人巡航中！🚀" : "ヤハ！全速巡航打卡投递中！🚀");
      usagiSound.play("dance");
    } else {
      if (action === "running") {
        setAction("jump");
        setSpeech(isJa ? "ウラ！本次巡航完了！🎉" : "太棒啦！本次巡航圆满完成🎉");
        usagiSound.play("celebrate");
        setTimeout(() => setAction("idle"), 3000);
      }
    }
  }, [running, isJa]);

  // 7. 定时巡航后台检查器 (每 30 秒核验一次)
  useEffect(() => {
    const checkCruiseSchedule = () => {
      const schedule = loadScheduleConfig();
      if (!schedule.enabled) return;

      const now = new Date();
      const currentDay = now.getDay();
      const pad = (n: number) => String(n).padStart(2, "0");
      const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const todayDateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_${currentTimeStr}`;

      if (
        schedule.repeatDays.includes(currentDay) &&
        currentTimeStr === schedule.time &&
        lastScheduledTriggerDateRef.current !== todayDateKey
      ) {
        lastScheduledTriggerDateRef.current = todayDateKey;

        notify({
          type: "info",
          text: `⏰ 定时巡航时间已到达 (${schedule.time})，特助乌萨奇正在自动为您开启巡航！`,
          source: "定时巡航系统",
        });

        usagiSound.play("celebrate");

        if (schedule.autoRun && onStartRun && !running) {
          onStartRun();
        }
      }
    };

    checkCruiseSchedule();
    cruiseScheduleCheckerRef.current = setInterval(checkCruiseSchedule, 30000);
    return () => {
      if (cruiseScheduleCheckerRef.current) clearInterval(cruiseScheduleCheckerRef.current);
    };
  }, [notify, onStartRun, running]);

  // 判断木牌和气泡是否因为靠近屏幕顶部而需要向下展开
  const isNearTop = pos.y < 230;

  return (
    <div
      style={{
        position: "fixed",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: isDragging ? 9999 : 50,
        transition: isDragging ? "none" : "transform 0.1s ease-out",
      }}
      className="select-none pointer-events-auto"
    >
      {/* 定时巡航小木牌 (点击乌萨奇后弹出) */}
      <PetSignboard
        visible={signboardOpen}
        onClose={() => setSignboardOpen(false)}
        onOpenSettingsModal={onOpenSettingsModal}
        isMonochrome={isMonochrome}
        lang={lang}
        placement={isNearTop ? "bottom" : "top"}
        horizontalAlign={pos.x < 130 ? "left" : typeof window !== "undefined" && pos.x > window.innerWidth - 180 ? "right" : "center"}
      />

      {/* 乌萨奇对话气泡 */}
      <div
        className={`absolute ${
          isNearTop ? "top-full mt-2" : "bottom-full mb-3"
        } left-1/2 -translate-x-1/2 z-40 pointer-events-none`}
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

      {/* 乌萨奇精灵本体 */}
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
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-stone-900/90 border border-stone-700/80 rounded-full px-1.5 py-0.5 shadow-lg backdrop-blur-md text-[9px] text-stone-300 pointer-events-auto">
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
              if (next) usagiSound.play("yaha");
            }}
            className="hover:text-amber-300 cursor-pointer"
            title={soundOn ? "静音" : "开启声音"}
          >
            {soundOn ? <Volume2 className="h-2.5 w-2.5" /> : <VolumeX className="h-2.5 w-2.5 text-stone-500" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalUsagiPet;
