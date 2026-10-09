import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type FC,
  type CSSProperties,
} from "react";
import { gsap } from "gsap";
import "./ThreeDTextReveal.css";

export interface ThreeDTextRevealProps {
  /** 轮播展示的文本项列表 */
  items?: string[];
  /** 兼容别名 text */
  text?: string[];
  /** 滚动完成全动画所需距离 */
  scrollDistance?: string;
  /** 3D 透视深度 (px) */
  perspective?: number;
  /** 起始旋转角度 (deg) */
  startRotation?: number;
  /** 结束旋转角度 (deg) */
  endRotation?: number;
  /** GSAP 平滑度 (0-2) */
  scrubSmoothing?: number;
  /** 圆柱半径倍率 (0.1-1.0) */
  radiusOffset?: number;
  /** 字体大小 */
  fontSize?: string;
  /** 字重 */
  fontWeight?: number | string;
  /** 项之间的圆柱夹角 (deg) */
  gap?: number;
  /** 容器额外类名 */
  className?: string;
  /** 文本元素额外类名 */
  textClassName?: string;
  /** 是否自动周期轮转 (若外部未锁定) */
  autoCycle?: boolean;
  /** 自动轮转间隔毫秒 */
  cycleInterval?: number;
  /** 受控的当前活跃索引 */
  activeIndex?: number;
  /** 当前项改变回调 */
  onIndexChange?: (index: number) => void;
  /** 点击项回调 */
  onItemClick?: (index: number) => void;
  /** 是否显示微型滚动指引 */
  showScrollIndicator?: boolean;
}

const DEFAULT_ITEMS = [
  "向 AI 顾问说出你的情况，定制专属求职画像",
  "智能识别简历资料库，精准提炼目标岗位",
  "全自动化巡航投递，严格匹配求职策略",
];

export const ThreeDTextReveal: FC<ThreeDTextRevealProps> = ({
  items,
  text,
  perspective = 1000,
  scrubSmoothing = 1,
  radiusOffset = 0.45,
  fontSize = "clamp(1.75rem, 3.8vw, 2.75rem)",
  fontWeight = 800,
  gap = 26,
  className = "",
  textClassName = "",
  autoCycle = true,
  cycleInterval = 4200,
  activeIndex: controlledIndex,
  onIndexChange,
  onItemClick,
  showScrollIndicator = false,
}) => {
  const displayItems = items || text || DEFAULT_ITEMS;
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);
  
  const [internalIndex, setInternalIndex] = useState(0);
  const currentIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;

  // 内部动画进度对象（用于 GSAP 平滑插值驱动）
  const progressObj = useRef({ value: currentIndex });

  // 渲染圆柱空间变换
  const renderCylinder = useCallback(
    (progress: number) => {
      const container = containerRef.current;
      if (!container) return;

      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      // 基于视口与 offset 计算圆柱半径 R
      const radius = Math.max(220, vh * radiusOffset);

      displayItems.forEach((_, idx) => {
        const el = itemsRef.current[idx];
        if (!el) return;

        // 计算当前项相对中心的角位移（deg）
        const angle = (idx - progress) * gap;
        const rad = (angle * Math.PI) / 180;
        const absAngle = Math.abs(angle);

        // 圆柱曲面坐标系:
        // Y 轴位移沿弧长展开: R * sin(theta)
        // Z 轴深度向内部后退: -R * (1 - cos(theta))
        const transY = radius * Math.sin(rad);
        const transZ = -radius * (1 - Math.cos(rad));
        const rotX = -angle; // 倾斜角与视角切线呼应

        // 黄金视界可见度衰减
        const isCenter = absAngle < gap * 0.4;
        let opacity = 0;
        let blur = 0;

        if (absAngle <= gap * 1.5) {
          opacity = Math.max(0, 1 - (absAngle / (gap * 1.5)) * 0.75);
          blur = Math.min(2, (absAngle / gap) * 0.8);
        }

        // 应用硬件加速 3D 矩阵
        el.style.transform = `translate3d(0, ${transY.toFixed(1)}px, ${transZ.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg)`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : "none";
        el.style.pointerEvents = isCenter ? "auto" : "none";
        el.style.zIndex = Math.round(100 - absAngle).toString();

        if (isCenter) {
          el.classList.add("active");
          el.classList.remove("inactive");
        } else {
          el.classList.add("inactive");
          el.classList.remove("active");
        }
      });
    },
    [displayItems, gap, radiusOffset]
  );

  // GSAP 驱动当前进度平滑滚动到目标项
  useEffect(() => {
    const target = currentIndex;
    const duration = Math.max(0.6, scrubSmoothing * 0.85);

    const tween = gsap.to(progressObj.current, {
      value: target,
      duration,
      ease: "power2.out",
      onUpdate: () => {
        renderCylinder(progressObj.current.value);
      },
    });

    return () => {
      tween.kill();
    };
  }, [currentIndex, scrubSmoothing, renderCylinder]);

  // 自动循环轮转
  useEffect(() => {
    if (!autoCycle || controlledIndex !== undefined) return;
    if (displayItems.length <= 1) return;

    const timer = setInterval(() => {
      setInternalIndex((prev) => {
        const next = (prev + 1) % displayItems.length;
        onIndexChange?.(next);
        return next;
      });
    }, cycleInterval);

    return () => clearInterval(timer);
  }, [autoCycle, controlledIndex, displayItems.length, cycleInterval, onIndexChange]);

  // 初始渲染一次
  useEffect(() => {
    renderCylinder(progressObj.current.value);
  }, [renderCylinder]);

  return (
    <div
      ref={containerRef}
      className={`three-d-text-reveal-container ${className}`}
      style={
        {
          "--perspective": `${perspective}px`,
          perspective: `${perspective}px`,
          height: "4.5rem",
        } as CSSProperties
      }
    >
      <div className="three-d-text-cylinder h-full flex items-center justify-center">
        {displayItems.map((itemText, idx) => (
          <div
            key={idx}
            ref={(el) => {
              itemsRef.current[idx] = el;
            }}
            onClick={() => onItemClick?.(idx)}
            className={`three-d-text-item text-center tracking-tight leading-tight select-none ${textClassName}`}
            style={{
              fontSize,
              fontWeight,
            }}
          >
            <span className="inline-block bg-gradient-to-r from-white via-stone-100 to-stone-300 bg-clip-text text-transparent">
              {itemText}
            </span>
          </div>
        ))}
      </div>

      {showScrollIndicator && (
        <div className="mt-4 flex flex-col items-center justify-center gap-1.5 opacity-60">
          <div className="w-4 h-7 rounded-full border border-stone-500 flex items-start justify-center p-0.5">
            <span className="w-1 h-1.5 rounded-full bg-[#ff5722] animate-scroll-wheel" />
          </div>
        </div>
      )}
    </div>
  );
};

export const TextReveal = ThreeDTextReveal;
export default ThreeDTextReveal;
