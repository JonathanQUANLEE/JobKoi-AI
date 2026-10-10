import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import gsap from "gsap";
import "./CardSwap.css";

export const Card = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { customClass?: string }
>(({ customClass, className, ...rest }, ref) => (
  <div
    ref={ref}
    {...rest}
    className={`card-swap-item ${customClass ?? ""} ${className ?? ""}`.trim()}
  />
));
Card.displayName = "Card";

export interface CardSwapHandle {
  swap: () => void;
  swapPrev: () => void;
  bringToFront: (index: number) => void;
}

export interface CardSwapProps {
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  autoPlay?: boolean;
  pauseOnHover?: boolean;
  onCardClick?: (index: number) => void;
  onFrontChange?: (index: number) => void;
  isReadingMode?: boolean;
  skewAmount?: number;
  easing?: "elastic" | "smooth";
  children: ReactNode;
}

const makeSlot = (i: number, distX: number, distY: number, total: number) => ({
  x: i * distX,
  y: -i * distY,
  z: -i * distX * 1.5,
  zIndex: total - i,
});

const placeNow = (
  el: HTMLElement | null,
  slot: ReturnType<typeof makeSlot>,
  skew: number
) => {
  if (!el) return;
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: "center center",
    zIndex: slot.zIndex,
    force3D: true,
  });
};

export const CardSwap = forwardRef<CardSwapHandle, CardSwapProps>(
  (
    {
      width = "100%",
      height = 620,
      cardDistance = 38,
      verticalDistance = 30,
      delay = 6000,
      autoPlay = false,
      pauseOnHover = true,
      onCardClick,
      onFrontChange,
      isReadingMode = false,
      skewAmount = 2.5,
      easing = "elastic",
      children,
    },
    ref
  ) => {
    const config = useMemo(
      () =>
        easing === "elastic"
          ? {
              ease: "power2.out",
              durDrop: 0.45,
              durMove: 0.42,
              durReturn: 0.48,
              promoteOverlap: 0.65,
              returnDelay: 0.04,
            }
          : {
              ease: "power2.inOut",
              durDrop: 0.4,
              durMove: 0.4,
              durReturn: 0.42,
              promoteOverlap: 0.5,
              returnDelay: 0.05,
            },
      [easing]
    );

    const childArr = useMemo(() => Children.toArray(children), [children]);
    const refs = useMemo(
      () => childArr.map(() => React.createRef<HTMLDivElement>()),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [childArr.length]
    );

    const order = useRef<number[]>([]);
    useEffect(() => {
      order.current = Array.from({ length: childArr.length }, (_, i) => i);
    }, [childArr.length]);

    const tlRef = useRef<gsap.core.Timeline | null>(null);
    const intervalRef = useRef<number | undefined>();
    const container = useRef<HTMLDivElement>(null);

    const isSwappingRef = useRef(false);
    const unlockTimerRef = useRef<number | null>(null);

    const releaseSwapLock = useCallback(() => {
      isSwappingRef.current = false;
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    }, []);

    const acquireSwapLock = useCallback((timeoutMs = 600) => {
      if (isSwappingRef.current) return false;
      isSwappingRef.current = true;
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
      }
      unlockTimerRef.current = window.setTimeout(() => {
        isSwappingRef.current = false;
        unlockTimerRef.current = null;
      }, timeoutMs);
      return true;
    }, []);

    useEffect(() => {
      return () => {
        releaseSwapLock();
        if (tlRef.current) {
          tlRef.current.kill();
          tlRef.current = null;
        }
      };
    }, [releaseSwapLock]);

    const swap = useCallback(() => {
      if (order.current.length < 2 || !acquireSwapLock(650)) return;

      const [front, ...rest] = order.current;
      const elFront = refs[front]?.current;
      if (!elFront) {
        releaseSwapLock();
        return;
      }

      if (tlRef.current) {
        tlRef.current.kill();
        tlRef.current = null;
      }

      const tl = gsap.timeline({
        onComplete: () => {
          releaseSwapLock();
        },
      });
      tlRef.current = tl;

      // 像从书架/抽屉抽出一样向下展开滑出
      tl.to(elFront, {
        y: "+=460",
        duration: config.durDrop,
        ease: config.ease,
      });

      tl.addLabel("promote", `-=${config.durDrop * config.promoteOverlap}`);
      rest.forEach((idx, i) => {
        const el = refs[idx]?.current;
        if (!el) return;
        const slot = makeSlot(i, cardDistance, verticalDistance, refs.length);
        tl.set(el, { zIndex: slot.zIndex }, "promote");
        tl.to(
          el,
          {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            duration: config.durMove,
            ease: config.ease,
          },
          `promote+=${i * 0.05}`
        );
      });

      const backSlot = makeSlot(
        refs.length - 1,
        cardDistance,
        verticalDistance,
        refs.length
      );
      tl.addLabel("return", `promote+=${config.durMove * config.returnDelay}`);
      tl.call(
        () => {
          gsap.set(elFront, { zIndex: backSlot.zIndex });
        },
        undefined,
        "return"
      );
      tl.to(
        elFront,
        {
          x: backSlot.x,
          y: backSlot.y,
          z: backSlot.z,
          duration: config.durReturn,
          ease: config.ease,
        },
        "return"
      );

      tl.call(() => {
        order.current = [...rest, front];
        onFrontChange?.(rest[0]);
      });
    }, [config, refs, cardDistance, verticalDistance, onFrontChange, acquireSwapLock, releaseSwapLock]);

    const swapPrev = useCallback(() => {
      if (order.current.length < 2 || !acquireSwapLock(650)) return;

      const lastIdx = order.current[order.current.length - 1];
      const rest = order.current.slice(0, -1);
      const elBack = refs[lastIdx]?.current;
      if (!elBack) {
        releaseSwapLock();
        return;
      }

      if (tlRef.current) {
        tlRef.current.kill();
        tlRef.current = null;
      }

      const tl = gsap.timeline({
        onComplete: () => {
          releaseSwapLock();
        },
      });
      tlRef.current = tl;

      const frontSlot = makeSlot(0, cardDistance, verticalDistance, refs.length);
      tl.set(elBack, { zIndex: frontSlot.zIndex + 2 });
      tl.to(elBack, {
        x: frontSlot.x,
        y: frontSlot.y + 360,
        z: frontSlot.z + 60,
        duration: config.durDrop * 0.6,
        ease: "power2.out",
      });
      tl.to(elBack, {
        y: frontSlot.y,
        z: frontSlot.z,
        duration: config.durReturn * 0.7,
        ease: config.ease,
      });

      rest.forEach((idx, i) => {
        const el = refs[idx]?.current;
        if (!el) return;
        const slot = makeSlot(i + 1, cardDistance, verticalDistance, refs.length);
        tl.to(
          el,
          {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            zIndex: slot.zIndex,
            duration: config.durMove * 0.6,
            ease: config.ease,
          },
          0
        );
      });

      tl.call(() => {
        order.current = [lastIdx, ...rest];
        onFrontChange?.(lastIdx);
      });
    }, [config, refs, cardDistance, verticalDistance, onFrontChange, acquireSwapLock, releaseSwapLock]);

    const bringToFront = (targetIndex: number) => {
      if (order.current[0] === targetIndex) return;
      const idxInOrder = order.current.indexOf(targetIndex);
      if (idxInOrder === -1) return;

      if (tlRef.current) {
        tlRef.current.kill();
        tlRef.current = null;
      }
      releaseSwapLock();

      const without = order.current.filter((i) => i !== targetIndex);
      const newOrder = [targetIndex, ...without];
      order.current = newOrder;

      newOrder.forEach((childIdx, slotIdx) => {
        const el = refs[childIdx]?.current;
        if (!el) return;
        const slot = makeSlot(slotIdx, cardDistance, verticalDistance, refs.length);
        gsap.to(el, {
          x: slot.x,
          y: slot.y,
          z: slot.z,
          zIndex: slot.zIndex,
          duration: 0.45,
          ease: "power2.out",
        });
      });

      onFrontChange?.(targetIndex);
    };

    useImperativeHandle(ref, () => ({
      swap,
      swapPrev,
      bringToFront,
    }));

    // 鼠标滚轮监听：滚轮上下滚动时切换卡片（阅读模式与轮换模式严格隔离）
    useEffect(() => {
      const node = container.current;
      if (!node) return;

      let lastWheelTime = 0;

      const handleWheel = (e: WheelEvent) => {
        const target = e.target as HTMLElement | null;

        // 1. 如果光标位于正文阅读区域，或者已经处于专注阅读模式：
        // 绝不拦截，滚轮 100% 留给正文阅读与长文档平滑滚动！
        if (
          isReadingMode ||
          target?.closest(".reading-content-zone, .allow-inner-scroll, [data-allow-scroll], textarea, input, pre")
        ) {
          return;
        }

        // 2. 如果在卡片外部轮廓、顶栏、底栏或背景上滚动：滚轮用于 3D 抽换卡片
        if (Math.abs(e.deltaY) < 12) return;

        const now = performance.now();
        if (now - lastWheelTime < 280) return;
        lastWheelTime = now;

        e.preventDefault();
        e.stopPropagation();

        if (e.deltaY > 0) {
          swap();
        } else if (e.deltaY < 0) {
          swapPrev();
        }
      };

      node.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        node.removeEventListener("wheel", handleWheel);
      };
    }, [swap, swapPrev, isReadingMode]);

    useEffect(() => {
      const total = refs.length;
      refs.forEach((r, i) =>
        placeNow(
          r.current,
          makeSlot(i, cardDistance, verticalDistance, total),
          skewAmount
        )
      );

      if (autoPlay) {
        intervalRef.current = window.setInterval(swap, delay);
      }

      const node = container.current;
      if (pauseOnHover && node && autoPlay) {
        const pause = () => {
          tlRef.current?.pause();
          clearInterval(intervalRef.current);
        };
        const resume = () => {
          tlRef.current?.play();
          intervalRef.current = window.setInterval(swap, delay);
        };
        node.addEventListener("mouseenter", pause);
        node.addEventListener("mouseleave", resume);
        return () => {
          node.removeEventListener("mouseenter", pause);
          node.removeEventListener("mouseleave", resume);
          clearInterval(intervalRef.current);
        };
      }

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      cardDistance,
      verticalDistance,
      delay,
      autoPlay,
      pauseOnHover,
      skewAmount,
      easing,
      refs.length,
    ]);

    const rendered = childArr.map((child, i) =>
      isValidElement(child)
        ? cloneElement(child as React.ReactElement<any>, {
            key: i,
            ref: refs[i],
            style: {
              width: typeof width === "number" ? `${width}px` : width,
              height: typeof height === "number" ? `${height}px` : height,
              ...((child.props as { style?: React.CSSProperties }).style ?? {}),
            },
            onClick: (e: React.MouseEvent) => {
              (child.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e);
              const target = e.target as HTMLElement | null;

              // 如果用户点击的是正文阅读区、操作按钮、输入框或链接，严禁触发外层切卡
              if (target?.closest(".reading-content-zone, .allow-inner-scroll, button, a, input, textarea")) {
                onCardClick?.(i);
                return;
              }

              // 如果当前处于阅读模式，点击卡片其他位置旨在退出阅读模式，严禁误触切卡
              if (isReadingMode) {
                onCardClick?.(i);
                return;
              }

              if (order.current[0] === i) {
                // 点击顶层卡片外部轮廓 -> 抽换到下一张
                swap();
              } else {
                // 点击后方卡片 -> 直接抽到最前
                bringToFront(i);
              }
              onCardClick?.(i);
            },
          })
        : child
    );

    return (
      <div
        ref={container}
        className="card-swap-container"
        style={{
          width: typeof width === "number" ? `${width}px` : width,
          height: typeof height === "number" ? `${height}px` : height,
        }}
      >
        {rendered}
      </div>
    );
  }
);
CardSwap.displayName = "CardSwap";

export default CardSwap;
