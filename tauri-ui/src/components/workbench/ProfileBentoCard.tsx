import type { RefObject } from "react";
import {
  UserCheck,
  Activity,
  FileText,
  ShieldCheck,
} from "lucide-react";
import type { Mode } from "../../lib/profileForm";
import type { Lang } from "../../lib/i18n";
import { MagicCard } from "../core/MagicBento";

interface ProfileBentoCardProps {
  profileRef: RefObject<HTMLDivElement>;
  isChattingOrHasHistory: boolean;
  label: string;
  cityValues: string;
  educationValues: string;
  defaultResumeName: string;
  mode: Mode;
  delayMin: string;
  delayMax: string;
  dailyLimit: string;
  running: boolean;
  stats: { scanned: number; sent: number; skipped: number };
  onGoToProfile: () => void;
  onGoToAnalytics: () => void;
  onGoToResumes: () => void;
  lang: Lang;
}

export default function ProfileBentoCard({
  profileRef,
  isChattingOrHasHistory,
  label,
  cityValues,
  educationValues,
  defaultResumeName,
  mode,
  delayMin,
  delayMax,
  dailyLimit,
  running,
  stats,
  onGoToProfile,
  onGoToAnalytics,
  onGoToResumes,
  lang,
}: ProfileBentoCardProps) {
  return (
    <div
      ref={profileRef}
      className={
        !isChattingOrHasHistory
          ? "absolute inset-x-0 mx-auto w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] px-3 sm:px-6 lg:px-8 will-change-transform perspective-layer"
          : "relative w-full"
      }
      style={
        !isChattingOrHasHistory
          ? {
              transformOrigin: "center center",
              opacity: 0,
              pointerEvents: "none",
              zIndex: 10,
            }
          : undefined
      }
    >
      <MagicCard
        className="spatial-card-glow w-full rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 sm:p-6 lg:p-7 shadow-sm space-y-5"
        glowColor="245, 158, 11"
        enableTilt={false}
        enableStars={false}
        enableBorderGlow={true}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[var(--grid)]">
          <div className="flex items-center gap-2.5">
            <div className="size-8 sm:size-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shadow-sm">
              <UserCheck className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <span className="text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--ink)]">
              {lang === "en" ? "Job Profile" : "求职画像"}
            </span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
              {lang === "en" ? "Synced" : "已同步"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onGoToProfile}
              className="text-xs sm:text-[13px] flex items-center gap-1.5 py-1.5 px-3.5 rounded-xl border border-amber-500/40 hover:border-amber-500/70 text-amber-400 hover:text-amber-300 bg-amber-500/10 transition-all cursor-pointer font-medium"
            >
              <UserCheck className="h-4 w-4" />
              <span>{lang === "en" ? "View / Edit Job Profile →" : "查看 / 手动修改求职画像 →"}</span>
            </button>
            <button
              type="button"
              onClick={onGoToAnalytics}
              className="text-xs sm:text-[13px] flex items-center gap-1.5 py-1.5 px-3 rounded-xl border border-[var(--grid)] hover:border-stone-700 text-stone-300 hover:text-white bg-[#1c1917] transition-all cursor-pointer"
            >
              <Activity className="h-4 w-4 text-stone-400" />
              <span>{lang === "en" ? "Analytics & Pipeline →" : "投递大屏 & 管线 →"}</span>
            </button>
          </div>
        </div>

        {/* 3列信息便当盒 (装备 React Bits MagicBento 光效与星芒粒子，卡片加大加宽) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 text-xs">
          {/* 1. 意向岗位与地域 */}
          <MagicCard
            data-bento-col="0"
            className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4.5 sm:p-5.5 min-h-[145px] sm:min-h-[160px] flex flex-col justify-between"
            glowColor="245, 158, 11"
            enableTilt={true}
            enableStars={true}
            clickEffect={true}
            particleCount={8}
          >
            <div>
              <div className="text-[11px] sm:text-xs text-stone-400 font-medium">
                {lang === "en" ? "Target Role & Cities" : "目标岗位与城市"}
              </div>
              <div className="text-base sm:text-lg font-bold text-[var(--ink)] mt-1.5 truncate">
                {label || (lang === "en" ? "Not specified" : "未指定岗位")}
              </div>
            </div>
            <div className="mt-3 text-xs sm:text-[13px] text-stone-300 flex items-center gap-2">
              <span>{lang === "en" ? "Cities: " : "城市: "}<strong className="text-white font-semibold">{cityValues || (lang === "en" ? "Nationwide / Any" : "全国/不限")}</strong></span>
              <span className="text-stone-600">·</span>
              <span>{lang === "en" ? "Edu: " : "学历: "}<strong className="text-white font-semibold">{educationValues || (lang === "en" ? "Any" : "不限")}</strong></span>
            </div>
          </MagicCard>

          {/* 2. 默认投递简历 */}
          <MagicCard
            data-bento-col="1"
            className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4.5 sm:p-5.5 min-h-[145px] sm:min-h-[160px] flex flex-col justify-between"
            glowColor="245, 158, 11"
            enableTilt={true}
            enableStars={true}
            clickEffect={true}
            particleCount={8}
          >
            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-stone-400 font-medium">
                <span>{lang === "en" ? "Bound Resume" : "当前绑定简历"}</span>
                <button
                  type="button"
                  onClick={onGoToResumes}
                  className="text-amber-400 hover:underline hover:text-amber-300 cursor-pointer text-xs sm:text-[13px] font-medium"
                >
                  {lang === "en" ? "Manage Resumes →" : "管理简历库 →"}
                </button>
              </div>
              <div className="flex items-center gap-2.5 mt-2 min-w-0">
                <FileText className="h-5 w-5 text-amber-400 shrink-0" />
                <span className="text-sm sm:text-base font-semibold text-stone-100 truncate" title={defaultResumeName}>
                  {defaultResumeName || "李象泉-后端-AI-Agent开发-2027届.docx"}
                </span>
              </div>
            </div>
            <div className="mt-3 text-xs sm:text-[13px] text-stone-400">
              {lang === "en" ? "Default attachment · Ready" : "默认附件 · 已准备就绪"}
            </div>
          </MagicCard>

          {/* 3. 拟人风控与模式 */}
          <MagicCard
            data-bento-col="2"
            className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4.5 sm:p-5.5 min-h-[145px] sm:min-h-[160px] flex flex-col justify-between"
            glowColor="245, 158, 11"
            enableTilt={true}
            enableStars={true}
            clickEffect={true}
            particleCount={8}
          >
            <div>
              <div className="text-[11px] sm:text-xs text-stone-400 font-medium">
                {lang === "en" ? "Cruise Mode & Safety" : "巡航模式与安全保护"}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs sm:text-[13px] font-bold text-amber-300">
                  {mode === "auto" ? (lang === "en" ? "Auto Apply" : "全自动投递") : mode === "review" ? (lang === "en" ? "Manual Review" : "逐条人工确认") : (lang === "en" ? "Scan Only" : "仅扫描测试")}
                </span>
              </div>
            </div>
            <div className="mt-3 text-xs sm:text-[13px] text-stone-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{lang === "en" ? "Interval: " : "拟人间歇: "}<strong className="text-white font-semibold">{delayMin}~{delayMax}s</strong></span>
              <span className="text-stone-600">·</span>
              <span>{lang === "en" ? "Quota: " : "每日限额: "}<strong className="text-white font-semibold">{dailyLimit}{lang === "en" ? "" : "次"}</strong></span>
            </div>
          </MagicCard>
        </div>

        {/* 巡航运行中动态条 */}
        {running && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-300 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-semibold">
                {lang === "en" ? "Auto cruise running..." : "自动巡航正在运行中..."}
              </span>
              <span className="text-stone-400">
                {lang === "en"
                  ? `Scanned: ${stats.scanned} · Sent: ${stats.sent} · Skipped: ${stats.skipped}`
                  : `已扫描: ${stats.scanned} · 成功投递: ${stats.sent} · 跳过: ${stats.skipped}`}
              </span>
            </div>
            <button
              type="button"
              onClick={onGoToAnalytics}
              className="font-bold underline hover:text-emerald-200 cursor-pointer"
            >
              {lang === "en" ? "Go to live dashboard →" : "进入大屏监控实时状态 →"}
            </button>
          </div>
        )}
      </MagicCard>
    </div>
  );
}
