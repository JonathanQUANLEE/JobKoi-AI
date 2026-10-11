import { useState, useEffect, useMemo, useRef, type RefObject } from "react";
import {
  RotateCw,
  ArrowUp,
  Bot,
  Paperclip,
} from "lucide-react";
import type { AgentChatMessage } from "../../lib/ipc";
import { useResumeUpload } from "../../hooks/useResumeUpload";
import LatticeLoader from "../core/LatticeLoader";
import type { RuleForm } from "../../lib/profileForm";
import { translate, type Lang } from "../../lib/i18n";
import { summarizeAgentProfile } from "../../lib/agentPreview";
import {
  PLACEHOLDERS,
  BACKGROUND_TAGS,
  JOBSEEKER_SITUATION_BATCHES,
} from "../../lib/dashboardHelpers";
import HeroTitleSection from "./hero/HeroTitleSection";
import HeroDialogueFeed from "./hero/HeroDialogueFeed";
import HeroSituationPills from "./hero/HeroSituationPills";

interface HeroStageProps {
  heroStageRef: RefObject<HTMLDivElement>;
  heroInnerRef: RefObject<HTMLDivElement>;
  isChattingOrHasHistory: boolean;
  heroChatMessages: AgentChatMessage[];
  heroChatting: boolean;
  chatStartTime?: number | null;
  chatPhaseText?: string;
  heroProfileResult: Record<string, unknown> | null;
  onChatSubmit: (text: string) => void;
  onResetChat: () => void;
  onConfirmProfile: () => void;
  currentLabel: string;
  currentCityValues: string;
  currentRule: RuleForm;
  lang: Lang;
  ringActiveIndex?: 0 | 1 | 2;
  scrollToRingStage?: (index: 0 | 1 | 2) => void;
}

export default function HeroStage({
  heroStageRef,
  heroInnerRef,
  isChattingOrHasHistory,
  heroChatMessages,
  heroChatting,
  chatStartTime,
  chatPhaseText,
  heroProfileResult,
  onChatSubmit,
  onResetChat,
  onConfirmProfile,
  currentLabel,
  currentCityValues,
  currentRule,
  lang,
  ringActiveIndex,
  scrollToRingStage,
}: HeroStageProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [heroInputText, setHeroInputText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [recBatchIndex, setRecBatchIndex] = useState(0);
  const [isRotatingRec, setIsRotatingRec] = useState(false);
  const dialogueScrollRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Codex 式无界画布下沉模式状态
  const [isSunkMode, setIsSunkMode] = useState<boolean>(false);

  // 简历上传业务链路（文件 ref + 上传状态条 + 保存/解析 IPC + 拼画像 prompt）
  // 已下沉到 hooks/useResumeUpload；上传成功 → 进入沉浸模式并把 prompt 交给 AI 对话入口
  const {
    fileInputRef,
    isUploadingResume,
    uploadStatusText,
    handleResumeUpload,
  } = useResumeUpload((prompt: string) => {
    setIsSunkMode(true);
    onChatSubmit(prompt);
  });

  // 当外部开始 AI 思考时，自动触发下沉
  useEffect(() => {
    if (heroChatting) {
      setIsSunkMode(true);
    }
  }, [heroChatting]);

  // 当离开 Stage 0 站台时，自动复原为中心视窗（下次返回时是居中状态）
  useEffect(() => {
    if (ringActiveIndex !== undefined && ringActiveIndex !== 0 && isSunkMode) {
      setIsSunkMode(false);
    }
  }, [ringActiveIndex, isSunkMode]);

  // 滚轮反向滑动（向上滑动滚轮）复原监听
  useEffect(() => {
    const innerEl = heroInnerRef.current;
    if (!innerEl) return;

    const onWheel = (e: WheelEvent) => {
      if (!isSunkMode) return;
      if (e.deltaY < -15) {
        const chatEl = dialogueScrollRef.current;
        const isAtTop = !chatEl || chatEl.scrollTop <= 2;
        if (isAtTop) {
          setIsSunkMode(false);
        }
      }
    };

    innerEl.addEventListener("wheel", onWheel, { passive: true });
    return () => innerEl.removeEventListener("wheel", onWheel);
  }, [isSunkMode, heroInnerRef]);

  // 对话流更新时自动平滑滚动到底部
  useEffect(() => {
    if (isSunkMode && dialogueScrollRef.current) {
      dialogueScrollRef.current.scrollTo({
        top: dialogueScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [isSunkMode, heroChatMessages.length, heroChatting, heroProfileResult]);

  // 占位词轮播定时器
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  function handleNextRecBatch() {
    setIsRotatingRec(true);
    setTimeout(() => {
      setRecBatchIndex((prev) => (prev + 1) % JOBSEEKER_SITUATION_BATCHES.length);
      setIsRotatingRec(false);
    }, 200);
  }

  function handleSend(text: string) {
    if (!text.trim()) return;
    setIsSunkMode(true);
    onChatSubmit(text);
    setHeroInputText("");
  }

  const heroProfilePreview = useMemo(() => summarizeAgentProfile(heroProfileResult), [heroProfileResult]);

  return (
    <section
      ref={heroStageRef}
      className="absolute inset-x-0 mx-auto w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] px-3 sm:px-6 lg:px-8 will-change-transform perspective-layer pointer-events-auto"
      style={{ transformOrigin: "center center", opacity: 1, zIndex: 30, transform: "none" }}
    >
      <div
        ref={heroInnerRef}
        className="mx-auto w-full h-[calc(100vh-6rem)] max-h-[880px] flex flex-col justify-center items-center text-center perspective-layer relative z-10 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="dot-pattern absolute inset-0 -z-10 opacity-70 pointer-events-none" aria-hidden="true" />
        <div
          className="fx-glow w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] pointer-events-none transition-all duration-500"
          aria-hidden="true"
        />

        {/* 1. 顶部提示文案区（未提问时居中展示；提问后全自动折叠消失；滚轮反向滑动时丝滑复原） */}
        <HeroTitleSection isSunkMode={isSunkMode} lang={lang} />

        {/* 2. Codex 风格沉浸式无界对话流 */}
        <HeroDialogueFeed
          isSunkMode={isSunkMode}
          setIsSunkMode={setIsSunkMode}
          dialogueScrollRef={dialogueScrollRef}
          heroChatMessages={heroChatMessages}
          heroChatting={heroChatting}
          chatStartTime={chatStartTime}
          chatPhaseText={chatPhaseText}
          heroProfileResult={heroProfileResult}
          heroProfilePreview={heroProfilePreview}
          onResetChat={onResetChat}
          onConfirmProfile={onConfirmProfile}
          currentLabel={currentLabel}
          currentCityValues={currentCityValues}
          currentRule={currentRule}
          lang={lang}
          scrollToRingStage={scrollToRingStage}
        />

        {/* 3. AI 检索输入舱（Codex / OpenCode 下沉底座）：紧凑优雅悬停于底部 */}
        <div className="relative w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1360px] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
          {!isSunkMode && heroChatMessages.length > 0 && (
            <div className="mb-2 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setIsSunkMode(true)}
                className="group flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900/90 border border-stone-800 hover:border-[#ff5722]/50 text-xs text-stone-400 hover:text-stone-200 transition-all cursor-pointer shadow-md"
              >
                <Bot className="size-3 text-[#ff5722]" />
                <span>展开已有的 {heroChatMessages.length} 条对话实录</span>
              </button>
            </div>
          )}

          <div
            className="absolute -inset-x-8 -inset-y-4 -z-10 rounded-[2.5rem] bg-gradient-to-b from-[#ff5722]/15 via-transparent to-transparent blur-2xl"
            aria-hidden="true"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(heroInputText);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) {
                handleResumeUpload(dropped);
              }
            }}
            className={`beam w-full rounded-[1.75rem] border bg-[#181614]/95 text-left shadow-2xl backdrop-blur-xl transition-all ${
              isDragOver
                ? "border-amber-400 bg-amber-500/10 ring-4 ring-amber-500/20"
                : "border-white/10 focus-within:border-[#ff5722]/60 focus-within:ring-2 focus-within:ring-[#ff5722]/20"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleResumeUpload(f);
              }}
            />

            {isUploadingResume && (
              <div className="flex items-center justify-between px-6 pt-4 pb-1 border-b border-amber-500/20">
                <LatticeLoader
                  status="working"
                  label={uploadStatusText || "简历资料同步与解析中..."}
                  doneLabel="简历同步完成"
                  cellSize={5}
                  gap={2}
                  fontSize={12}
                  glow={true}
                  glowColor="#f59e0b"
                  color="#f59e0b"
                  showTimer={true}
                />
                <span className="text-[11px] text-amber-400/90 font-medium">
                  ★ 已自动存储至本地「简历资料库」
                </span>
              </div>
            )}

            <div className="relative px-6 pt-3.5 sm:px-8 sm:pt-4.5">
              <textarea
                rows={isSunkMode ? 1 : 3}
                value={heroInputText}
                onChange={(e) => setHeroInputText(e.target.value)}
                onFocus={() => {
                  if (heroChatMessages.length > 0 && !isSunkMode) {
                    setIsSunkMode(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend(heroInputText);
                  }
                }}
                placeholder={
                  isDragOver
                    ? "松开鼠标即可导入该文件并自动同步至简历资料库..."
                    : isSunkMode
                    ? "继续输入向 AI 顾问补充更多要求、技能或修改画像..."
                    : PLACEHOLDERS[placeholderIndex]
                }
                className="block min-h-[5rem] sm:min-h-[6rem] w-full resize-none bg-transparent text-base sm:text-[17px] leading-6 sm:leading-7 text-stone-100 outline-none placeholder:text-stone-500"
              />
            </div>

            <div className="flex items-center gap-3 px-5 pb-3 pt-1 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto [scrollbar-width:none] py-0.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingResume || heroChatting}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/20 hover:border-amber-400/60 px-3 py-1 text-xs text-stone-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap"
                  title={t("hero.importResumeTitle")}
                >
                  <Paperclip className="size-3.5 text-amber-400" />
                  <span>{t("hero.importResume")}</span>
                </button>

                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5722]/20 to-[#ff2a55]/20 border border-[#ff5722]/40 px-3 py-1 text-xs font-semibold text-[#ff5722] shadow-sm">
                  <Bot className="size-3.5" />
                  {t("hero.tellAI")}
                </span>

                {BACKGROUND_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setHeroInputText((prev) => (prev ? `${prev}，${tag}` : tag));
                    }}
                    className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] hover:border-white/25 px-3 py-1 text-xs sm:text-[13px] text-stone-300 hover:text-white transition-all cursor-pointer shadow-sm whitespace-nowrap"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <span className="hidden shrink-0 items-center gap-1 text-xs text-stone-500 xl:inline-flex">
                <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-400">Enter</kbd> {t("hero.send")}
              </span>

              <button
                type="submit"
                disabled={heroChatting || !heroInputText.trim()}
                title={t("hero.sendTitle")}
                aria-label={t("hero.sendTitle")}
                className="grid size-9.5 shrink-0 place-items-center rounded-full bg-white text-stone-950 transition-all hover:scale-105 active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
              >
                {heroChatting ? (
                  <RotateCw className="size-4 animate-spin text-stone-900" />
                ) : (
                  <ArrowUp className="size-4.5" />
                )}
              </button>
            </div>
          </form>
        </div>

        {/* 4. 求职者个人背景情况案例 */}
        <HeroSituationPills
          isSunkMode={isSunkMode}
          recBatchIndex={recBatchIndex}
          isRotatingRec={isRotatingRec}
          onSelectSituation={(txt) => {
            setHeroInputText(txt);
            handleSend(txt);
          }}
          onNextBatch={handleNextRecBatch}
          lang={lang}
        />
      </div>
    </section>
  );
}
