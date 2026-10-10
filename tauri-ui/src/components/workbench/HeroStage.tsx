import { useState, useEffect, useMemo, useRef, type RefObject } from "react";
import {
  RotateCw,
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  Bot,
  User,
  UserCheck,
  CheckCircle2,
  Paperclip,
  FileText,
  ChevronUp,
} from "lucide-react";
import { ipc, type AgentChatMessage } from "../../lib/ipc";
import { useRunStore } from "../../store";
import { readFileAsBase64 } from "../../lib/resumeUtils";
import LatticeLoader from "../core/LatticeLoader";
import type { RuleForm } from "../../lib/profileForm";
import type { Lang } from "../../lib/i18n";
import { TextEffect } from "../core/text-effect";
import { summarizeAgentProfile } from "../../lib/agentPreview";
import {
  PLACEHOLDERS,
  BACKGROUND_TAGS,
  JOBSEEKER_SITUATION_BATCHES,
} from "../../lib/dashboardHelpers";

interface HeroStageProps {
  heroStageRef: RefObject<HTMLDivElement>;
  heroInnerRef: RefObject<HTMLDivElement>;
  isChattingOrHasHistory: boolean;
  heroChatMessages: AgentChatMessage[];
  heroChatting: boolean;
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
  const [heroInputText, setHeroInputText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [recBatchIndex, setRecBatchIndex] = useState(0);
  const [isRotatingRec, setIsRotatingRec] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogueScrollRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");

  // Codex 式无界画布下沉模式状态
  const [isSunkMode, setIsSunkMode] = useState<boolean>(false);

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

      // 向上滑动滚轮 (deltaY < -15)
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

  async function handleResumeUpload(file?: File | null) {
    if (!file) return;
    setIsUploadingResume(true);
    setUploadStatusText(`正在同步「${file.name}」到资料库...`);
    try {
      const b64 = await readFileAsBase64(file);
      await ipc.saveResumeFile(file.name, b64);
      try {
        await ipc.setDefaultResume(file.name);
      } catch {}

      useRunStore.getState().notify({
        type: "success",
        text: `已同步导入简历资料库并设为生效简历：${file.name}`,
      });

      setUploadStatusText(`正在解析简历「${file.name}」文本内容...`);
      let parsedText = "";
      try {
        const contentRes = await ipc.getResumeContent(file.name);
        parsedText = contentRes.text?.trim() || "";
      } catch {}

      const prompt = parsedText
        ? `【已同步导入简历: ${file.name}】\n提取简历主要信息:\n${parsedText.slice(0, 1200)}\n\n请根据以上简历内容，分析我的技术栈与求职意向，定制匹配的求职画像（目标岗位、城市、必须与偏好技能、排除方向）。`
        : `【已同步导入简历资料: ${file.name}】\n请为我规划专属的求职岗位偏好与技能画像。`;

      setIsSunkMode(true);
      onChatSubmit(prompt);
    } catch (err) {
      useRunStore.getState().notify({
        type: "error",
        text: `简历同步导入失败: ${String(err)}`,
      });
    } finally {
      setIsUploadingResume(false);
      setUploadStatusText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // 占位词轮播定时器
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  // Hero 标题逐行阶梯动效循环状态
  const [heroAnimCycle, setHeroAnimCycle] = useState(0);
  const [heroAnimFading, setHeroAnimFading] = useState(false);

  useEffect(() => {
    const STAY_MS = 10000;
    const ANIM_TOTAL_MS = 5300;
    const FADE_OUT_MS = 450;
    const CYCLE_MS = ANIM_TOTAL_MS + STAY_MS + FADE_OUT_MS;

    const fadeTimer = setTimeout(() => {
      setHeroAnimFading(true);
    }, CYCLE_MS - FADE_OUT_MS);

    const resetTimer = setTimeout(() => {
      setHeroAnimFading(false);
      setHeroAnimCycle((c) => c + 1);
    }, CYCLE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(resetTimer);
    };
  }, [heroAnimCycle]);

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

        {/* 1. 顶部提示文案区（未提问时居中展示；提问后全自动折叠消失，高度归零不占位；滚轮反向滑动时丝滑复原） */}
        <div
          className={`w-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
            isSunkMode
              ? "max-h-0 opacity-0 -translate-y-8 scale-95 pointer-events-none mb-0"
              : "max-h-80 opacity-100 translate-y-0 scale-100 mb-6"
          }`}
        >
          <div
            className={`w-full transition-opacity duration-500 ease-out ${
              heroAnimFading ? "opacity-0" : "opacity-100"
            }`}
          >
            {/* 第 1 行: 主标题 */}
            <h1 className="text-balance text-[2.2rem] font-bold leading-tight tracking-tight text-stone-100 sm:text-[2.9rem] lg:text-[3.25rem] sm:leading-[1.15]">
              <TextEffect
                key={`hero-l1-${heroAnimCycle}`}
                preset="fade-in-blur"
                speedReveal={1.1}
                speedSegment={0.3}
                delay={0}
                as="span"
                className="inline-block"
              >
                {lang === "en"
                  ? "Tell AI your situation, craft your custom profile"
                  : "向 AI 顾问说出你的情况，定制专属求职画像"}
              </TextEffect>
            </h1>

            {/* 第 2 行 & 第 3 行: 副标题 */}
            <div className="mt-4 max-w-3xl mx-auto text-balance text-[14.5px] leading-relaxed text-stone-400 sm:text-[16px] space-y-1">
              <TextEffect
                key={`hero-l2-${heroAnimCycle}`}
                preset="fade-in-blur"
                speedReveal={1.1}
                speedSegment={0.3}
                delay={1.7}
                as="p"
                className="m-0"
              >
                {lang === "en"
                  ? "Tell me your graduation year, skills, target cities or expected salary."
                  : "告诉我你的毕业年份、专业技能、意向城市或期望薪资。"}
              </TextEffect>
              <TextEffect
                key={`hero-l3-${heroAnimCycle}`}
                preset="fade-in-blur"
                speedReveal={1.1}
                speedSegment={0.3}
                delay={3.5}
                as="p"
                className="m-0"
              >
                {lang === "en"
                  ? "AI advisor will chat with you to tailor precision job preferences and settings."
                  : "AI 顾问将与你深度交流，自动生成量身定制的求职偏好与就绪策略。"}
              </TextEffect>
            </div>
          </div>
        </div>

        {/* 2. Codex 风格沉浸式无界对话流（彻底去掉外层厚重卡片与方框，直接在背景画布上呈现，向下大幅延伸） */}
        {isSunkMode && (
          <div className="w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1360px] flex items-center justify-between pb-1.5 px-2 animate-in fade-in duration-500">
            <span className="text-xs text-stone-400 font-medium flex items-center gap-2">
              <Bot className="size-3.5 text-[#ff5722]" />
              <span>AI 专属顾问 · 交流实录</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSunkMode(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-amber-400/40 text-xs text-stone-300 hover:text-white transition-all cursor-pointer shadow-sm backdrop-blur"
                title="回看初始视窗并恢复中心检索"
              >
                <ChevronUp className="size-3 text-amber-400" />
                <span>回看主视窗</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetChat();
                  setIsSunkMode(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-stone-700 text-xs text-stone-400 hover:text-stone-200 transition-all cursor-pointer shadow-sm backdrop-blur"
                title="清空对话记录"
              >
                <RotateCw className="size-3" />
                <span>清空</span>
              </button>
            </div>
          </div>
        )}

        {/* 对话消息区：充满上方宽阔空间，直接在背景画布上流淌，无大黑框束缚 */}
        <div
          ref={dialogueScrollRef}
          className={`w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1360px] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isSunkMode
              ? "flex-1 min-h-[200px] opacity-100 translate-y-0 mb-3 overflow-y-auto px-2 sm:px-4 py-2 space-y-5 [scrollbar-width:thin]"
              : "max-h-0 opacity-0 translate-y-8 overflow-hidden pointer-events-none mb-0"
          }`}
        >
          {/* 消息流 */}
          {heroChatMessages.map((msg, idx) => (
            <div key={idx} className="space-y-2">
              {msg.role === "user" ? (
                /* 用户提问：沉浸式右上对齐气泡 */
                <div className="flex items-start justify-end gap-3 pl-8 sm:pl-20">
                  <div className="rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] border border-white/15 px-4.5 py-2.5 text-[14.5px] sm:text-[15.5px] text-stone-100 leading-relaxed shadow-lg backdrop-blur-md max-w-[85%] whitespace-pre-wrap text-left">
                    {msg.content}
                  </div>
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-[#ff5722] to-[#ff7a50] text-stone-950 font-bold shadow-md shadow-[#ff5722]/30 text-xs">
                    <User className="size-4" />
                  </div>
                </div>
              ) : (
                /* AI 回答：直接在画布背景流淌，如同 Codex / OpenCode 高级排版 */
                <div className="flex items-start gap-3.5 pr-8 sm:pr-20 text-left">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-md shadow-amber-500/10 text-xs mt-0.5">
                    <Bot className="size-4" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="text-[14.5px] sm:text-[15.5px] text-stone-200 leading-relaxed whitespace-pre-wrap selection:bg-[#ff5722]/30">
                      {msg.content}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 实时思考中动效：React Bits LatticeLoader 轨道点阵旋转 + 实时计时器（工作中 X 秒） */}
          {heroChatting && (
            <div className="flex items-start gap-3.5 pr-8 sm:pr-20 pt-1 text-left animate-in fade-in duration-300">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-md shadow-amber-500/10 text-xs mt-0.5">
                <Bot className="size-4 animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-3.5 px-4 py-2.5 rounded-2xl bg-white/[0.05] border border-white/10 shadow-lg backdrop-blur-md">
                  <LatticeLoader
                    status="working"
                    label={lang === "en" ? "Thinking" : "工作中"}
                    doneLabel={lang === "en" ? "Thought in" : "已完成"}
                    errorLabel={lang === "en" ? "Failed after" : "失败于"}
                    pattern="orbit"
                    grid={3}
                    shape="round"
                    color="#f59e0b"
                    doneColor="#22c55e"
                    errorColor="#ef4444"
                    cellSize={6}
                    gap={2.5}
                    fontSize={13.5}
                    step={90}
                    idleOpacity={0.25}
                    glow={true}
                    glowColor="#f59e0b"
                    showTimer={true}
                  />
                  <span className="text-xs text-stone-400 font-medium">
                    {lang === "en" ? "Deep analyzing background & requirements..." : "正在深度思考并提炼专属求职画像..."}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 提炼出的投递画像卡片：直接在画布中优雅展开，轻量通透 */}
          {heroProfileResult && (
            <div className="rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 shadow-2xl ml-0 sm:ml-11.5 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between mb-3.5">
                <LatticeLoader
                  status="done"
                  label={lang === "en" ? "Thinking" : "工作中"}
                  doneLabel={lang === "en" ? "Job Profile Ready in" : "专属求职画像已就绪"}
                  pattern="orbit"
                  grid={3}
                  shape="round"
                  cellSize={5.5}
                  gap={2}
                  fontSize={13}
                  color="#10b981"
                  doneColor="#10b981"
                  glow={true}
                  glowColor="#10b981"
                  showTimer={false}
                />
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-medium">
                  ● {lang === "en" ? "Ready" : "策略就绪"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-[13px] mb-3.5">
                <div className="bg-stone-900/70 p-3 rounded-xl border border-stone-800/80">
                  <span className="text-stone-500 text-[11px] block font-medium">
                    {lang === "en" ? "Target Role:" : "目标岗位:"}
                  </span>
                  <span className="font-semibold text-stone-100 text-sm mt-0.5 block truncate">
                    {heroProfilePreview?.query || currentLabel}
                  </span>
                </div>
                <div className="bg-stone-900/70 p-3 rounded-xl border border-stone-800/80">
                  <span className="text-stone-500 text-[11px] block font-medium">
                    {lang === "en" ? "Target Cities:" : "意向城市:"}
                  </span>
                  <span className="font-semibold text-stone-100 text-sm mt-0.5 block truncate">
                    {heroProfilePreview?.cities || currentCityValues || (lang === "en" ? "Nationwide / Any" : "全国/不限")}
                  </span>
                </div>
                <div className="bg-stone-900/70 p-3 rounded-xl border border-stone-800/80">
                  <span className="text-stone-500 text-[11px] block font-medium">
                    {lang === "en" ? "Preferred Skills:" : "希望包含技能:"}
                  </span>
                  <span className="text-emerald-400 font-medium truncate block text-sm mt-0.5">
                    {heroProfilePreview?.anyKeywords || currentRule.anyKeywords || "-"}
                  </span>
                </div>
                <div className="bg-stone-900/70 p-3 rounded-xl border border-stone-800/80">
                  <span className="text-stone-500 text-[11px] block font-medium">
                    {lang === "en" ? "Excluded Directions:" : "排除方向:"}
                  </span>
                  <span className="text-red-400 font-medium truncate block text-sm mt-0.5">
                    {heroProfilePreview?.excludeKeywords || currentRule.excludeKeywords || "-"}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-800/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs text-stone-300">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-stone-400">
                    {lang === "en" ? "Verify AI extraction and proceed" : "已自动提炼定制画像，可一键前往查看"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onConfirmProfile();
                    scrollToRingStage?.(2);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <UserCheck className="size-3.5" />
                  <span>{lang === "en" ? "Confirm & View Job Profile →" : "确认信息正确，前往求职画像 →"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. AI 检索输入舱（Codex / OpenCode 下沉底座）：紧凑优雅悬停于底部 */}
        <div className="relative w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1360px] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
          {/* 回看状态提示：当未下沉但已有对话记录时，提示可点击快速展开 */}
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
            {/* 隐藏的本地文件输入 */}
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

            {/* 上传同步加载态 */}
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
                rows={isSunkMode ? 1 : 2}
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
                className="block min-h-[3rem] sm:min-h-[3.6rem] w-full resize-none bg-transparent text-base sm:text-[17px] leading-6 sm:leading-7 text-stone-100 outline-none placeholder:text-stone-500"
              />
            </div>

            <div className="flex items-center gap-3 px-5 pb-3 pt-1 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto [scrollbar-width:none] py-0.5">
                {/* 简历一键导入按钮 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingResume || heroChatting}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/20 hover:border-amber-400/60 px-3 py-1 text-xs text-stone-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap"
                  title={
                    lang === "en"
                      ? "Import Resume (PDF/Word/Images) - auto sync to Vault"
                      : "导入简历/证明材料 (PDF/Word/图片) · 自动同步至简历库并提炼画像"
                  }
                >
                  <Paperclip className="size-3.5 text-amber-400" />
                  <span>{lang === "en" ? "Import Resume" : "导入简历同步"}</span>
                </button>

                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5722]/20 to-[#ff2a55]/20 border border-[#ff5722]/40 px-3 py-1 text-xs font-semibold text-[#ff5722] shadow-sm">
                  <Bot className="size-3.5" />
                  {lang === "en" ? "Tell AI" : "告诉顾问"}
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
                <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-400">Enter</kbd> {lang === "en" ? "Send" : "发送"}
              </span>

              <button
                type="submit"
                disabled={heroChatting || !heroInputText.trim()}
                title={lang === "en" ? "Send to AI Advisor" : "发送给 AI 顾问"}
                aria-label={lang === "en" ? "Send to AI Advisor" : "发送给 AI 顾问"}
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

        {/* 4. 求职者个人背景情况案例（支持“换一批情况”，初始显现，下沉时以紧凑微动形式附着） */}
        <div
          className={`flex items-center justify-center gap-2.5 text-xs sm:text-[13px] flex-nowrap overflow-x-auto [scrollbar-width:none] w-full px-2 transition-all duration-500 ${
            isSunkMode ? "mt-2 opacity-80 scale-[0.98]" : "mt-5 opacity-100"
          }`}
        >
          {JOBSEEKER_SITUATION_BATCHES[recBatchIndex].map((item) => (
            <button
              key={item.role}
              type="button"
              onClick={() => {
                setHeroInputText(item.userText);
                handleSend(item.userText);
              }}
              className="group shrink-0 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1917]/80 hover:bg-[#25201d] hover:border-[#ff5722]/50 px-3 py-1.5 text-stone-300 hover:text-white backdrop-blur transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span className="size-1.5 rounded-full bg-[#ff5722] group-hover:scale-125 transition-transform shadow-[0_0_6px_rgba(255,87,34,0.6)]" />
              <span className="font-medium">{item.role}</span>
              <span className="text-[11px] sm:text-xs text-stone-400 group-hover:text-stone-300">· {item.tag}</span>
              <ArrowUpRight className="size-3 text-stone-500 transition-colors group-hover:text-[#ff5722]" />
            </button>
          ))}

          <button
            type="button"
            onClick={handleNextRecBatch}
            className="group shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1c1917]/60 hover:bg-[#25201d] hover:border-white/20 px-3 py-1.5 text-stone-400 hover:text-white transition-all shadow-sm cursor-pointer whitespace-nowrap"
            title={lang === "en" ? "Shuffle Cases" : "换一批求职者情况案例"}
          >
            <RotateCw className={`size-3.5 transition-transform duration-300 ${isRotatingRec ? "rotate-180" : ""}`} />
            <span className="text-xs sm:text-[13px]">{lang === "en" ? "Shuffle Cases" : "换一批情况"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
