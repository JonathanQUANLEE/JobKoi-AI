import { useState, useRef, useEffect } from "react";
import {
  User,
  ArrowUp,
  Target,
  Terminal,
  Sparkles,
  Check,
  Plus,
} from "lucide-react";
import { ipc, type AgentToolResult } from "../../lib/ipc";
import { summarizeAgentProfile } from "../../lib/agentPreview";
import { useRunStore, useT } from "../../store";
import { MagicCard } from "../core/MagicBento";
import { PROMPT_TAGS } from "./types";

interface CareerCopilotViewProps {
  getCurrentForm: () => Record<string, unknown>;
  onApply: (profileData: Record<string, unknown>) => void;
  onRun: () => void;
}

export default function CareerCopilotView({
  getCurrentForm,
  onApply,
  onRun,
}: CareerCopilotViewProps) {
  const t = useT();
  const running = useRunStore((s) => s.running);
  const agentMessages = useRunStore((s) => s.agentMessages);
  const agentPending = useRunStore((s) => s.agentPending);
  const agentProfilePreview = useRunStore((s) => s.agentProfilePreview);
  const pushAgentMessage = useRunStore((s) => s.pushAgentMessage);
  const setAgentPending = useRunStore((s) => s.setAgentPending);
  const setAgentProfilePreview = useRunStore((s) => s.setAgentProfilePreview);

  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [toolResult, setToolResult] = useState<AgentToolResult | null>(null);
  const [prepareRunReady, setPrepareRunReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [agentMessages, agentPending]);

  async function handleSendText(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || agentPending) return;

    pushAgentMessage({ role: "user", content: trimmed });
    setInput("");
    setAgentPending(true);
    setMessage(null);
    setApplied(false);
    setToolResult(null);
    setPrepareRunReady(false);

    try {
      const history = agentMessages.slice(-10);
      const currentForm = getCurrentForm();
      const result = await ipc.agentChat(trimmed, history, currentForm);
      if (result.status === "ok") {
        pushAgentMessage({ role: "assistant", content: result.reply ?? "" });
        setAgentProfilePreview(result.profile ?? null);
        const action = result.action ?? null;
        if (action?.type === "prepare_run") {
          setPrepareRunReady(true);
        } else if (action) {
          pushAgentMessage({ role: "assistant", content: t("agent.action.executing") });
          try {
            const tool = await ipc.agentExecuteAction(action.type, action.params ?? {});
            if (tool.status === "ok") {
              pushAgentMessage({ role: "assistant", content: tool.text });
              setToolResult(tool);
            } else {
              pushAgentMessage({
                role: "assistant",
                content: `${t("agent.error.prefix")}${tool.message ?? ""}`,
              });
            }
          } catch (toolErr) {
            pushAgentMessage({ role: "assistant", content: `${t("agent.error.prefix")}${String(toolErr)}` });
          }
        }
      } else {
        pushAgentMessage({ role: "assistant", content: `${t("agent.error.prefix")}${result.message ?? ""}` });
      }
    } catch (err) {
      pushAgentMessage({ role: "assistant", content: `${t("agent.error.prefix")}${String(err)}` });
    } finally {
      setAgentPending(false);
    }
  }

  function handleApply() {
    if (!agentProfilePreview) return;
    onApply(agentProfilePreview);
    setApplied(true);
  }

  const preview = summarizeAgentProfile(agentProfilePreview);
  const modeKey = (agentProfilePreview?.send as Record<string, unknown> | undefined)?.mode;
  const modeLabel = typeof modeKey === "string" ? t(`mode.${modeKey}.title`) : "-";

  return (
    <div className="flex-1 flex flex-col w-full min-h-[calc(100vh-230px)] space-y-4">
      {/* 对话区：自适应伸展铺满上半部空间 */}
      <div ref={listRef} className="flex-1 min-h-[420px] overflow-y-auto space-y-4 pr-2 text-xs">
        {agentMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center p-4">
            <div className="size-16 rounded-3xl bg-amber-500/10 p-1 flex items-center justify-center mb-3 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <img src="/favicon.png" alt="AI 投递规划助手" className="size-full rounded-2xl object-cover" />
            </div>
            <p className="text-base font-bold text-stone-100 mb-1">说出你的背景，AI 替你规划投递</p>
            <p className="text-xs text-stone-400 max-w-md leading-relaxed">
              说出你的专业、意向城市与薪资期待，大模型自动提炼最优关键词与排查规则。
            </p>
          </div>
        ) : (
          agentMessages.map((msg, index) => {
            const isUser = msg.role === "user";
            return (
              <div key={index} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && (
                  <div className="size-8 rounded-xl overflow-hidden border border-amber-500/30 shadow-sm shrink-0">
                    <img src="/favicon.png" alt="AI" className="size-full object-cover" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed break-words shadow-sm ${
                    isUser
                      ? "bg-amber-500 text-stone-950 font-medium rounded-tr-sm"
                      : "bg-stone-900 border border-stone-800 text-stone-200 rounded-tl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {isUser && (
                  <div className="size-8 rounded-xl bg-stone-800 border border-stone-700 text-stone-300 flex items-center justify-center text-xs shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {agentPending && (
          <div className="flex gap-2.5 items-center text-stone-400">
            <div className="size-8 rounded-xl overflow-hidden border border-amber-500/30 shadow-sm shrink-0">
              <img src="/favicon.png" alt="AI" className="size-full object-cover" />
            </div>
            <div className="bg-stone-900 border border-stone-800 rounded-2xl px-4 py-2 text-xs flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400 animate-ping" />
              <span>正在分析需求，提炼画像中...</span>
            </div>
          </div>
        )}
      </div>

      {/* 工具调用结果 */}
      {toolResult && (
        <MagicCard className="rounded-2xl border border-stone-700 bg-stone-900 p-4 shadow-sm" glowColor="16, 185, 129" enableTilt={false} particleCount={6}>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-emerald-400">
            <Terminal className="h-3.5 w-3.5" />
            <span>工具调用返回 ({toolResult.type})</span>
          </div>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-black/70 p-3 font-mono text-xs leading-relaxed text-stone-300 border border-stone-800">
            {toolResult.text}
          </pre>
        </MagicCard>
      )}

      {/* 投递准备 */}
      {prepareRunReady && (
        <MagicCard className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-3.5 shadow-sm" glowColor="16, 185, 129" enableTilt={false} particleCount={6}>
          <span className="text-xs text-emerald-300">{t("agent.prepareRun.hint")}</span>
          <button
            className="btn-primary"
            disabled={running}
            onClick={() => {
              setPrepareRunReady(false);
              onRun();
            }}
          >
            {t("agent.prepareRun.button")}
          </button>
        </MagicCard>
      )}

      {/* 画像预览卡 */}
      {preview && (
        <MagicCard className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-stone-900 to-amber-950/20 p-4 shadow-sm" glowColor="245, 158, 11" enableTilt={false} particleCount={8}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-amber-400" />
              <span>提炼出的投递画像</span>
            </span>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/30">
              {modeLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs mb-3.5">
            <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800">
              <span className="text-stone-400 block text-[10px]">搜索岗位:</span>
              <span className="font-semibold text-stone-200">{preview.query || "默认推荐"}</span>
            </div>
            <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800">
              <span className="text-stone-400 block text-[10px]">目标城市:</span>
              <span className="font-semibold text-stone-200">{preview.cities || "不限"}</span>
            </div>
            <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800">
              <span className="text-stone-400 block text-[10px]">匹配关键词:</span>
              <span className="text-emerald-400">{preview.anyKeywords || "-"}</span>
            </div>
            <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800">
              <span className="text-stone-400 block text-[10px]">排除过滤词:</span>
              <span className="text-red-400">{preview.excludeKeywords || "-"}</span>
            </div>
          </div>

          <button
            className="btn-primary w-full text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 cursor-pointer"
            onClick={handleApply}
            disabled={applied}
          >
            {applied ? (
              <>
                <Check className="h-3.5 w-3.5 text-stone-950" />
                <span>{t("agent.applied")}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-stone-950" />
                <span>一键应用此画像至投递表单</span>
              </>
            )}
          </button>
        </MagicCard>
      )}

      {/* 输入框 */}
      <MagicCard className="rounded-2xl border border-stone-700/80 bg-stone-900/90 p-2.5 shadow-sm focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all" glowColor="245, 158, 11" enableTilt={false} particleCount={4}>
        <textarea
          rows={2}
          className="w-full resize-none bg-transparent px-2.5 pt-1 text-sm text-stone-100 outline-none placeholder:text-stone-500 leading-relaxed"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSendText(input);
            }
          }}
          placeholder="说出求职意向（例如：我是电气自动化应届生想在深圳找研发岗位...）"
          disabled={agentPending}
        />

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {PROMPT_TAGS.map((tItem, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendText(tItem.prompt)}
                disabled={agentPending}
                className="shrink-0 flex items-center gap-1 rounded-full border border-stone-800 bg-stone-950/80 px-2.5 py-1 text-[11px] text-stone-400 hover:border-amber-500/40 hover:text-stone-200 transition-all cursor-pointer"
              >
                <Plus className="h-3 w-3 text-stone-500" />
                <span>{tItem.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden text-[10px] text-stone-500 lg:inline">
              <kbd className="font-mono bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">Enter</kbd> 发送
            </span>
            <button
              onClick={() => handleSendText(input)}
              disabled={agentPending || !input.trim()}
              className="grid size-8 place-items-center rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-40 font-bold cursor-pointer"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </MagicCard>

      {message && <p className="text-xs text-amber-400 mt-2">{message}</p>}
    </div>
  );
}
