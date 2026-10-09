import { useRef, useState, useEffect, useCallback, type RefObject, type PointerEvent } from "react";

interface UseWorkbenchWheelOptions {
  isChattingOrHasHistory: boolean;
  activeNav: string;
}

export interface UseWorkbenchWheelReturn {
  mainScrollRef: RefObject<HTMLElement>;
  heroStageRef: RefObject<HTMLDivElement>;
  heroInnerRef: RefObject<HTMLDivElement>;
  hubRef: RefObject<HTMLDivElement>;
  profileRef: RefObject<HTMLDivElement>;
  ringActiveIndex: 0 | 1 | 2;
  scrollToRingStage: (index: 0 | 1 | 2, immediate?: boolean) => void;
  handleStagePointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  handleStagePointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  handleStagePointerEnd: (e?: PointerEvent<HTMLDivElement>) => void;
}

/**
 * 3D 万花筒环形滚轮空间系统 (OptionWheel 动力学驱动)
 * 学习 OptionWheel (React Bits) 的物理动力学平滑引擎 (Cylindrical 3D Wheel Physics)
 */
export function useWorkbenchWheel({
  isChattingOrHasHistory,
  activeNav,
}: UseWorkbenchWheelOptions): UseWorkbenchWheelReturn {
  const mainScrollRef = useRef<HTMLElement>(null);
  const heroStageRef = useRef<HTMLDivElement>(null);
  const heroInnerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const stagePosRef = useRef<number>(0);
  const stageTargetRef = useRef<number>(0);
  const stageRafRef = useRef<number | null>(null);
  const stageLastTimeRef = useRef<number>(0);
  const stageWheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageDragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const stageDragMovedRef = useRef<boolean>(false);
  const ringActiveIndexRef = useRef<0 | 1 | 2>(0);

  const [ringActiveIndex, setRingActiveIndex] = useState<0 | 1 | 2>(0);

  // 将 3D 圆柱侧面曲率变换直接映射到 3 个模块卡片（如同纸张包覆在圆柱体侧面，沿圆柱转动）
  const renderStageTransforms = useCallback((pos: number) => {
    const heroStage = heroStageRef.current;
    const hub = hubRef.current;
    const profile = profileRef.current;

    const isReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    if (isChattingOrHasHistory || isReduced || isMobile) {
      [heroStage, hub, profile].forEach((el) => {
        if (el) {
          el.style.transform = "none";
          el.style.opacity = "1";
          el.style.filter = "none";
          el.style.pointerEvents = "auto";
          el.style.zIndex = "auto";
        }
      });
      const heroInner = heroInnerRef.current;
      if (heroInner) {
        heroInner.style.transform = "none";
        heroInner.style.opacity = "1";
        heroInner.style.filter = "none";
      }
      return;
    }

    if (!heroStage || !hub || !profile) return;

    const vh = (typeof window !== "undefined" && window.innerHeight) || 800;
    // 3D 空间圆柱半径 R（如同巨大的水平圆柱鼓面）
    const cylinderRadius = Math.max(780, vh * 0.95);
    // 卡片在圆柱侧面上的夹角（度）：每卡片跨越 44 度弧长，紧密贴合在圆柱侧面
    const cardAngleDelta = 44;

    const stages = [
      { el: heroStage, index: 0 },
      { el: hub, index: 1 },
      { el: profile, index: 2 },
    ];

    stages.forEach(({ el, index }) => {
      // 当前卡片在圆柱面上的角位移（度）
      // 当 pos = index 时，theta = 0（正对屏幕正前方，正面朝向用户）
      const theta = (index - pos) * cardAngleDelta;
      const rad = (theta * Math.PI) / 180;
      const absTheta = Math.abs(theta);

      // 圆柱侧面几何坐标方程：
      // Y 轴沿圆柱切面展开：R * sin(theta)
      // Z 轴深度向圆柱轴心后退：-R * (1 - cos(theta))
      // X 轴旋转角度：与切面法线一致，角度即为 theta
      const y = cylinderRadius * Math.sin(rad);
      const z = -cylinderRadius * (1 - Math.cos(rad));
      const rotX = -theta; // 围绕圆柱横轴切线旋转：严格贴合圆柱侧表面曲率与法线方向

      // 规则 (a): 首屏处于 AI 顾问对话舱 (pos <= 0.04) 时，
      // 招聘平台中心与求职画像完全隐藏，保持首屏搜索对话舱纯净无扰。
      if (index > 0 && pos <= 0.04) {
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rotX.toFixed(2)}deg)`;
        el.style.opacity = "0";
        el.style.filter = "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = "10";
        return;
      }

      // 黄金正面视界判断（处于正前方焦平面）
      const isFront = absTheta < 2.0;

      // 随圆柱旋转的角度透明度衰减与景深微模糊
      let opacity = 0;
      let blur = 0;

      if (absTheta <= cardAngleDelta * 1.6) {
        // 沿圆柱侧面渐显渐隐
        opacity = Math.max(0, 1 - (absTheta / (cardAngleDelta * 1.2)) * 0.65);
        if (index > 0 && pos < 0.35) {
          // 从首屏滚入时的平滑淡入系数
          const enterFade = Math.min(1, Math.max(0, (pos - 0.04) / 0.28));
          opacity *= enterFade;
        }
        blur = Math.min(1.5, (absTheta / cardAngleDelta) * 1.0);
      }

      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rotX.toFixed(2)}deg)`;
      el.style.opacity = isFront ? "1" : opacity.toFixed(3);
      el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
      el.style.pointerEvents = isFront ? "auto" : "none";
      el.style.zIndex = isFront ? "30" : Math.round(20 - absTheta).toString();
    });
  }, [isChattingOrHasHistory]);

  // 核心 rAF 物理指数平滑渲染主循环 (连续惯性平滑衰减)
  const runStageFrame = useCallback((now: number) => {
    const dt = Math.min((now - stageLastTimeRef.current) / 1000, 0.05);
    stageLastTimeRef.current = now;

    // tau = 0.18 (180ms 弹性平滑阻尼常数，兼具惯性与丝滑手感)
    const tau = 0.18;
    const k = 1 - Math.exp(-dt / tau);

    const target = stageTargetRef.current;
    const cur = stagePosRef.current;
    let next = cur + (target - cur) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    stagePosRef.current = next;

    renderStageTransforms(next);

    // 仅在整数索引改变时通知 React 更新状态
    const roundedIdx = Math.min(2, Math.max(0, Math.round(next))) as 0 | 1 | 2;
    if (roundedIdx !== ringActiveIndexRef.current) {
      ringActiveIndexRef.current = roundedIdx;
      setRingActiveIndex(roundedIdx);
    }

    if (!settled) {
      stageRafRef.current = requestAnimationFrame(runStageFrame);
    } else {
      stageRafRef.current = null;
    }
  }, [renderStageTransforms]);

  const startStageLoop = useCallback(() => {
    if (stageRafRef.current != null) {
      cancelAnimationFrame(stageRafRef.current);
    }
    stageLastTimeRef.current = performance.now();
    stageRafRef.current = requestAnimationFrame(runStageFrame);
  }, [runStageFrame]);

  const applyStageTarget = useCallback((value: number, snap: boolean) => {
    let v = Math.min(Math.max(value, 0), 2);
    if (snap) v = Math.round(v);
    stageTargetRef.current = v;
    startStageLoop();
  }, [startStageLoop]);

  const scrollToRingStage = useCallback((index: 0 | 1 | 2, immediate: boolean = false) => {
    if (immediate) {
      stagePosRef.current = index;
      stageTargetRef.current = index;
      ringActiveIndexRef.current = index;
      setRingActiveIndex(index);
      renderStageTransforms(index);
    } else {
      applyStageTarget(index, true);
    }
  }, [applyStageTarget, renderStageTransforms]);

  // 滚轮与触控板事件监听（细腻连续圆柱旋转 + 闲置平滑自动吸附）
  useEffect(() => {
    const scrollEl = mainScrollRef.current;
    if (!scrollEl || isChattingOrHasHistory) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        if (target.scrollHeight > target.clientHeight) return;
      }

      e.preventDefault();
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      
      // 连续平滑滚轮：将 delta 映射为流畅的圆柱旋转步长
      const isSteppedWheel = Math.abs(rawDelta) >= 80;
      const step = isSteppedWheel
        ? (rawDelta > 0 ? 0.38 : -0.38)
        : Math.max(-0.5, Math.min(0.5, rawDelta * 0.0024));

      const nextTarget = Math.min(Math.max(stageTargetRef.current + step, 0), 2);
      applyStageTarget(nextTarget, false);

      if (stageWheelTimerRef.current) clearTimeout(stageWheelTimerRef.current);
      stageWheelTimerRef.current = setTimeout(() => {
        // 惯性平息后自动吸附到最近的站台
        const cur = stagePosRef.current;
        const snapped = Math.round(cur);
        applyStageTarget(snapped, true);
      }, 280);
    };

    const handleResize = () => {
      renderStageTransforms(stagePosRef.current);
    };

    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", handleResize, { passive: true });
    
    // 初始化首屏渲染
    renderStageTransforms(stagePosRef.current);

    return () => {
      scrollEl.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", handleResize);
      if (stageWheelTimerRef.current) clearTimeout(stageWheelTimerRef.current);
      if (stageRafRef.current != null) cancelAnimationFrame(stageRafRef.current);
    };
  }, [isChattingOrHasHistory, applyStageTarget, renderStageTransforms]);

  // 监听导航切换：保持当前目标站台，渲染对应姿态，不再生硬重置为 0
  useEffect(() => {
    if (activeNav === "workbench" && !isChattingOrHasHistory) {
      renderStageTransforms(stagePosRef.current);
    }
  }, [activeNav, isChattingOrHasHistory, renderStageTransforms]);

  // Pointer 拖拽处理（支持鼠标光标按住上下拖动 3D 轮盘卡片）
  const handleStagePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, a, [role='button'], .cursor-pointer")) return;
    stageDragRef.current = { y: e.clientY, start: stageTargetRef.current, id: e.pointerId };
    stageDragMovedRef.current = false;
  }, []);

  const handleStagePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = stageDragRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!stageDragMovedRef.current && Math.abs(dy) > 5) {
      stageDragMovedRef.current = true;
      e.currentTarget.setPointerCapture(drag.id);
    }
    if (stageDragMovedRef.current) {
      const vh = (typeof window !== "undefined" && window.innerHeight) || 800;
      const step = -dy / (vh * 0.4);
      applyStageTarget(Math.min(Math.max(drag.start + step, 0), 2), false);
    }
  }, [applyStageTarget]);

  const handleStagePointerEnd = useCallback(() => {
    if (!stageDragRef.current) return;
    stageDragRef.current = null;
    if (stageDragMovedRef.current) {
      applyStageTarget(stageTargetRef.current, true);
    }
  }, [applyStageTarget]);

  return {
    mainScrollRef,
    heroStageRef,
    heroInnerRef,
    hubRef,
    profileRef,
    ringActiveIndex,
    scrollToRingStage,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerEnd,
  };
}
