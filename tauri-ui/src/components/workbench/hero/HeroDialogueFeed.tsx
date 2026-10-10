import type { RefObject } from "react";
import {
  RotateCw,
  Bot,
  User,
  UserCheck,
  CheckCircle2,
  ChevronUp,
} from "lucide-react";
import LatticeLoader from "../../core/LatticeLoader";
import type { AgentChatMessage } from "../../../lib/ipc";
import type { RuleForm } from "../../../lib/profileForm";
import type { Lang } from "../../../lib/i18n";
import type { AgentPreviewSummary } from "../../../lib/agentPreview";

interface HeroDialogueFeedProps {
  isSunkMode: boolean;
  setIsSunkMode: (val: boolean) => void;
  dialogueScrollRef: RefObject<HTMLDivElement>;
  heroChatMessages: AgentChatMessage[];
  heroChatting: boolean;
  heroProfileResult: Record<string, unknown> | null;
  heroProfilePreview: AgentPreviewSummary | null;
  onResetChat: () => void;
  onConfirmProfile: () => void;
  currentLabel: string;
  currentCityValues: string;
  currentRule: RuleForm;
  lang: Lang;
  scrollToRingStage?: (index: 0 | 1 | 2) => void;
}

export default function HeroDialogueFeed({
  isSunkMode,
  setIsSunkMode,
  dialogueScrollRef,
  heroChatMessages,
  heroChatting,
  heroProfileResult,
  heroProfilePreview,
  onResetChat,
  onConfirmProfile,
  currentLabel,
  currentCityValues,
  currentRule,
  lang,
  scrollToRingStage,
}: HeroDialogueFeedProps) {
  return (
    <>
      {/* 顶部控制栏 */}
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

      {/* 对话消息区 */}
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
              <div className="flex items-start justify-end gap-3 pl-8 sm:pl-20">
                <div className="rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] border border-white/15 px-4.5 py-2.5 text-[14.5px] sm:text-[15.5px] text-stone-100 leading-relaxed shadow-lg backdrop-blur-md max-w-[85%] whitespace-pre-wrap text-left">
                  {msg.content}
                </div>
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-[#ff5722] to-[#ff7a50] text-stone-950 font-bold shadow-md shadow-[#ff5722]/30 text-xs">
                  <User className="size-4" />
                </div>
              </div>
            ) : (
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

        {/* 实时思考中动效：React Bits LatticeLoader */}
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

        {/* 提炼出的投递画像卡片 */}
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
    </>
  );
}
