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

    if (isReduced || isMobile) {
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
    // 紧凑 3D 折叠圆柱弧面：
    // stepY 控制相邻卡片在视口中的紧凑露头距离（约 300px ~ 330px），保证在招聘平台中心时，
    // 上方 AI 搜索页面与下方求职画像页面的实体卡片影像紧凑清晰可见，绝不推到屏幕外
    const stepY = Math.min(360, Math.max(280, vh * 0.40));

    const stages = [
      { el: heroStage, index: 0 },
      { el: hub, index: 1 },
      { el: profile, index: 2 },
    ];

    // 规则 (a): 首屏处于 AI 顾问对话舱 (pos <= 0.06) 时，
    // 招聘平台中心与求职画像完全隐藏，保持首屏搜索对话舱纯净无扰。
    if (pos <= 0.06) {
      heroStage.style.transform = "translate3d(0, 0px, 0px) rotateX(0deg) scale(1)";
      heroStage.style.opacity = "1";
      heroStage.style.filter = "none";
      heroStage.style.pointerEvents = "auto";
      heroStage.style.zIndex = "30";

      [hub, profile].forEach((el, idx) => {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.style.zIndex = "10";
        el.style.filter = "none";
        const factor = idx === 0 ? 1.0 : 1.7;
        el.style.transform = `translate3d(0, ${(stepY * factor).toFixed(1)}px, -140px) rotateX(-20deg) scale(0.88)`;
      });
      return;
    }

    // 规则 (b) & 紧凑 3D 折叠影像系统：处于当前站台时，紧凑呈现关联板块的高质感实体影像（透明度适中，轮廓与内容清晰）
    stages.forEach(({ el, index }) => {
      const d = index - pos; // d = 0 时处于正中心黄金视界
      const absD = Math.abs(d);

      if (absD < 0.012) {
        // 当前卡片处于正中心焦平面展示
        el.style.transform = "translate3d(0, 0px, 0px) rotateX(0deg) scale(1)";
        el.style.opacity = "1";
        el.style.filter = "none";
        el.style.pointerEvents = "auto";
        el.style.zIndex = "30";
        return;
      }

      if (d > 0) {
        // 位于中心下方（尚未滚入的未来站台，圆柱下部紧凑折叠）
        const u = Math.min(1.8, d);
        const transY = stepY * (u <= 1 ? u : 1 + (u - 1) * 0.75);
        const transZ = -130 * Math.min(1, u) - 80 * Math.max(0, u - 1);
        const rotX = -20 * Math.min(1, u) - 10 * Math.max(0, u - 1);
        const scale = 1 - 0.11 * Math.min(1, u) - 0.07 * Math.max(0, u - 1);

        // 透明度设计：不采用极淡虚化，而是保留清晰的半透明实体影像（d=1 时 opacity ≈ 0.58）
        let opacity = 0;
        if (d <= 1.0) {
          opacity = 1 - 0.42 * d;
        } else {
          opacity = Math.max(0, 0.58 - 0.45 * (d - 1.0));
        }

        // 首屏滚入时的平滑淡入系数
        if (index > 0 && pos < 0.32) {
          const enterFade = Math.min(1, Math.max(0, (pos - 0.06) / 0.24));
          opacity *= enterFade;
        }

        el.style.transform = `translate3d(0, ${transY.toFixed(1)}px, ${transZ.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = "none"; // 保持清晰锐利，无模糊遮挡
        el.style.pointerEvents = "none";
        el.style.zIndex = u <= 1.0 ? "20" : "10";
      } else {
        // 位于中心上方（已被滑过的站台，向上圆柱弧面紧凑折叠）
        const v = Math.min(1.8, -d);
        const transY = -stepY * (v <= 1 ? v : 1 + (v - 1) * 0.75);
        const transZ = -130 * Math.min(1, v) - 80 * Math.max(0, v - 1);
        const rotX = 20 * Math.min(1, v) + 10 * Math.max(0, v - 1);
        const scale = 1 - 0.11 * Math.min(1, v) - 0.07 * Math.max(0, v - 1);

        // 在招聘平台中心 (pos=1) 时，上方 AI 搜索主页面 (d=-1) 呈现清晰的 opacity ≈ 0.58 紧凑影像
        // 在求职画像 (pos=2) 时，上方招聘平台中心呈现 opacity ≈ 0.58 紧凑影像，更高处 Hero 呈现 0.20 叠层
        let opacity = 0;
        if (v <= 1.0) {
          opacity = 1 - 0.42 * v;
        } else {
          opacity = Math.max(0.15, 0.58 - 0.38 * (v - 1.0));
        }

        el.style.transform = `translate3d(0, ${transY.toFixed(1)}px, ${transZ.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = "none"; // 保持清晰锐利，无模糊遮挡
        el.style.pointerEvents = "none";
        el.style.zIndex = v <= 1.0 ? "20" : "10";
      }
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
    if (!scrollEl) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        if (target.scrollHeight > target.clientHeight) return;
      }

      // 允许对话实录内部滚动：若在可滚动子容器内且未触及边界，优先内部滚动
      const scrollableParent = target?.closest(".overflow-y-auto") as HTMLElement | null;
      if (scrollableParent && scrollableParent.scrollHeight > scrollableParent.clientHeight) {
        const isUp = e.deltaY < 0;
        const isDown = e.deltaY > 0;
        const atTop = scrollableParent.scrollTop <= 2;
        const atBottom = scrollableParent.scrollTop + scrollableParent.clientHeight >= scrollableParent.scrollHeight - 3;
        if ((isUp && !atTop) || (isDown && !atBottom)) {
          return;
        }
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
  }, [applyStageTarget, renderStageTransforms]);

  // 监听导航切换：保持当前目标站台，渲染对应姿态，不再生硬重置为 0
  useEffect(() => {
    if (activeNav === "workbench") {
      renderStageTransforms(stagePosRef.current);
    }
  }, [activeNav, renderStageTransforms]);

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
