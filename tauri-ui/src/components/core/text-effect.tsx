import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

export type PresetType = "blur" | "fade-in-blur" | "scale" | "fade" | "slide";
export type PerType = "word" | "char" | "line";

export interface TextEffectProps {
  children: React.ReactNode;
  per?: PerType;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  preset?: PresetType;
  delay?: number;
  speedReveal?: number;
  speedSegment?: number;
  trigger?: boolean;
  onAnimationComplete?: () => void;
  onAnimationStart?: () => void;
  segmentWrapperClassName?: string;
  style?: React.CSSProperties;
}

interface SegmentUnit {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

const defaultStaggerTimes: Record<PerType, number> = {
  char: 0.035,
  word: 0.045,
  line: 0.1,
};

// 提取并智能分词（针对中文/日文/韩文与英文混合排版优化）
function extractSegments(
  node: React.ReactNode,
  per: PerType,
  inheritedClassName?: string,
  inheritedStyle?: React.CSSProperties
): SegmentUnit[] {
  if (typeof node === "string" || typeof node === "number") {
    const raw = String(node);
    if (!raw) return [];

    if (per === "line") {
      return raw.split("\n").map((line) => ({
        text: line,
        className: inheritedClassName,
        style: inheritedStyle,
      }));
    }

    if (per === "char") {
      return Array.from(raw).map((char) => ({
        text: char,
        className: inheritedClassName,
        style: inheritedStyle,
      }));
    }

    // 默认分词：汉字/日韩字符单字即词，英文按词与空格切分
    const units: SegmentUnit[] = [];
    const regex = /([\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]|[a-zA-Z0-9_\-]+|\s+|[^\w\s])/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(raw)) !== null) {
      if (match[0]) {
        units.push({
          text: match[0],
          className: inheritedClassName,
          style: inheritedStyle,
        });
      }
    }

    return units.length > 0
      ? units
      : [{ text: raw, className: inheritedClassName, style: inheritedStyle }];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) =>
      extractSegments(child, per, inheritedClassName, inheritedStyle)
    );
  }

  if (React.isValidElement(node)) {
    const combinedClass = cn(inheritedClassName, (node.props as any)?.className);
    const combinedStyle = {
      ...inheritedStyle,
      ...((node.props as any)?.style || {}),
    };
    return extractSegments(
      (node.props as any)?.children,
      per,
      combinedClass,
      combinedStyle
    );
  }

  return [];
}

function getReadableText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getReadableText).join("");
  if (React.isValidElement(node)) return getReadableText((node.props as any)?.children);
  return "";
}

/**
 * motion-primitives 高保真文本动效组件: TextEffect
 * 采用浏览器硬件加速 CSS Keyframes 动效，保证无论何时挂载/切换均 100% 稳定运行
 */
export function TextEffect({
  children,
  per = "word",
  as: Component = "p",
  className,
  preset = "fade",
  delay = 0,
  speedReveal = 1.1,
  speedSegment = 0.3,
  trigger = true,
  onAnimationComplete,
  onAnimationStart,
  segmentWrapperClassName,
  style,
}: TextEffectProps) {
  const fullText = useMemo(() => getReadableText(children), [children]);
  const segments = useMemo(
    () => extractSegments(children, per),
    [children, per]
  );

  const stagger = (defaultStaggerTimes[per] || 0.035) / Math.max(speedReveal, 0.1);
  const segmentDuration = 0.35 / Math.max(speedSegment, 0.1);
  const totalDuration = delay + segments.length * stagger + segmentDuration;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!trigger) return;

    if (onAnimationStart) {
      startTimerRef.current = setTimeout(() => {
        onAnimationStart();
      }, delay * 1000);
    }

    if (onAnimationComplete) {
      timerRef.current = setTimeout(() => {
        onAnimationComplete();
      }, totalDuration * 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
    };
  }, [trigger, delay, totalDuration, onAnimationComplete, onAnimationStart]);

  const animationName = `text-${preset}`;
  const Tag = Component as any;

  return (
    <Tag
      className={cn("text-effect-container relative", className)}
      style={style}
      aria-label={fullText}
    >
      <span className="sr-only">{fullText}</span>

      {segments.map((seg, index) => {
        const itemDelay = delay + index * stagger;
        const isSpace = seg.text === " " || /^\s+$/.test(seg.text);

        const currentStyle: React.CSSProperties = trigger
          ? {
              animationName,
              animationDuration: `${segmentDuration}s`,
              animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              animationDelay: `${itemDelay}s`,
              animationFillMode: "both",
              willChange: "opacity, filter, transform",
              ...seg.style,
            }
          : {
              opacity: 0,
              filter: preset === "fade-in-blur" || preset === "blur" ? "blur(12px)" : undefined,
              transform: preset === "fade-in-blur" || preset === "slide" ? "translateY(18px)" : undefined,
              ...seg.style,
            };

        const wrapperClass = cn(
          per === "line" ? "block" : "inline-block whitespace-pre",
          segmentWrapperClassName
        );

        return (
          <span
            key={`seg-${index}-${seg.text}`}
            aria-hidden="true"
            className={wrapperClass}
          >
            <span
              className={cn("inline-block", seg.className)}
              style={currentStyle}
            >
              {isSpace ? "\u00A0" : seg.text}
            </span>
          </span>
        );
      })}
    </Tag>
  );
}

export function TextEffectSpeed() {
  return (
    <TextEffect preset="fade-in-blur" speedReveal={1.1} speedSegment={0.3}>
      Animate your ideas with motion-primitives.
    </TextEffect>
  );
}

export default TextEffect;
