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

  // 将 3D 环形柱面矩阵变换直接映射到 3 个卡片 DOM Ref（零 React Re-render 开销，GPU 硬件加速合成）
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
    // 基础环形步长位移：约 68% 视口高度，构建 3D 环形柱面透视空间
    const stepY = Math.max(520, vh * 0.68);

    const stages = [
      { el: heroStage, index: 0 },
      { el: hub, index: 1 },
      { el: profile, index: 2 },
    ];

    // 规则 (a): 用户处于“向 AI 顾问说出你的情况”（带搜索框）页面 (pos <= 0.08) 时，
    // 不能显示招聘平台中心，也不能显示求职画像，杜绝内容重叠与残留。
    if (pos <= 0.08) {
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
        const factor = idx === 0 ? 0.75 : 1.35;
        el.style.transform = `perspective(1400px) translateY(${(stepY * factor).toFixed(1)}px) rotateX(24deg) scale(0.85)`;
      });
      return;
    }

    // 规则 (b) & 3D 圆环万花筒效果：处于其他页面时能清晰看到关联板块（上一个与下一个带有透明度渐显）
    stages.forEach(({ el, index }) => {
      const d = index - pos; // d = 0 时处于正中心黄金视界
      const dist = Math.abs(d);

      if (dist < 0.02) {
        // 当前卡片处于正中心展示
        el.style.transform = "none";
        el.style.opacity = "1";
        el.style.filter = "none";
        el.style.pointerEvents = "auto";
        el.style.zIndex = "30";
        return;
      }

      if (d > 0) {
        // 位于中心下方（尚未滚入的未来站台，圆环下部弧面）
        // 如果是 profile (index 2)，且 pos < 0.35 时保持不可见
        if (index === 2 && pos < 0.35) {
          el.style.opacity = "0";
          el.style.transform = `perspective(1400px) translateY(${(stepY * 1.3).toFixed(1)}px) rotateX(24deg) scale(0.8)`;
          el.style.pointerEvents = "none";
          el.style.zIndex = "10";
          return;
        }

        // 计算下部圆环弧度与渐入动画
        const curveDist = Math.min(1.5, d);
        const transY = stepY * (0.68 * Math.min(curveDist, 1) + 0.45 * Math.max(0, curveDist - 1));
        const rotX = 20 * Math.min(curveDist, 1) + 8 * Math.max(0, curveDist - 1);
        const scale = Math.max(0.78, 1 - 0.14 * Math.min(curveDist, 1) - 0.08 * Math.max(0, curveDist - 1));
        
        // 在招聘平台中心 (pos=1) 时，能清晰看到下方的求职画像 (d=1, opacity=0.38)
        let opacity = 0;
        if (d <= 1.0) {
          opacity = 1 - 0.62 * d;
        } else {
          opacity = Math.max(0, 0.38 - 0.36 * (d - 1.0));
        }

        const blur = d > 0.4 ? Math.min(1.2, 0.6 * d) : 0;

        el.style.transform = `perspective(1400px) translateY(${transY.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = "15";
      } else {
        // 位于中心上方（已被滑过的过去站台，向上翻折折入天穹圆环弧面）
        const distAbove = -d;
        
        // 在招聘平台中心 (pos=1) 时，上方“向 AI 顾问说出你的情况” (index=0, d=-1) 呈现 opacity=0.40
        // 在求职画像 (pos=2) 时，上方“招聘平台中心”呈现 opacity=0.40，最高处 Hero 呈现 opacity=0.22
        const transY = -stepY * (0.68 * Math.min(distAbove, 1) + 0.45 * Math.max(0, distAbove - 1));
        const rotX = -20 * Math.min(distAbove, 1) - 10 * Math.max(0, distAbove - 1);
        const scale = Math.max(0.74, 1 - 0.14 * Math.min(distAbove, 1) - 0.10 * Math.max(0, distAbove - 1));
        
        let opacity = 0;
        if (distAbove <= 1.0) {
          opacity = 1 - 0.60 * distAbove;
        } else {
          opacity = Math.max(0.18, 0.40 - 0.18 * (distAbove - 1.0));
        }

        const blur = Math.min(1.5, 0.6 * distAbove);

        el.style.transform = `perspective(1400px) translateY(${transY.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = distAbove <= 1.0 ? "20" : "10";
      }
    });
  }, [isChattingOrHasHistory]);

  // OptionWheel 核心 rAF 物理指数平滑渲染主循环
  const runStageFrame = useCallback((now: number) => {
    const dt = Math.min((now - stageLastTimeRef.current) / 1000, 0.05);
    stageLastTimeRef.current = now;

    // tau = 0.20 (200ms 时间阻尼常数，兼具响应度与丝滑度)
    const tau = 0.20;
    const k = 1 - Math.exp(-dt / tau);

    const target = stageTargetRef.current;
    const cur = stagePosRef.current;
    let next = cur + (target - cur) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    stagePosRef.current = next;

    renderStageTransforms(next);

    // 仅在整数索引改变时通知 React 更新右侧指示点
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

  // 滚轮与触控板事件监听（学习 OptionWheel 处理方式：非被动捕获、步长限制与自动吸附）
  useEffect(() => {
    const scrollEl = mainScrollRef.current;
    if (!scrollEl || isChattingOrHasHistory) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        if (target.scrollHeight > target.clientHeight) return;
      }

      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      
      // 学习 OptionWheel：将每个滚轮 step 映射为平滑的位移增量（步长限制防止跳帧）
      const step = Math.max(-1, Math.min(1, delta / 120));
      const nextTarget = Math.min(Math.max(stageTargetRef.current + step, 0), 2);
      applyStageTarget(nextTarget, false);

      if (stageWheelTimerRef.current) clearTimeout(stageWheelTimerRef.current);
      stageWheelTimerRef.current = setTimeout(() => {
        applyStageTarget(stageTargetRef.current, true);
      }, 150);
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
