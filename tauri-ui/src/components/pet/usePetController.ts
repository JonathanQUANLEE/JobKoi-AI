import { useState, useEffect, useRef, useCallback } from "react";
import { type PetAction } from "./types";
import { loadScheduleConfig } from "./PetSchedulePopover";
import { useRunStore } from "../../store";
import { usagiSound } from "./soundManager";

const USAGI_LINES_ZH = [
  "ヤハ！今天也要元气满满投递，拿下好 Offer！🌟",
  "ウラ！乌萨奇特助在此，随时待命！💪",
  "プルルルル！点击我上面的牌子可以开启定时巡航哦~ ⏰",
  "记得喝杯水，活动一下脖子和眼睛哦~ 🍵",
  "フゥン！每一份投递都在向目标靠近！✨",
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
  "哈？（歪头晃耳朵）🐰",
];

const POKE_LINES_JA = [
  "ヤハッ！耳をなでなで、内定運UP！(*^▽^*)",
  "ウラララ！タップされて元気満タン！💥",
  "プルルルル！ぐるぐる腕回しチャージ中！🌀",
  "ハァ？（首をかしげる）🐰",
];

interface UsePetControllerOptions {
  running: boolean;
  onStartRun?: () => void;
  lang?: string;
}

export function usePetController({ running, onStartRun, lang = "zh" }: UsePetControllerOptions) {
  const [action, setAction] = useState<PetAction>("idle");
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [tilt, setTilt] = useState(0);
  const [speech, setSpeech] = useState("");
  const [speechVisible, setSpeechVisible] = useState(true);
  const [posX, setPosX] = useState(25); // 沿水平跑道的 X 坐标 (范围 5px - 120px)
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [signboardOpen, setSignboardOpen] = useState(false);

  const notify = useRunStore((s) => s.notify);

  const dragStartRef = useRef<{ mouseX: number; mouseY: number } | null>(null);
  const roamDirectionRef = useRef<"right" | "left">("right");
  const roamStateRef = useRef<"walking" | "idle" | "special">("walking");
  const pauseUntilRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const cruiseScheduleCheckerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScheduledTriggerDateRef = useRef<string>("");
  const doubleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isJa = lang === "ja";

  // 1. 初始化乌萨奇问候语
  useEffect(() => {
    setSpeech(isJa ? "ヤハ！求人巡航ウサギ特助だよ！" : "ヤハ！我是你的求职特助乌萨奇！");
    const t = setTimeout(() => {
      const pool = isJa ? USAGI_LINES_JA : USAGI_LINES_ZH;
      setSpeech(pool[0]);
    }, 4500);
    return () => clearTimeout(t);
  }, [isJa]);

  // 2. 自主漫步 (Autonomous Roaming) 物理与动画循环
  // 乌萨奇自由在侧边栏底部轨道行走，碰壁转身，中途停下动耳朵发呆或甩手
  useEffect(() => {
    if (isDragging || signboardOpen) return;

    let lastTimestamp = performance.now();

    const roamLoop = (currentTimestamp: number) => {
      const dt = Math.min(currentTimestamp - lastTimestamp, 100); // 限制单帧最大时间防跳帧
      lastTimestamp = currentTimestamp;

      if (!running) {
        // 普通自主漫步模式
        const now = Date.now();
        if (now < pauseUntilRef.current) {
          // 当前处于停顿休整状态 (动耳朵待机或特殊动作)
          animFrameRef.current = requestAnimationFrame(roamLoop);
          return;
        }

        if (roamStateRef.current !== "walking") {
          // 停顿结束，恢复走动
          roamStateRef.current = "walking";
          setAction(roamDirectionRef.current === "right" ? "walk_right" : "walk_left");
          setFacing(roamDirectionRef.current);
        }

        const speed = 0.045; // 像素/毫秒
        const moveDist = speed * dt;

        setPosX((prevX) => {
          let nextX = prevX;
          if (roamDirectionRef.current === "right") {
            nextX += moveDist;
            if (nextX >= 115) {
              // 到达右边界，停下待机并掉头
              nextX = 115;
              roamDirectionRef.current = "left";
              roamStateRef.current = "idle";
              setAction("idle");
              setFacing("left");
              // 随机停顿 2.5 ~ 4.5 秒，其中 25% 几率随机触发甩手或蹦跳
              const pauseDuration = 2500 + Math.random() * 2000;
              pauseUntilRef.current = Date.now() + pauseDuration;

              if (Math.random() < 0.25) {
                setTimeout(() => {
                  if (roamStateRef.current === "idle" && !isDragging) {
                    setAction("roll");
                    usagiSound.play("pululu");
                  }
                }, 1000);
              }
            } else {
              setAction("walk_right");
              setFacing("right");
            }
          } else {
            nextX -= moveDist;
            if (nextX <= 5) {
              // 到达左边界，停下待机并掉头
              nextX = 5;
              roamDirectionRef.current = "right";
              roamStateRef.current = "idle";
              setAction("idle");
              setFacing("right");
              const pauseDuration = 2500 + Math.random() * 2000;
              pauseUntilRef.current = Date.now() + pauseDuration;

              if (Math.random() < 0.25) {
                setTimeout(() => {
                  if (roamStateRef.current === "idle" && !isDragging) {
                    setAction("jump");
                    usagiSound.play("yaha");
                  }
                }, 1000);
              }
            } else {
              setAction("walk_left");
              setFacing("left");
            }
          }
          return nextX;
        });
      } else {
        // 巡航全速奔跑模式 (更加热血欢快)
        const cruiseSpeed = 0.09;
        const moveDist = cruiseSpeed * dt;

        setPosX((prevX) => {
          let nextX = prevX;
          if (roamDirectionRef.current === "right") {
            nextX += moveDist;
            if (nextX >= 115) {
              roamDirectionRef.current = "left";
              setAction("walk_left");
              setFacing("left");
            } else {
              setAction("walk_right");
              setFacing("right");
            }
          } else {
            nextX -= moveDist;
            if (nextX <= 5) {
              roamDirectionRef.current = "right";
              setAction("walk_right");
              setFacing("right");
            } else {
              setAction("walk_left");
              setFacing("left");
            }
          }
          return nextX;
        });
      }

      animFrameRef.current = requestAnimationFrame(roamLoop);
    };

    animFrameRef.current = requestAnimationFrame(roamLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isDragging, signboardOpen, running]);

  // 3. 巡航状态改变时的语音和动作反馈
  useEffect(() => {
    if (running) {
      setAction("running");
      setSpeech(isJa ? "ヤハ！全速力で求人巡航中！🚀" : "ヤハ！正在全速巡航投递中！🚀");
      usagiSound.play("yaha");
    } else {
      if (action === "running" || action === "walk_right" || action === "walk_left") {
        setAction("jump");
        setSpeech(isJa ? "ウラ！本次巡航完了！🎉" : "太棒啦！本次巡航圆满完成🎉");
        usagiSound.play("celebrate");
        const t = setTimeout(() => {
          setAction("idle");
        }, 3000);
        return () => clearTimeout(t);
      }
    }
  }, [running, isJa]);

  // 4. 单击乌萨奇：欢快蹦跳 + 播放“ヤハ！”语音 + 弹起定时小木牌
  const handlePetClick = useCallback(() => {
    if (isDragging) return;

    // 清理可能存在的双击计时
    if (doubleClickTimeoutRef.current) {
      clearTimeout(doubleClickTimeoutRef.current);
    }

    // 动作与音效
    setAction("jump");
    usagiSound.play("yaha");

    const pool = isJa ? POKE_LINES_JA : POKE_LINES_ZH;
    setSpeech(pool[Math.floor(Math.random() * pool.length)]);
    setSpeechVisible(true);

    // 弹出定时告示牌
    setSignboardOpen(true);

    setTimeout(() => {
      if (!isDragging) {
        setAction("idle");
      }
    }, 600);
  }, [isDragging, isJa]);

  // 5. 双击乌萨奇：乌萨奇标志性经典“高速大风车甩手旋转” (Usagi Roll) + “プルルルル！”
  const handlePetDoubleClick = useCallback(() => {
    if (isDragging) return;

    setAction("roll");
    usagiSound.play("pululu");
    setSpeech(isJa ? "プルルルルルル！🌀💥" : "プルルルルルル！🌀💥");
    setSpeechVisible(true);

    pauseUntilRef.current = Date.now() + 2500;

    setTimeout(() => {
      if (!isDragging) {
        setAction("idle");
      }
    }, 2400);
  }, [isDragging, isJa]);

  // 6. 拖拽逻辑 (约束在侧边栏内部)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setAction("jump");
    usagiSound.play("ura");
    setSpeech(isJa ? "ウラ！持ち上げられた！🎈" : "哇！被抓起来啦！🎈");
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY };
  }, [isJa]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      // 允许在侧边栏内部拖拽：X [-40, 40], Y [-60, 15]
      const clampedX = Math.max(-40, Math.min(40, dx));
      const clampedY = Math.max(-60, Math.min(15, dy));
      setDragOffset({ x: clampedX, y: clampedY });
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    dragStartRef.current = null;
    setDragOffset({ x: 0, y: 0 });

    setAction("jump");
    usagiSound.play("yaha");
    setSpeech(isJa ? "すとんと着地！🐾" : "稳稳落地！🐾");

    setTimeout(() => {
      setAction("idle");
    }, 500);
  }, [isDragging, isJa]);

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

  return {
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
  };
}

export default usePetController;
