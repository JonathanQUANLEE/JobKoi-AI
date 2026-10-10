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
} from "lucide-react";
import { ipc, type AgentChatMessage } from "../../lib/ipc";
import { useRunStore } from "../../store";
import { readFileAsBase64 } from "../../lib/resumeUtils";
import LatticeLoader from "../core/LatticeLoader";
import type { RuleForm } from "../../lib/profileForm";
import type { Lang } from "../../lib/i18n";
import { TextEffect } from "../core/text-effect";
import { summarizeAgentProfile } from "../../lib/agentPreview";
import { MagicCard } from "../core/MagicBento";
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
}: HeroStageProps) {
  const [heroInputText, setHeroInputText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [recBatchIndex, setRecBatchIndex] = useState(0);
  const [isRotatingRec, setIsRotatingRec] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");

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

  // Hero 标题逐行阶梯动效循环状态 (第1行 -> 第2行 -> 第3行 依序显现并停留 10 秒循环)
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

  const heroProfilePreview = useMemo(() => summarizeAgentProfile(heroProfileResult), [heroProfileResult]);

  return (
    <section
      ref={heroStageRef}
      className={
        !isChattingOrHasHistory
          ? "absolute inset-x-0 mx-auto w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] px-3 sm:px-6 lg:px-8 will-change-transform perspective-layer"
          : "relative isolate overflow-visible w-full flex flex-col items-center justify-center py-6"
      }
      style={
        !isChattingOrHasHistory
          ? { transformOrigin: "center center", opacity: 1, zIndex: 30, transform: "none" }
          : undefined
      }
    >
      <div
        ref={heroInnerRef}
        className="mx-auto w-full flex flex-col items-center text-center perspective-layer relative z-10"
      >
        <div className="dot-pattern absolute inset-0 -z-10 opacity-70 pointer-events-none" aria-hidden="true" />
        <div
          className="fx-glow w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] pointer-events-none transition-all duration-500"
          aria-hidden="true"
        />

        {/* 主标题与副标题 (逐行渐显动效流) */}
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

        {/* Hunt Now 标志性 Beam Composer (宽屏大气光轨 AI 顾问对话舱) */}
        <div className="relative mt-8 w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1360px] transition-all duration-300 ease-in-out">
          <div
            className="absolute -inset-x-8 -inset-y-4 -z-10 rounded-[2.5rem] bg-gradient-to-b from-[#ff5722]/15 via-transparent to-transparent blur-2xl"
            aria-hidden="true"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (heroInputText.trim()) {
                onChatSubmit(heroInputText);
                setHeroInputText("");
              }
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
            {/* 隐藏的本地文件输入，支持 pdf/doc/docx/png/jpg/jpeg */}
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

            {/* 正在上传并同步到简历资料库的 LatticeLoader 加载态 */}
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

            <div className="relative px-6 pt-5 sm:px-8 sm:pt-6">
              <textarea
                rows={2}
                value={heroInputText}
                onChange={(e) => setHeroInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (heroInputText.trim()) {
                      onChatSubmit(heroInputText);
                      setHeroInputText("");
                    }
                  }
                }}
                placeholder={
                  isDragOver
                    ? "松开鼠标即可导入该文件并自动同步至简历资料库..."
                    : PLACEHOLDERS[placeholderIndex]
                }
                className="block min-h-[4.2rem] sm:min-h-[5rem] w-full resize-none bg-transparent text-base sm:text-[18px] leading-7 text-stone-100 outline-none placeholder:text-stone-500"
              />
            </div>

            <div className="flex items-center gap-3 px-5 pb-4 pt-1 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto [scrollbar-width:none] py-1">
                {/* 简历一键导入按钮（支持 PDF、Word、图片） */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingResume || heroChatting}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/20 hover:border-amber-400/60 px-3 py-1.5 text-xs text-stone-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap"
                  title={
                    lang === "en"
                      ? "Import Resume (PDF/Word/Images) - auto sync to Vault"
                      : "导入简历/证明材料 (PDF/Word/图片) · 自动同步至简历库并提炼画像"
                  }
                >
                  <Paperclip className="size-3.5 text-amber-400" />
                  <span>{lang === "en" ? "Import Resume" : "导入简历同步"}</span>
                </button>

                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5722]/20 to-[#ff2a55]/20 border border-[#ff5722]/40 px-3.5 py-1.5 text-xs font-semibold text-[#ff5722] shadow-sm">
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
                    className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] hover:border-white/25 px-3.5 py-1.5 text-xs sm:text-[13px] text-stone-300 hover:text-white transition-all cursor-pointer shadow-sm whitespace-nowrap"
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
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-stone-950 transition-all hover:scale-105 active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
              >
                {heroChatting ? (
                  <RotateCw className="size-4 animate-spin text-stone-900" />
                ) : (
                  <ArrowUp className="size-5" />
                )}
              </button>
            </div>
          </form>
        </div>

        {/* 输入框下方：求职者个人背景情况案例（严格单行排列，带 ↗ 与 “换一批”动画） */}
        <div className="mt-6 flex items-center justify-center gap-3 text-xs sm:text-[13px] flex-nowrap overflow-x-auto [scrollbar-width:none] w-full px-2">
          {JOBSEEKER_SITUATION_BATCHES[recBatchIndex].map((item) => (
            <button
              key={item.role}
              type="button"
              onClick={() => {
                setHeroInputText(item.userText);
                onChatSubmit(item.userText);
              }}
              className="group shrink-0 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1917]/80 hover:bg-[#25201d] hover:border-[#ff5722]/50 px-4 py-2 text-stone-300 hover:text-white backdrop-blur transition-all shadow-sm cursor-pointer whitespace-nowrap"
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
            className="group shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1c1917]/60 hover:bg-[#25201d] hover:border-white/20 px-3.5 py-2 text-stone-400 hover:text-white transition-all shadow-sm cursor-pointer whitespace-nowrap"
            title={lang === "en" ? "Shuffle Cases" : "换一批求职者情况案例"}
          >
            <RotateCw className={`size-3.5 transition-transform duration-300 ${isRotatingRec ? "rotate-180" : ""}`} />
            <span className="text-xs sm:text-[13px]">{lang === "en" ? "Shuffle Cases" : "换一批情况"}</span>
          </button>
        </div>

        {/* 人与 Agent 对话交互展示区（发送对话或点击情况案例后优雅展开） */}
        {(heroChatMessages.length > 0 || heroChatting) && (
          <MagicCard
            className="rise-in mt-6 w-full max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1640px] rounded-2xl border border-[#ff5722]/40 bg-gradient-to-b from-[#1c1917]/95 to-[#12100e]/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl text-left"
            glowColor="255, 87, 34"
            enableTilt={false}
            particleCount={8}
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-800/80 mb-3.5">
              <span className="text-xs sm:text-sm font-bold text-stone-200 flex items-center gap-2">
                <Bot className="size-4 text-[#ff5722]" />
                <span>AI 求职顾问交流实录</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onResetChat}
                  className="text-stone-400 hover:text-stone-200 text-xs sm:text-[13px] flex items-center gap-1 cursor-pointer"
                  title="重新开始对话"
                >
                  <RotateCw className="size-3" />
                  <span>清空重置</span>
                </button>
              </div>
            </div>

            {/* 对话消息气泡流 */}
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto pr-1">
              {heroChatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      msg.role === "user"
                        ? "bg-[#ff5722] text-stone-950"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {msg.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-[13px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#ff5722]/15 border border-[#ff5722]/30 text-stone-100"
                        : "bg-stone-900/90 border border-stone-800 text-stone-200"
                    }`}
                  >
                    <div className="text-[10px] text-stone-400 mb-0.5 font-semibold">
                      {msg.role === "user" ? "你的情况与诉求" : "AI 顾问建议"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}

              {heroChatting && (
                <div className="flex items-center justify-between rounded-2xl bg-stone-900/90 border border-amber-500/30 px-5 py-3 shadow-xl backdrop-blur-md">
                  <LatticeLoader
                    status="working"
                    label={lang === "en" ? "AI Thinking & Analyzing Background" : "AI 深度思考与求职画像规划中"}
                    doneLabel={lang === "en" ? "Profile Crafted in" : "专属求职画像规划完成"}
                    pattern="orbit"
                    grid={3}
                    shape="round"
                    cellSize={6}
                    gap={2.5}
                    fontSize={13}
                    glow={true}
                    glowColor="#f59e0b"
                    color="#f59e0b"
                    doneColor="#10b981"
                    errorColor="#ef4444"
                    showTimer={true}
                  />
                  <span className="text-xs text-stone-400 hidden sm:inline">
                    已关联简历与意向 · 正在提炼字段
                  </span>
                </div>
              )}
            </div>

            {/* 提炼出的投递画像卡片 */}
            {heroProfileResult && (
              <MagicCard
                className="rounded-xl border border-white/10 bg-black/40 p-4 sm:p-5"
                glowColor="245, 158, 11"
                enableTilt={false}
                particleCount={6}
              >
                <div className="flex items-center justify-between mb-3.5">
                  <LatticeLoader
                    status="done"
                    label="AI 顾问规划中"
                    doneLabel={lang === "en" ? "AI Job Profile Generated in" : "AI 专属求职画像已就绪"}
                    pattern="orbit"
                    grid={3}
                    shape="round"
                    cellSize={5}
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
                  <div className="bg-stone-950/80 p-3 rounded-xl border border-stone-800/80">
                    <span className="text-stone-500 text-[11px] block font-medium">
                      {lang === "en" ? "Target Role:" : "目标岗位:"}
                    </span>
                    <span className="font-semibold text-stone-100 text-sm mt-0.5 block">{heroProfilePreview?.query || currentLabel}</span>
                  </div>
                  <div className="bg-stone-950/80 p-3 rounded-xl border border-stone-800/80">
                    <span className="text-stone-500 text-[11px] block font-medium">
                      {lang === "en" ? "Target Cities:" : "意向城市:"}
                    </span>
                    <span className="font-semibold text-stone-100 text-sm mt-0.5 block">{heroProfilePreview?.cities || currentCityValues || (lang === "en" ? "Nationwide / Any" : "全国/不限")}</span>
                  </div>
                  <div className="bg-stone-950/80 p-3 rounded-xl border border-stone-800/80">
                    <span className="text-stone-500 text-[11px] block font-medium">
                      {lang === "en" ? "Preferred Skills:" : "希望包含的技能:"}
                    </span>
                    <span className="text-emerald-400 font-medium truncate block text-sm mt-0.5">{heroProfilePreview?.anyKeywords || currentRule.anyKeywords || "-"}</span>
                  </div>
                  <div className="bg-stone-950/80 p-3 rounded-xl border border-stone-800/80">
                    <span className="text-stone-500 text-[11px] block font-medium">
                      {lang === "en" ? "Excluded Directions:" : "不考虑的方向/排除词:"}
                    </span>
                    <span className="text-red-400 font-medium truncate block text-sm mt-0.5">{heroProfilePreview?.excludeKeywords || currentRule.excludeKeywords || "-"}</span>
                  </div>
                </div>

                {/* 确认提示行与跳转按钮 */}
                <div className="mt-3.5 pt-3 border-t border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-stone-300">
                    <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                    <span>
                      {lang === "en"
                        ? "Please verify the AI-extracted information above. Confirm to proceed to Job Profile for fine-tuning."
                        : "请核对上方 AI 提炼的求职信息是否准确。确认后可前往「求职画像」进行详细配置或手动微调。"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={onConfirmProfile}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/15 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <UserCheck className="size-3.5" />
                      <span>{lang === "en" ? "Confirm & View Job Profile →" : "确认信息正确，前往求职画像 →"}</span>
                    </button>
                  </div>
                </div>
              </MagicCard>
            )}
          </MagicCard>
        )}
      </div>
    </section>
  );
}
