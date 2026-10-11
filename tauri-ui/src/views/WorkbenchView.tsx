import type { RefObject, PointerEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { AgentChatMessage } from "../lib/ipc";
import type { Lang } from "../lib/i18n";
import type { Mode, RuleForm } from "../lib/profileForm";
import HeroStage from "../components/workbench/HeroStage";
import PlatformHub from "../components/PlatformHub";
import ProfileBentoCard from "../components/workbench/ProfileBentoCard";
import ReviewCard, { Panel } from "../components/ReviewCard";

interface WorkbenchViewProps {
  // 3D 轮盘物理引擎
  heroStageRef: RefObject<HTMLDivElement>;
  heroInnerRef: RefObject<HTMLDivElement>;
  hubRef: RefObject<HTMLDivElement>;
  profileRef: RefObject<HTMLDivElement>;
  ringActiveIndex: 0 | 1 | 2;
  scrollToRingStage: (index: 0 | 1 | 2) => void;
  handleStagePointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  handleStagePointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
  handleStagePointerEnd?: (e?: PointerEvent<HTMLDivElement>) => void;

  // AI 顾问会话
  isChattingOrHasHistory: boolean;
  heroChatMessages: AgentChatMessage[];
  heroChatting: boolean;
  chatStartTime?: number | null;
  chatPhaseText?: string;
  heroProfileResult: Record<string, unknown> | null;
  onChatSubmit: (text: string) => void;
  onResetChat: () => void;
  onConfirmProfile: () => void;

  // 画像与策略配置
  label: string;
  cityValues: string;
  educationValues: string;
  rule: RuleForm;
  defaultResumeName: string;
  mode: Mode;
  delayMin: string;
  delayMax: string;
  dailyLimit: string;
  running: boolean;
  stats: { scanned: number; sent: number; skipped: number };

  // 招聘平台
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;

  // 人工审核
  reviewPending: Record<string, unknown> | null;
  busy: boolean;
  onReviewDecision: (decision: "send" | "skip" | "quit") => void;

  // 导航跳转
  onNavigateTo: (nav: "profile" | "analytics" | "resumes") => void;
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function WorkbenchView({
  heroStageRef,
  heroInnerRef,
  hubRef,
  profileRef,
  ringActiveIndex,
  scrollToRingStage,
  handleStagePointerDown,
  handleStagePointerMove,
  handleStagePointerEnd,

  isChattingOrHasHistory,
  heroChatMessages,
  heroChatting,
  chatStartTime,
  chatPhaseText,
  heroProfileResult,
  onChatSubmit,
  onResetChat,
  onConfirmProfile,

  label,
  cityValues,
  educationValues,
  rule,
  defaultResumeName,
  mode,
  delayMin,
  delayMax,
  dailyLimit,
  running,
  stats,

  selectedPlatform,
  onSelectPlatform,

  reviewPending,
  busy,
  onReviewDecision,

  onNavigateTo,
  lang,
  t,
}: WorkbenchViewProps) {
  return (
    <div className="relative w-full h-[calc(100vh-3rem)] overflow-hidden flex items-center justify-center select-none">
      <div
        className="relative h-full w-full overflow-hidden perspective-stage flex items-center justify-center select-none"
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
      >
        {/* 阶段 1：首屏绝对主角 Hero Section (AI 对话中心) */}
        <HeroStage
          heroStageRef={heroStageRef}
          heroInnerRef={heroInnerRef}
          isChattingOrHasHistory={isChattingOrHasHistory}
          heroChatMessages={heroChatMessages}
          heroChatting={heroChatting}
          chatStartTime={chatStartTime}
          chatPhaseText={chatPhaseText}
          heroProfileResult={heroProfileResult}
          onChatSubmit={onChatSubmit}
          onResetChat={onResetChat}
          onConfirmProfile={onConfirmProfile}
          currentLabel={label}
          currentCityValues={cityValues}
          currentRule={rule}
          lang={lang}
          ringActiveIndex={ringActiveIndex}
          scrollToRingStage={scrollToRingStage}
        />

        {/* 阶段 2：招聘平台中心 (3D 环形柱面展开，基于滚轮在圆弧上下滚动) */}
        <div
          ref={hubRef}
          className="absolute inset-x-0 mx-auto w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] px-3 sm:px-6 lg:px-8 will-change-transform perspective-layer"
          style={{ transformOrigin: "center center", opacity: 0, zIndex: 10, transform: "none" }}
        >
          <PlatformHub
            selectedPlatform={selectedPlatform}
            onSelectPlatform={onSelectPlatform}
            lang={lang}
          />
        </div>

        {/* 人工审核卡片（如果处于 review 暂停中） */}
        {reviewPending && (
          <div className="w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] mx-auto px-3 sm:px-6 lg:px-8">
            <Panel title={t("panel.review")}>
              <ReviewCard
                pending={reviewPending}
                busy={busy}
                onDecision={onReviewDecision}
                t={t}
              />
            </Panel>
          </div>
        )}

        {/* 阶段 3：求职画像总览 (3D 环形万花筒圆弧翻折展开) */}
        <ProfileBentoCard
          profileRef={profileRef}
          isChattingOrHasHistory={false}
          label={label}
          cityValues={cityValues}
          educationValues={educationValues}
          defaultResumeName={defaultResumeName}
          mode={mode}
          delayMin={delayMin}
          delayMax={delayMax}
          dailyLimit={dailyLimit}
          running={running}
          stats={stats}
          onGoToProfile={() => onNavigateTo("profile")}
          onGoToAnalytics={() => onNavigateTo("analytics")}
          onGoToResumes={() => onNavigateTo("resumes")}
          lang={lang}
        />

        {/* 底部 3D 滚动探索指引微动图标 (无缝替代侧边三点，随圆柱站台智能引导) */}
        <div className="absolute bottom-4 inset-x-0 mx-auto w-fit z-40 flex flex-col items-center select-none pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              const nextStage = ringActiveIndex === 2 ? 0 : ((ringActiveIndex + 1) as 0 | 1 | 2);
              scrollToRingStage(nextStage);
            }}
            className="group flex items-center gap-2.5 py-1.5 px-4 rounded-full bg-stone-950/80 hover:bg-stone-900/95 border border-white/10 hover:border-[#ff5722]/50 shadow-xl backdrop-blur-md transition-all duration-300 cursor-pointer outline-none hover:scale-105 active:scale-95"
            title={
              ringActiveIndex === 0
                ? t("wb.hint.stage0")
                : ringActiveIndex === 1
                ? t("wb.hint.stage1")
                : t("wb.hint.stage2")
            }
          >
            {/* 拟物化 3D 滚轮鼠标微动胶囊 */}
            <div className="w-4 h-6.5 rounded-full border border-stone-400/50 group-hover:border-[#ff5722] flex items-start justify-center p-0.5 transition-colors">
              <span className="w-1 h-1.5 rounded-full bg-[#ff5722] animate-scroll-wheel shadow-[0_0_6px_#ff5722]" />
            </div>

            <span className="text-xs font-medium text-stone-300 group-hover:text-white transition-colors flex items-center gap-1">
              {ringActiveIndex === 0 && (
                <>
                  <span>{t("wb.button.stage0")}</span>
                  <ChevronDown className="size-3.5 text-[#ff5722] animate-bounce" />
                </>
              )}
              {ringActiveIndex === 1 && (
                <>
                  <span>{t("wb.button.stage1")}</span>
                  <ChevronDown className="size-3.5 text-[#ff5722] animate-bounce" />
                </>
              )}
              {ringActiveIndex === 2 && (
                <>
                  <span>{t("wb.button.stage2")}</span>
                  <ChevronUp className="size-3.5 text-amber-400 animate-bounce" />
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
