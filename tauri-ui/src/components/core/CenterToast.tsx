import { useEffect } from "react";
import { useRunStore } from "../../store";

/**
 * 软件中心浮现提示（Center Toast）：
 * 用户要求的"登录成功"类关键反馈——不是传统弹窗，而是在整个软件中央
 * 浮现一行醒目大字（背景虚化、短暂停留后自动渐隐），不打断用户操作。
 */
export default function CenterToast() {
  const centerToast = useRunStore((s) => s.centerToast);
  const clearCenterToast = useRunStore((s) => s.clearCenterToast);

  useEffect(() => {
    if (!centerToast) return;
    const timer = setTimeout(() => {
      clearCenterToast();
    }, centerToast.duration ?? 2000);
    return () => clearTimeout(timer);
  }, [centerToast, clearCenterToast]);

  if (!centerToast) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none select-none">
      {/* 背景虚化遮罩：聚焦中央提示 */}
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[3px] animate-in fade-in duration-300" />
      <div
        className={`relative flex items-center gap-2.5 px-7 py-4 rounded-2xl border shadow-2xl animate-in zoom-in-90 duration-200 text-base sm:text-lg font-bold tracking-wide ${
          centerToast.tone === "error"
            ? "bg-stone-950/95 border-red-500/40 text-red-300 shadow-red-950/60"
            : "bg-stone-950/95 border-emerald-500/40 text-emerald-300 shadow-emerald-950/60"
        }`}
      >
        <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
        <span>{centerToast.text}</span>
      </div>
    </div>
  );
}