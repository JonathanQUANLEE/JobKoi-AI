import { useEffect } from "react";
import { Check, XCircle } from "lucide-react";
import { useRunStore } from "../../store";

/**
 * 软件中心浮现提示（Center Toast，2026-10-12 视觉重设计）：
 * 关键反馈（保存成功 / 登录成功）在软件中央浮现——黑白玻璃拟态卡片 +
 * 琥珀品牌光条 + 状态图标，对齐 LoginOverlay 的质感（用户认可的 FaceID
 * 卡片风格），弃用旧版绿色配色（用户反馈"太 low、廉价"）。
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
  const isError = centerToast.tone === "error";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none select-none">
      {/* 背景虚化遮罩：聚焦中央提示 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-in fade-in duration-300" />

      {/* 黑白玻璃卡片：纯黑玻璃 + 细白边 + 柔和白光晕 + 琥珀品牌光条 */}
      <div
        className={`relative flex items-center gap-4 pl-7 pr-9 py-5 rounded-2xl border backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_50px_rgba(255,255,255,0.06)] animate-in zoom-in-95 duration-200 ${
          isError ? "border-red-400/30 bg-black/85" : "border-white/15 bg-black/85"
        }`}
      >
        {/* 左侧琥珀品牌光条（指示灯质感） */}
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-10 w-[3px] rounded-full bg-gradient-to-b shadow-[0_0_14px_rgba(245,158,11,0.75)] ${
            isError
              ? "from-red-400 to-red-600 shadow-[0_0_14px_rgba(248,113,113,0.75)]"
              : "from-amber-200 to-amber-500"
          }`}
        />

        {/* 状态图标（成功=白底细边圆圈对勾；错误=红叉） */}
        <span
          className={`grid place-items-center size-10 rounded-full border animate-in zoom-in-50 duration-300 ${
            isError ? "border-red-400/40 bg-red-500/10" : "border-white/25 bg-white/[0.07]"
          }`}
        >
          {isError ? (
            <XCircle className="size-5 text-red-400" strokeWidth={2.2} />
          ) : (
            <Check className="size-5 text-white" strokeWidth={2.6} />
          )}
        </span>

        {/* 大字文案：宽字距，白色高反差 */}
        <span className="text-lg sm:text-xl font-semibold tracking-[0.06em] text-white">
          {centerToast.text}
        </span>
      </div>
    </div>
  );
}
