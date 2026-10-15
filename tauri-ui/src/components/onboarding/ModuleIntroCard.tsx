import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AiChat02Icon,
  Analytics01Icon,
  CpuIcon,
  File01Icon,
  FilterIcon,
  RabbitIcon,
  Radar01Icon,
  ShieldCheckIcon,
  SparklesIcon,
  User02Icon,
} from "@hugeicons/core-free-icons";
import type { IntroModuleId } from "../../lib/onboarding";

/**
 * 模块首次打开介绍卡（2026-10-14 V0.3 改版：轻量化）。
 *
 * 视觉原则（用户反馈：要"小小的提醒"，不要大框）——顶部居中悬浮小卡，
 * 无全屏遮罩、无背景压暗：不挡下方内容、不抢焦点，读完点「知道了」即走。
 * 纯展示：是否该弹由 Dashboard 的 effect 用 lib/onboarding 判定；看过永不复弹。
 */

const MODULE_ICONS: Record<IntroModuleId, IconSvgElement> = {
  profile: User02Icon,
  resumes: File01Icon,
  polish: SparklesIcon,
  copilot: AiChat02Icon,
  analytics: Analytics01Icon,
  live: Radar01Icon,
  pet: RabbitIcon,
  rules: FilterIcon,
  policy: ShieldCheckIcon,
  model: CpuIcon,
};

const MODULE_ICON_COLORS: Record<IntroModuleId, string> = {
  profile: "text-pink-400",
  resumes: "text-sky-400",
  polish: "text-violet-400",
  copilot: "text-emerald-400",
  analytics: "text-amber-400",
  live: "text-orange-400",
  pet: "text-rose-400",
  rules: "text-teal-400",
  policy: "text-blue-400",
  model: "text-purple-400",
};

interface ModuleIntroCardProps {
  module: IntroModuleId;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onClose: () => void;
}

export default function ModuleIntroCard({ module, t, onClose }: ModuleIntroCardProps) {
  const Icon = MODULE_ICONS[module];

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-[1001] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-white/10 bg-stone-900/95 p-3.5 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Icon} size={15} className={`shrink-0 ${MODULE_ICON_COLORS[module]}`} />
          <span className="text-sm font-semibold tracking-tight text-white">
            {t(`intro.${module}.title`)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("intro.gotIt")}
            className="ml-auto rounded-md p-1 text-stone-500 transition-colors hover:bg-white/5 hover:text-stone-200"
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-400">
          {t(`intro.${module}.desc`)}
        </p>
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-amber-300/90 transition-colors hover:text-amber-300"
          >
            {t("intro.gotIt")} →
          </button>
        </div>
      </div>
    </div>
  );
}
