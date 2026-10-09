import type { RefObject, PointerEvent } from "react";
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
  dryRun: boolean;
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
  dryRun,
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
    <div
      className={
        !isChattingOrHasHistory
          ? "relative w-full h-[calc(100vh-3rem)] overflow-hidden flex items-center justify-center select-none"
          : "space-y-8 mx-auto w-full max-w-5xl px-2 sm:px-6 py-6 transition-all"
      }
    >
      <div
        className={
          !isChattingOrHasHistory
            ? "relative h-full w-full overflow-hidden perspective-stage flex items-center justify-center select-none"
            : "space-y-8 w-full"
        }
        onPointerDown={!isChattingOrHasHistory ? handleStagePointerDown : undefined}
        onPointerMove={!isChattingOrHasHistory ? handleStagePointerMove : undefined}
        onPointerUp={!isChattingOrHasHistory ? handleStagePointerEnd : undefined}
        onPointerCancel={!isChattingOrHasHistory ? handleStagePointerEnd : undefined}
      >
        {/* 阶段 1：首屏绝对主角 Hero Section (AI 对话中心) */}
        <HeroStage
          heroStageRef={heroStageRef}
          heroInnerRef={heroInnerRef}
          isChattingOrHasHistory={isChattingOrHasHistory}
          heroChatMessages={heroChatMessages}
          heroChatting={heroChatting}
          heroProfileResult={heroProfileResult}
          onChatSubmit={onChatSubmit}
          onResetChat={onResetChat}
          onConfirmProfile={onConfirmProfile}
          currentLabel={label}
          currentCityValues={cityValues}
          currentRule={rule}
          lang={lang}
        />

        {/* 阶段 2：招聘平台中心 (3D 环形柱面展开，基于滚轮在圆弧上下滚动) */}
        <div
          ref={hubRef}
          className={
            !isChattingOrHasHistory
              ? "absolute inset-x-0 mx-auto w-full max-w-5xl px-2 sm:px-6 will-change-transform perspective-layer"
              : "relative isolate overflow-visible w-full"
          }
          style={
            !isChattingOrHasHistory
              ? { transformOrigin: "center center", opacity: 0, zIndex: 10, transform: "none" }
              : undefined
          }
        >
          <PlatformHub
            selectedPlatform={selectedPlatform}
            onSelectPlatform={onSelectPlatform}
            lang={lang}
          />
        </div>

        {/* 人工审核卡片（如果处于 review 暂停中） */}
        {reviewPending && (
          <div className="w-full max-w-5xl mx-auto px-2 sm:px-6">
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
          isChattingOrHasHistory={isChattingOrHasHistory}
          label={label}
          cityValues={cityValues}
          educationValues={educationValues}
          defaultResumeName={defaultResumeName}
          mode={mode}
          dryRun={dryRun}
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

        {/* 右侧 3D 环形万花筒位置指示点（纯净三点设计，无方框） */}
        {!isChattingOrHasHistory && (
          <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-3.5 select-none">
            <button
              type="button"
              onClick={() => scrollToRingStage(0)}
              className="p-1.5 cursor-pointer transition-all outline-none group"
              title={lang === "en" ? "AI Advisor" : "AI 顾问"}
              aria-label={lang === "en" ? "AI Advisor" : "AI 顾问"}
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  ringActiveIndex === 0
                    ? "size-2.5 bg-[#ff5722] shadow-[0_0_10px_rgba(255,87,34,0.9)] scale-125"
                    : "size-2 bg-stone-600 group-hover:bg-stone-400 group-hover:scale-125"
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => scrollToRingStage(1)}
              className="p-1.5 cursor-pointer transition-all outline-none group"
              title={lang === "en" ? "Platforms Hub" : "招聘平台"}
              aria-label={lang === "en" ? "Platforms Hub" : "招聘平台"}
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  ringActiveIndex === 1
                    ? "size-2.5 bg-[#ff5722] shadow-[0_0_10px_rgba(255,87,34,0.9)] scale-125"
                    : "size-2 bg-stone-600 group-hover:bg-stone-400 group-hover:scale-125"
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => scrollToRingStage(2)}
              className="p-1.5 cursor-pointer transition-all outline-none group"
              title={lang === "en" ? "Job Profile" : "求职画像"}
              aria-label={lang === "en" ? "Job Profile" : "求职画像"}
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  ringActiveIndex === 2
                    ? "size-2.5 bg-[#ff5722] shadow-[0_0_10px_rgba(255,87,34,0.9)] scale-125"
                    : "size-2 bg-stone-600 group-hover:bg-stone-400 group-hover:scale-125"
                }`}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
