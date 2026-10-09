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

  // 将 3D 环形柱面矩阵变换直接映射到 3 个卡片 DOM Ref（基于 React Bits 3D Cylinder / Text Reveal 空间架构）
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
    // 3D 空间柱面半径 R：充裕净空，杜绝上下板块挤压重叠与视觉碰撞
    const cylinderRadius = Math.max(580, vh * 0.74);

    const stages = [
      { el: heroStage, index: 0 },
      { el: hub, index: 1 },
      { el: profile, index: 2 },
    ];

    // 规则 (a): 用户处于“向 AI 顾问说出你的情况”（带搜索框）页面 (pos <= 0.05) 时，
    // 不能显示招聘平台中心，也不能显示求职画像，确保首屏搜索舱视觉纯净无遮挡。
    if (pos <= 0.05) {
      heroStage.style.transform = "none";
      heroStage.style.opacity = "1";
      heroStage.style.filter = "none";
      heroStage.style.pointerEvents = "auto";
      heroStage.style.zIndex = "30";

      [hub, profile].forEach((el, idx) => {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.style.zIndex = "10";
        el.style.filter = "none";
        const factor = idx === 0 ? 0.95 : 1.6;
        el.style.transform = `perspective(1200px) translateY(${(cylinderRadius * factor).toFixed(1)}px) translateZ(-280px) rotateX(42deg) scale(0.82)`;
      });
      return;
    }

    // 规则 (b) & 3D 圆柱万花筒动力学：处于其他页面时能够以优雅的圆柱景深看到上下关联板块
    stages.forEach(({ el, index }) => {
      const d = index - pos; // d = 0 时处于正中心黄金焦平面
      const absD = Math.abs(d);

      if (absD < 0.015) {
        // 当前卡片处于正中心焦平面展示
        el.style.transform = "perspective(1200px) translate3d(0, 0px, 0px) rotateX(0deg) scale(1)";
        el.style.opacity = "1";
        el.style.filter = "none";
        el.style.pointerEvents = "auto";
        el.style.zIndex = "30";
        return;
      }

      if (d > 0) {
        // 位于中心下方（圆柱下半弧，未来即将滚入的站台）
        // 如果是 profile (index 2)，且 pos < 0.28 时保持不可见，防止早期滚轮穿帮
        if (index === 2 && pos < 0.28) {
          el.style.opacity = "0";
          el.style.transform = `perspective(1200px) translateY(${(cylinderRadius * 1.5).toFixed(1)}px) translateZ(-350px) rotateX(46deg) scale(0.78)`;
          el.style.pointerEvents = "none";
          el.style.zIndex = "10";
          return;
        }

        const v = Math.min(1.8, d);
        // 3D 圆柱曲率计算：沿圆柱弧面展开
        const transY = cylinderRadius * (0.95 * Math.min(v, 1) + 0.65 * Math.max(0, v - 1));
        const rotX = 40 * Math.min(v, 1) + 12 * Math.max(0, v - 1);
        const transZ = -260 * Math.min(v, 1) - 120 * Math.max(0, v - 1);
        const scale = Math.max(0.76, 1 - 0.16 * Math.min(v, 1) - 0.08 * Math.max(0, v - 1));

        // 渐进透明度：在招聘平台中心 (pos=1) 时，下方求职画像 (index=2, d=1) 呈现 opacity=0.32
        let opacity = 0;
        if (v <= 1.0) {
          const fadeIntro = Math.min(1, Math.max(0, (pos - 0.05) / 0.35));
          opacity = (1 - 0.68 * v) * fadeIntro;
        } else {
          opacity = Math.max(0, 0.32 - 0.28 * (v - 1.0));
        }

        const blur = v > 0.3 ? Math.min(1.4, 0.7 * v) : 0;

        el.style.transform = `perspective(1200px) translate3d(0, ${transY.toFixed(1)}px, ${transZ.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = "15";
      } else {
        // 位于中心上方（圆柱上半弧，已翻折退入天穹深处的站台）
        const u = Math.min(1.8, -d);

        const transY = -cylinderRadius * (0.95 * Math.min(u, 1) + 0.65 * Math.max(0, u - 1));
        const rotX = -42 * Math.min(u, 1) - 14 * Math.max(0, u - 1);
        const transZ = -260 * Math.min(u, 1) - 120 * Math.max(0, u - 1);
        const scale = Math.max(0.74, 1 - 0.16 * Math.min(u, 1) - 0.10 * Math.max(0, u - 1));

        // 在招聘平台中心 (pos=1) 时，上方“向 AI 顾问说出你的情况”呈现 opacity=0.32
        // 在求职画像 (pos=2) 时，上方招聘平台呈现 opacity=0.32，最高处 Hero 呈现 opacity=0.15
        let opacity = 0;
        if (u <= 1.0) {
          opacity = 1 - 0.68 * u;
        } else {
          opacity = Math.max(0.12, 0.32 - 0.20 * (u - 1.0));
        }

        const blur = Math.min(1.6, 0.7 * u);

        el.style.transform = `perspective(1200px) translate3d(0, ${transY.toFixed(1)}px, ${transZ.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = u <= 1.0 ? "20" : "10";
      }
    });
  }, [isChattingOrHasHistory]);

  // 核心 rAF 物理指数平滑渲染主循环 (GSAP/OptionWheel 级平滑衰减)
  const runStageFrame = useCallback((now: number) => {
    const dt = Math.min((now - stageLastTimeRef.current) / 1000, 0.05);
    stageLastTimeRef.current = now;

    // tau = 0.16 (160ms 极速响应阻尼常数，兼具惯性与丝滑手感)
    const tau = 0.16;
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

  // 滚轮与触控板事件监听（细腻连续滚轮积聚 + 自动平滑吸附）
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
      
      // 触控板与传统鼠标智能适配：
      // 细微触控微动 -> 连续 scrub 旋转；明显滚轮刻度 -> 步进旋转
      const isSteppedWheel = Math.abs(rawDelta) >= 80;
      const scrubStep = isSteppedWheel
        ? (rawDelta > 0 ? 0.65 : -0.65)
        : Math.max(-0.6, Math.min(0.6, rawDelta * 0.0022));

      const nextTarget = Math.min(Math.max(stageTargetRef.current + scrubStep, 0), 2);
      applyStageTarget(nextTarget, false);

      if (stageWheelTimerRef.current) clearTimeout(stageWheelTimerRef.current);
      stageWheelTimerRef.current = setTimeout(() => {
        // 惯性平息后自动吸附到最近的站台
        const cur = stagePosRef.current;
        const snapped = Math.round(cur);
        applyStageTarget(snapped, true);
      }, 160);
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
