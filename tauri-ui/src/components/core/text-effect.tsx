import React, { useEffect, useMemo, useRef, useState } from "react";
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
  char: 0.03,
  word: 0.05,
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

    // per === "word" (默认)：英文按词与空格切分，中文/日韩字符单字即词，呈现最细腻的流光入场
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
 * 支持 'fade-in-blur' / 'blur' / 'scale' / 'fade' / 'slide' 预设
 * 支持 speedReveal（逐字显现速率）与 speedSegment（单段动效时长系数）
 */
export function TextEffect({
  children,
  per = "word",
  as: Component = "p",
  className,
  preset = "fade",
  delay = 0,
  speedReveal = 1,
  speedSegment = 1,
  trigger = true,
  onAnimationComplete,
  onAnimationStart,
  segmentWrapperClassName,
  style,
}: TextEffectProps) {
  const [mounted, setMounted] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const fullText = useMemo(() => getReadableText(children), [children]);
  const segments = useMemo(
    () => extractSegments(children, per),
    [children, per]
  );

  const stagger = (defaultStaggerTimes[per] || 0.04) / Math.max(speedReveal, 0.1);
  const segmentDuration = 0.35 / Math.max(speedSegment, 0.1);
  const totalDuration = delay + segments.length * stagger + segmentDuration;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!trigger) {
      setMounted(false);
      setIsDone(false);
      return;
    }

    // 下一帧触发过渡动画
    const rAF = requestAnimationFrame(() => {
      setMounted(true);
    });

    if (onAnimationStart) {
      startTimerRef.current = setTimeout(() => {
        onAnimationStart();
      }, delay * 1000);
    }

    timerRef.current = setTimeout(() => {
      setIsDone(true);
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    }, totalDuration * 1000);

    return () => {
      cancelAnimationFrame(rAF);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
    };
  }, [trigger, delay, totalDuration, onAnimationComplete, onAnimationStart]);

  // 根据预设生成关键帧样式
  const getInitialStyle = (): React.CSSProperties => {
    switch (preset) {
      case "fade-in-blur":
        return {
          opacity: 0,
          filter: "blur(12px)",
          transform: "translate3d(0, 18px, 0)",
        };
      case "blur":
        return {
          opacity: 0,
          filter: "blur(12px)",
          transform: "none",
        };
      case "scale":
        return {
          opacity: 0,
          transform: "scale(0.85)",
        };
      case "slide":
        return {
          opacity: 0,
          transform: "translate3d(0, 20px, 0)",
        };
      case "fade":
      default:
        return {
          opacity: 0,
        };
    }
  };

  const getVisibleStyle = (): React.CSSProperties => {
    return {
      opacity: 1,
      filter: "blur(0px)",
      transform: "translate3d(0, 0, 0)",
    };
  };

  const initialStyle = getInitialStyle();
  const visibleStyle = getVisibleStyle();
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

        const currentStyle: React.CSSProperties = isDone
          ? {
              opacity: 1,
              filter: "none",
              transform: "none",
              ...seg.style,
            }
          : {
              ...(mounted && trigger ? visibleStyle : initialStyle),
              transitionProperty: "opacity, filter, transform",
              transitionDuration: `${segmentDuration}s`,
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              transitionDelay: `${itemDelay}s`,
              willChange: "opacity, filter, transform",
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

/**
 * 示例组件（方便直接导入与验证）
 */
export function TextEffectSpeed() {
  return (
    <TextEffect preset="fade-in-blur" speedReveal={1.1} speedSegment={0.3}>
      Animate your ideas with motion-primitives.
    </TextEffect>
  );
}
export default TextEffect;
