import { useEffect, useState } from "react";
import { useRunStore } from "../../store";

/**
 * 软件中心浮现提示（Center Toast，2026-10-12 二次重设计）：
 * 用户反馈"弹出一个小方框不舒服"——专业软件的保存反馈是**纯文字**：
 * 几个字在屏幕中央淡入 → 停留约 2.5 秒 → 渐渐淡出消失（全程 3~4 秒），
 * 无卡片、无边框、不打断操作。文字带柔和暗晕保证任何背景上可读。
 */
export default function CenterToast() {
  const centerToast = useRunStore((s) => s.centerToast);
  const clearCenterToast = useRunStore((s) => s.clearCenterToast);
  // 淡出相位：duration 结束前 600ms 切到 out，让文字渐渐消失而非瞬间消失
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (!centerToast) return;
    setPhase("in");
    const total = centerToast.duration ?? 2600;
    const fadeOutAt = Math.max(600, total - 600);
    const outTimer = setTimeout(() => setPhase("out"), fadeOutAt);
    const clearTimer = setTimeout(() => clearCenterToast(), total);
    return () => {
      clearTimeout(outTimer);
      clearTimeout(clearTimer);
    };
  }, [centerToast, clearCenterToast]);

  if (!centerToast) return null;
  const isError = centerToast.tone === "error";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none select-none">
      {/* 极淡背景压暗（聚焦文字但不做成"框"） */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          phase === "out" ? "opacity-0" : "opacity-100"
        } ${isError ? "bg-black/25" : "bg-black/20"} backdrop-blur-[2px]`}
      />
      {/* 纯文字：淡入 → 停留 → 淡出；暗晕 text-shadow 保证可读 */}
      <span
        className={`relative text-xl sm:text-2xl font-semibold tracking-[0.12em] transition-all duration-500 ${
          phase === "out" ? "opacity-0 translate-y-1.5" : "opacity-100"
        } ${
          isError
            ? "text-red-300 [text-shadow:0_2px_24px_rgba(0,0,0,0.9),0_0_48px_rgba(248,113,113,0.35)]"
            : "text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.9),0_0_48px_rgba(255,255,255,0.18)]"
        }`}
      >
        {centerToast.text}
      </span>
    </div>
  );
}
