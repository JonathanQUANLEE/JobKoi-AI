import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type FC,
} from "react";
import { gsap } from "gsap";
import { useRunStore } from "../../store";
import "./PillNav.css";

export interface PillNavButtonProps {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
  shortcut?: string;
  className?: string;
  variant?: "nav" | "primary" | "menu" | "danger-menu";
  bubbleColor?: string;
  title?: string;
  ease?: string;
}

export const PillNavButton: FC<PillNavButtonProps> = ({
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
  badge,
  shortcut,
  className = "",
  variant = "nav",
  bubbleColor,
  title,
  ease = "power3.easeOut",
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const circleRef = useRef<HTMLSpanElement>(null);
  const normalLabelRef = useRef<HTMLSpanElement>(null);
  const hoverLabelRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  // 计算 React Bits 液体气泡几何展开外接圆参数
  const layout = useCallback(() => {
    const btn = buttonRef.current;
    const circle = circleRef.current;
    if (!btn || !circle) return;

    const rect = btn.getBoundingClientRect();
    const { width: w, height: h } = rect;
    if (w === 0 || h === 0) return;

    // React Bits PillNav 公式：外接圆半径 R 与穹顶增量 delta
    const R = ((w * w) / 4 + h * h) / (2 * h);
    const D = Math.ceil(2 * R) + 2;
    const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
    const originY = D - delta;

    circle.style.width = `${D}px`;
    circle.style.height = `${D}px`;
    circle.style.bottom = `-${delta}px`;

    gsap.set(circle, {
      xPercent: -50,
      scale: 0,
      transformOrigin: `50% ${originY}px`,
    });

    const normalEl = normalLabelRef.current;
    const hoverEl = hoverLabelRef.current;

    if (normalEl) gsap.set(normalEl, { y: 0 });
    if (hoverEl) gsap.set(hoverEl, { y: h + 12, opacity: 0 });

    tlRef.current?.kill();
    const tl = gsap.timeline({ paused: true });

    tl.to(circle, { scale: 1.18, xPercent: -50, duration: 0.32, ease, overwrite: "auto" }, 0);
    if (normalEl) {
      tl.to(normalEl, { y: -(h + 8), duration: 0.32, ease, overwrite: "auto" }, 0);
    }
    if (hoverEl) {
      tl.to(hoverEl, { y: 0, opacity: 1, duration: 0.32, ease, overwrite: "auto" }, 0);
    }

    tlRef.current = tl;
  }, [ease]);

  useEffect(() => {
    layout();

    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    if (document.fonts?.ready) {
      document.fonts.ready.then(layout).catch(() => {});
    }

    return () => {
      window.removeEventListener("resize", onResize);
      tlRef.current?.kill();
    };
  }, [layout]);

  const handleMouseEnter = () => {
    if (disabled) return;
    const tl = tlRef.current;
    if (!tl) return;
    tl.tweenTo(tl.duration(), {
      duration: 0.28,
      ease,
      overwrite: "auto",
    });
  };

  const handleMouseLeave = () => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.tweenTo(0, {
      duration: 0.22,
      ease,
      overwrite: "auto",
    });
  };

  const currentTheme = useRunStore((s) => s.theme);
  const isMonochrome = currentTheme === "monochrome";

  // 根据不同变体分配基础与气泡配色
  const resolvedBubbleColor =
    bubbleColor ||
    (isMonochrome
      ? variant === "primary"
        ? "#000000" // 核心黑白反差：白色药丸按钮，内部展开纯黑液体气泡！
        : variant === "danger-menu"
        ? "rgba(239, 68, 68, 0.18)"
        : variant === "menu"
        ? "rgba(255, 255, 255, 0.14)"
        : active
        ? "rgba(255, 255, 255, 0.14)"
        : "rgba(255, 255, 255, 0.08)"
      : variant === "primary"
      ? "rgba(255, 255, 255, 0.24)"
      : variant === "danger-menu"
      ? "rgba(239, 68, 68, 0.16)"
      : variant === "menu"
      ? "rgba(245, 158, 11, 0.15)"
      : active
      ? "rgba(245, 158, 11, 0.20)"
      : "rgba(255, 255, 255, 0.08)");

  const baseVariantStyles = isMonochrome
    ? variant === "primary"
      ? "w-full justify-center rounded-xl bg-white px-3 py-2.5 text-xs font-black text-black shadow-lg shadow-white/10 active:scale-[0.98] transition-all disabled:opacity-50 overflow-hidden"
      : variant === "menu"
      ? "w-full justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
      : variant === "danger-menu"
      ? "w-full justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-red-400 transition-colors"
      : active
      ? "w-full justify-between rounded-xl px-3 py-2.5 text-xs font-semibold bg-zinc-900 text-zinc-100 border border-zinc-700/80 shadow-inner transition-all"
      : "w-full justify-between rounded-xl px-3 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-all"
    : variant === "primary"
    ? "w-full justify-center rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2.5 text-xs font-bold text-stone-950 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
    : variant === "menu"
    ? "w-full justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-300 hover:text-amber-400 transition-colors"
    : variant === "danger-menu"
    ? "w-full justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-300 hover:text-red-400 transition-colors"
    : active
    ? "w-full justify-between rounded-xl px-3 py-2.5 text-xs font-semibold bg-[#25211c] text-amber-400 border border-amber-500/20 shadow-sm transition-all"
    : "w-full justify-between rounded-xl px-3 py-2.5 text-xs font-medium text-stone-400 hover:text-stone-100 transition-all";

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title || label}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`pill-btn-root ${baseVariantStyles} ${className}`}
    >
      {/* React Bits 液体气泡展开底图 */}
      <span
        ref={circleRef}
        className="pill-btn-circle"
        style={{ backgroundColor: resolvedBubbleColor }}
        aria-hidden="true"
      />

      {/* 按钮内容排版 */}
      <div className="pill-btn-content">
        <div className="pill-btn-stack">
          {/* 正常默认标签 */}
          <span
            ref={normalLabelRef}
            className={`pill-btn-label-normal ${
              isMonochrome && variant === "primary" ? "text-black font-black" : ""
            }`}
          >
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="truncate">{label}</span>
          </span>

          {/* 悬停翻转标签（React Bits Label Flipping） */}
          <span
            ref={hoverLabelRef}
            className={`pill-btn-label-hovered ${
              isMonochrome
                ? variant === "primary"
                  ? "text-white font-black"
                  : variant === "danger-menu"
                  ? "text-red-400 font-semibold"
                  : variant === "menu"
                  ? "text-white font-semibold"
                  : active
                  ? "text-white font-bold"
                  : "text-white font-semibold"
                : variant === "primary"
                ? "text-stone-950 font-black"
                : variant === "danger-menu"
                ? "text-red-400 font-semibold"
                : variant === "menu"
                ? "text-amber-400 font-semibold"
                : active
                ? "text-amber-300 font-bold"
                : "text-white font-semibold"
            }`}
            aria-hidden="true"
          >
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="truncate">{label}</span>
          </span>
        </div>

        {/* 右侧微件：徽章或快捷键提示 */}
        {badge && <div className="shrink-0 z-10 ml-2">{badge}</div>}
        {shortcut && (
          <span className="text-[10px] text-stone-500 font-mono shrink-0 z-10 ml-2">
            {shortcut}
          </span>
        )}
      </div>
    </button>
  );
};

export default PillNavButton;
