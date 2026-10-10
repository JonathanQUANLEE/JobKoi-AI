import { useState, useEffect, useRef, useCallback } from "react";
import { type PetAction, type PetScheduleConfig } from "./types";
import { loadScheduleConfig } from "./PetSchedulePopover";
import { useRunStore } from "../../store";

const GREETING_POOL = [
  "主人今天投了好多岗位喵~ 🌟",
  "求职路上有我陪你，Offer 触手可及！",
  "记得喝水休息一下眼睛哦~ 🍵",
  "随时待命，今天也要元气满满！💪",
  "点击我头上的时钟，快速定闹钟哦~ ⏰",
];

const POKE_RESPONSES = [
  "呀！被你摸到头了喵~ (*^▽^*)",
  "收到主人的拍拍，战斗力 +100！",
  "本特助一直都在守护主人的求职！",
  "嘻嘻，痒痒的喵~ (≧∇≦)",
];

interface UsePetControllerOptions {
  running: boolean;
  onStartRun?: () => void;
}

export function usePetController({ running, onStartRun }: UsePetControllerOptions) {
  const [action, setAction] = useState<PetAction>("idle");
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [tilt, setTilt] = useState(0);
  const [speech, setSpeech] = useState("");
  const [speechVisible, setSpeechVisible] = useState(true);
  const [isSleeping, setIsSleeping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const notify = useRunStore((s) => s.notify);

  const dragStartRef = useRef<{ mouseX: number; mouseY: number } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const behaviorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cruiseScheduleCheckerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScheduledTriggerDateRef = useRef<string>("");

  // 1. 初始化气泡欢迎词
  useEffect(() => {
    setSpeech("主人好呀！我是您的求职贴心小特助喵~");
    const t = setTimeout(() => {
      setSpeech(GREETING_POOL[0]);
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  // 2. 巡航运行状态联动
  useEffect(() => {
    if (running) {
      setAction("run");
      setSpeech("正在全速为您巡航投递中喵！🚀");
      setIsSleeping(false);
    } else {
      if (action === "run") {
        // 巡航刚停止，切换庆祝动作
        setAction("celebrate");
        setSpeech("太棒啦！本次巡航圆满完成🎉");
        const t = setTimeout(() => {
          setAction("idle");
          setSpeech(GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)]);
        }, 4000);
        return () => clearTimeout(t);
      }
    }
  }, [running]);

  // 3. 闲置瞌睡状态机 (90秒无鼠标动静进入睡眠状态)
  const resetSleepTimer = useCallback(() => {
    if (isSleeping) {
      setIsSleeping(false);
      setAction("waving");
      setSpeech("主人你回来啦！精神抖擞~ ☀️");
      setTimeout(() => setAction("idle"), 2500);
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!running && !isDragging) {
        setIsSleeping(true);
        setAction("sleep");
        setSpeech("呼噜呼噜... Zzz 💤");
      }
    }, 90000); // 90 秒无交互进入睡眠
  }, [isSleeping, running, isDragging]);

  useEffect(() => {
    resetSleepTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetSleepTimer]);

  // 4. 自然随机日常动作轮巡 (发呆、偶尔招手、坐下)
  useEffect(() => {
    if (running || isSleeping || isDragging) return;

    const scheduleNextBehavior = () => {
      const delay = 15000 + Math.random() * 15000; // 15 - 30 秒
      behaviorTimerRef.current = setTimeout(() => {
        if (!running && !isSleeping && !isDragging) {
          const rand = Math.random();
          if (rand < 0.35) {
            // 招手
            setAction("waving");
            setTimeout(() => setAction("idle"), 2400);
          } else if (rand < 0.6) {
            // 坐下休息
            setAction("sit");
            setTimeout(() => setAction("idle"), 4000);
          } else {
            // 换个提示语
            const msg = GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)];
            setSpeech(msg);
          }
        }
        scheduleNextBehavior();
      }, delay);
    };

    scheduleNextBehavior();
    return () => {
      if (behaviorTimerRef.current) clearTimeout(behaviorTimerRef.current);
    };
  }, [running, isSleeping, isDragging]);

  // 5. 点击/戳一戳互动反馈
  const handlePetClick = useCallback(() => {
    resetSleepTimer();
    if (isDragging) return;

    setAction("celebrate");
    const reply = POKE_RESPONSES[Math.floor(Math.random() * POKE_RESPONSES.length)];
    setSpeech(reply);

    setTimeout(() => {
      setAction("idle");
    }, 2000);
  }, [isDragging, resetSleepTimer]);

  // 6. 侧边栏内部约束拖拽 (严守约束#7：严格限制在侧边栏内部，不溢出桌面)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setAction("drag");
    setSpeech("哇！被抓起来啦喵~ 🎈");
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    resetSleepTimer();

    if (isDragging && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      // 严格约束在侧边栏卡片范围内: X [-30, 30], Y [-45, 10]
      const clampedX = Math.max(-30, Math.min(30, dx));
      const clampedY = Math.max(-45, Math.min(10, dy));
      setDragOffset({ x: clampedX, y: clampedY });
    }
  }, [isDragging, resetSleepTimer]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    dragStartRef.current = null;

    // 落地反馈动画
    setAction("land");
    setDragOffset({ x: 0, y: 0 }); // 柔和弹性回弹到底座

    setTimeout(() => {
      setAction("idle");
      setSpeech("稳稳落地！好玩~ (*^▽^*)");
    }, 600);
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 7. 鼠标游弋视线跟随微动 (Look-at Tracking)
  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    resetSleepTimer();
    if (isDragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const diffX = e.clientX - centerX;

    if (diffX < -15) {
      setFacing("left");
    } else if (diffX > 15) {
      setFacing("right");
    }

    const calculatedTilt = Math.max(-6, Math.min(6, diffX * 0.08));
    setTilt(calculatedTilt);
  }, [isDragging, resetSleepTimer]);

  const handleContainerMouseLeave = useCallback(() => {
    setTilt(0);
  }, []);

  // 8. 双轨定时巡航后台轮询触发器 (按分钟校验并自动触发巡航)
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
          text: `⏰ 定时巡航已到达指定时间 (${schedule.time})，正在自动为您启动巡航！`,
          source: "定时巡航系统",
        });

        if (schedule.autoRun && onStartRun && !running) {
          onStartRun();
        }
      }
    };

    cruiseScheduleCheckerRef.current = setInterval(checkCruiseSchedule, 30000); // 每 30 秒核验一次
    return () => {
      if (cruiseScheduleCheckerRef.current) clearInterval(cruiseScheduleCheckerRef.current);
    };
  }, [notify, onStartRun, running]);

  return {
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
    resetSleepTimer,
  };
}

export default usePetController;
