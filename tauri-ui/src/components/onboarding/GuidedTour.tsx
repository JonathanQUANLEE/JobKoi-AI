import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { CpuIcon, Rocket01Icon, User02Icon } from "@hugeicons/core-free-icons";
import type { TourStepId } from "../../lib/onboarding";

/**
 * 新手引导步骤卡（2026-10-14 V0.3 改版：轻量化）。
 *
 * 纯展示组件：状态机在 useOnboardingTour / Dashboard，这里只渲染当前一步。
 * 视觉原则（用户反馈：不要"大大的方框"，要简约轻盈）——
 * 欢迎卡：小卡 + 轻遮罩；步骤卡：底部悬浮细条，小图标（无渐变底座）、
 * 文字计数替代进度点、幽灵按钮。blocked 时由父级直接卸载。
 */

export type GuidedTourStep = TourStepId | "welcome";

interface GuidedTourProps {
  step: GuidedTourStep;
  stepIndex: number; // 1-based；welcome 时传 0
  total: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onStart: () => void;
  onAction: (step: TourStepId) => void;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const STEP_ICONS: Record<TourStepId, IconSvgElement> = {
  model: CpuIcon,
  profile: User02Icon,
  cruise: Rocket01Icon,
};

const STEP_ICON_COLORS: Record<TourStepId, string> = {
  model: "text-purple-400",
  profile: "text-pink-400",
  cruise: "text-amber-400",
};

/**
 * 引导卡跟着步骤走（2026-10-14 用户反馈：位置应该变，不要一直待在一个地方）——
 * 第一步的入口是左下角头像菜单 → 卡片停在侧边栏右侧；第二步主场是工作台
 * 中央的 AI 对话 → 卡片停在底部对话区；第三步舞台翻到平台中心 → 卡片停在顶部。
 */
const STEP_POSITIONS: Record<TourStepId, { wrap: string; anim: string }> = {
  model: { wrap: "left-64 bottom-24", anim: "slide-in-from-left-2" },
  profile: { wrap: "inset-x-0 bottom-20 flex justify-center", anim: "slide-in-from-bottom-2" },
  cruise: { wrap: "inset-x-0 top-16 flex justify-center", anim: "slide-in-from-top-2" },
};

export default function GuidedTour({
  step,
  stepIndex,
  total,
  t,
  onStart,
  onAction,
  onPrev,
  onNext,
  onSkip,
}: GuidedTourProps) {
  if (step === "welcome") {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-stone-950/50">
        <div className="mx-4 w-full max-w-xs rounded-xl border border-white/10 bg-stone-900/95 p-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <h2 className="text-base font-semibold tracking-tight text-white">
            {t("tour.welcome.title")}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-stone-400">
            {t("tour.welcome.desc")}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onStart}
              className="flex-1 rounded-lg bg-[#ff5722] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
            >
              {t("tour.welcome.start")}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-3 py-1.5 text-xs text-stone-500 transition-colors hover:text-stone-300"
            >
              {t("tour.skip")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const Icon = STEP_ICONS[step];
  const isLast = stepIndex >= total;
  const pos = STEP_POSITIONS[step];

  return (
    <div className={`pointer-events-none fixed z-[999] px-4 ${pos.wrap}`}>
      <div
        className={`pointer-events-auto w-full max-w-sm rounded-xl border border-white/10 bg-stone-950/95 p-3.5 shadow-xl backdrop-blur-md animate-in fade-in ${pos.anim} duration-300`}
      >
        {/* 标题行：小图标 + 标题 + 文字计数（替代进度点，更轻） */}
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Icon} size={15} className={`shrink-0 ${STEP_ICON_COLORS[step]}`} />
          <span className="text-sm font-semibold tracking-tight text-white">
            {t(`tour.step.${step}.title`)}
          </span>
          <span className="ml-auto text-[10px] tabular-nums text-stone-500">
            {stepIndex}/{total}
          </span>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-stone-400">
          {t(`tour.step.${step}.desc`)}
        </p>

        <div className="mt-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onAction(step)}
            className="rounded-lg bg-[#ff5722] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
          >
            {t(`tour.go.${step}`)}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="text-xs text-stone-300 underline underline-offset-4 decoration-stone-600 transition-colors hover:text-white"
          >
            {isLast ? t("tour.done") : t("tour.next")}
          </button>
          {stepIndex > 1 && (
            <button
              type="button"
              onClick={onPrev}
              className="text-xs text-stone-500 transition-colors hover:text-stone-300"
            >
              {t("tour.prev")}
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            className="ml-auto text-[11px] text-stone-600 transition-colors hover:text-stone-400"
          >
            {t("tour.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
