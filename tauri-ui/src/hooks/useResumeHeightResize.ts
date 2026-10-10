import { useState, useRef } from "react";
import { useRunStore } from "../store";

export const DEFAULT_CARD_HEIGHT = 640;
export const MIN_CARD_HEIGHT = 480;

export function useResumeHeightResize() {
  const notify = useRunStore((s) => s.notify);

  // 用户自定义视窗垂直拉伸高度（仅支持向下/向上垂直拖拽，不影响横向宽度与全局布局）
  const [cardHeight, setCardHeight] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem("boss_resumes_card_height") || "", 10);
      return saved >= MIN_CARD_HEIGHT ? saved : DEFAULT_CARD_HEIGHT;
    } catch {
      return DEFAULT_CARD_HEIGHT;
    }
  });

  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const [isExceedingMax, setIsExceedingMax] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const warnedRef = useRef(false);

  // 底部手柄向下/向上拖拽调整高度（受应用软件界面最大底边边界约束，超出时告警并在松手后贴底）
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = cardHeight;
    setIsResizingHeight(true);
    setIsExceedingMax(false);
    warnedRef.current = false;

    // 计算当前视口可用最大高度边界
    const rect = stageRef.current?.getBoundingClientRect();
    const stageTop = rect ? rect.top : 140;
    // 留出 40px 底部安全间隙，不能超出整个软件主视窗
    const maxAllowed = Math.max(MIN_CARD_HEIGHT + 100, window.innerHeight - stageTop - 40);

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaY = moveEvent.clientY - startY;
      const rawHeight = startHeight + deltaY;

      if (rawHeight > maxAllowed) {
        setIsExceedingMax(true);
        if (!warnedRef.current) {
          warnedRef.current = true;
          notify({
            type: "warning",
            text: "已达应用软件界面最大拉伸边界，松手后将自动贴齐窗口底端",
            source: "视窗调整",
          });
        }
        // 允许拉伸过程中视觉稍微有一点阻尼超出提示，但不能无限拖大
        setCardHeight(Math.round(maxAllowed + Math.min(20, (rawHeight - maxAllowed) * 0.1)));
      } else {
        setIsExceedingMax(false);
        warnedRef.current = false;
        const clamped = Math.max(MIN_CARD_HEIGHT, Math.min(maxAllowed, rawHeight));
        setCardHeight(Math.round(clamped));
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsResizingHeight(false);

      setCardHeight((current) => {
        let finalHeight = current;
        if (current > maxAllowed) {
          finalHeight = Math.round(maxAllowed);
        } else if (current < MIN_CARD_HEIGHT) {
          finalHeight = MIN_CARD_HEIGHT;
        }
        try {
          localStorage.setItem("boss_resumes_card_height", finalHeight.toString());
        } catch {}
        return finalHeight;
      });
      setIsExceedingMax(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const resetDefaultHeight = () => {
    setCardHeight(DEFAULT_CARD_HEIGHT);
    try {
      localStorage.setItem("boss_resumes_card_height", DEFAULT_CARD_HEIGHT.toString());
    } catch {}
    notify({ type: "info", text: "已重置视窗为默认高度 (640px)", source: "视窗调整" });
  };

  return {
    stageRef,
    cardHeight,
    isResizingHeight,
    isExceedingMax,
    handleResizeStart,
    resetDefaultHeight,
  };
}
