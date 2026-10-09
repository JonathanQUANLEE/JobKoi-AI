import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
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
      skewAmount = 2.5,
      easing = "elastic",
      children,
    },
    ref
  ) => {
    const config =
      easing === "elastic"
        ? {
            ease: "elastic.out(0.65, 0.9)",
            durDrop: 1.4,
            durMove: 1.3,
            durReturn: 1.4,
            promoteOverlap: 0.85,
            returnDelay: 0.08,
          }
        : {
            ease: "power2.inOut",
            durDrop: 0.7,
            durMove: 0.7,
            durReturn: 0.7,
            promoteOverlap: 0.45,
            returnDelay: 0.15,
          };

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

    const swap = () => {
      if (order.current.length < 2) return;

      const [front, ...rest] = order.current;
      const elFront = refs[front]?.current;
      if (!elFront) return;

      const tl = gsap.timeline();
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
          `promote+=${i * 0.1}`
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
    };

    const bringToFront = (targetIndex: number) => {
      if (order.current[0] === targetIndex) return;
      const idxInOrder = order.current.indexOf(targetIndex);
      if (idxInOrder === -1) return;

      if (tlRef.current && tlRef.current.isActive()) {
        tlRef.current.kill();
      }

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
          duration: 0.65,
          ease: "power2.out",
        });
      });

      onFrontChange?.(targetIndex);
    };

    useImperativeHandle(ref, () => ({
      swap,
      bringToFront,
    }));

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
              if (order.current[0] === i) {
                // 点击顶层卡片 -> 抽屉滑出切换到下一张
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
