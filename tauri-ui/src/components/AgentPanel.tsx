import { useEffect, useRef, useState } from "react";
import {
  Bot,
  User,
  SlidersHorizontal,
  ArrowUp,
  Target,
  Terminal,
  Sparkles,
  Check,
  Plus,
  AlertCircle,
} from "lucide-react";
import { ipc, type AgentToolResult } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { useRunStore, useT } from "../store";

/**
 * 智能助手面板（借鉴 Hunt Now 搜索交互与 Beam Composer 设计）。
 */
type Props = {
  getCurrentForm: () => Record<string, unknown>;
  onApply: (profileData: Record<string, unknown>) => void;
  onRun: () => void;
  onOpenSettings?: (tab?: "rules" | "policy" | "greeting" | "basic" | "model") => void;
};

const PROMPT_TAGS = [
  { label: "计算机应届·深圳实习", prompt: "我是计算机应届生，帮我找深圳的 AI Agent 实习岗位" },
  { label: "电气自动化·研发岗", prompt: "电气自动化专业，找深圳/广州的智能硬件或制造业研发岗" },
  { label: "文科/社科·不限经验", prompt: "文科专业，找新媒体运营或管培生岗位，要求双休不加班" },
  { label: "查今日投递统计", prompt: "帮我查询今天各个平台的投递统计数据" },
  { label: "预览岗位匹配", prompt: "预览一下当前列表前 5 个岗位的匹配情况" },
];

export default function AgentPanel({ getCurrentForm, onApply, onRun, onOpenSettings }: Props) {
  const t = useT();
  const running = useRunStore((s) => s.running);
  const agentMessages = useRunStore((s) => s.agentMessages);
  const agentPending = useRunStore((s) => s.agentPending);
  const agentProfilePreview = useRunStore((s) => s.agentProfilePreview);
  const llmConfig = useRunStore((s) => s.llmConfig);
  const pushAgentMessage = useRunStore((s) => s.pushAgentMessage);
  const setAgentPending = useRunStore((s) => s.setAgentPending);
  const setAgentProfilePreview = useRunStore((s) => s.setAgentProfilePreview);
  const setLLMConfig = useRunStore((s) => s.setLLMConfig);

  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [toolResult, setToolResult] = useState<AgentToolResult | null>(null);
  const [prepareRunReady, setPrepareRunReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (llmConfig) return;
    ipc
      .getLLMConfig()
      .then((config) => {
        setLLMConfig(config);
      })
      .catch(() => {});
  }, [llmConfig, setLLMConfig]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [agentMessages.length, agentPending]);

  async function handleSendText(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || agentPending) return;

    if (!llmConfig?.configured) {
      if (onOpenSettings) {
        onOpenSettings("model");
      }
      setMessage(t("agent.settings.needConfig"));
      return;
    }

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
          pushAgentMessage({
            role: "assistant",
            content: t("agent.action.executing"),
          });
          try {
            const tool = await ipc.agentExecuteAction(
              action.type,
              action.params ?? {},
            );
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
            pushAgentMessage({
              role: "assistant",
              content: `${t("agent.error.prefix")}${String(toolErr)}`,
            });
          }
        }
      } else {
        pushAgentMessage({
          role: "assistant",
          content: `${t("agent.error.prefix")}${result.message ?? ""}`,
        });
      }
    } catch (err) {
      pushAgentMessage({
        role: "assistant",
        content: `${t("agent.error.prefix")}${String(err)}`,
      });
    } finally {
      setAgentPending(false);
    }
  }

  function apply() {
    if (!agentProfilePreview) return;
    onApply(agentProfilePreview);
    setApplied(true);
  }

  const preview = summarizeAgentProfile(agentProfilePreview);
  const modeKey = (agentProfilePreview?.send as Record<string, unknown> | undefined)?.mode;
  const modeLabel = typeof modeKey === "string" ? t(`mode.${modeKey}.title`) : "-";

  return (
    <section className="panel">
      {/* 头部：专业 SaaS 极简风格 */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-sm">
            <Bot className="h-4.5 w-4.5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
              <span>AI 求职管家 · Copilot</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                llmConfig?.configured
                  ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-400"
                  : "bg-stone-800 border-stone-700 text-stone-400"
              }`}>
                {llmConfig?.configured ? "模型已就绪" : "待配置模型"}
              </span>
            </h3>
            <p className="text-[11px] text-stone-400">
              对话提炼求职意向 · 自动生成过滤与投递画像
            </p>
          </div>
        </div>

        {/* 顶部模型配置快捷按钮 (直达 SettingsDrawer -> model) */}
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-800 bg-stone-900/60 hover:border-amber-500/40 text-xs text-stone-400 hover:text-stone-200 transition-all select-none"
          onClick={() => onOpenSettings?.("model")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-stone-400" />
          <span>模型配置</span>
        </button>
      </div>

      {/* 若未配置大模型，展示轻量温和提醒卡片 */}
      {!llmConfig?.configured && (
        <div className="mb-3.5 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>尚未配置大模型 API Key，配置后即可解锁自然语言生成投递画像功能</span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline underline-offset-2 hover:text-amber-200 ml-3 shrink-0"
            onClick={() => onOpenSettings?.("model")}
          >
            前往设置
          </button>
        </div>
      )}

      {/* 对话区 */}
      <div
        ref={listRef}
        className="h-60 overflow-y-auto space-y-3.5 pr-1.5 mb-3.5 text-xs"
      >
        {agentMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="size-11 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-2.5 border border-amber-500/20">
              <Bot className="h-5 w-5 text-amber-400" />
            </div>
            <p className="text-sm font-bold text-stone-100 mb-1">
              说出你的背景，AI 替你规划投递
            </p>
            <p className="text-xs text-stone-400 max-w-sm leading-relaxed">
              任何专业都可以：说出专业、意向城市、薪资期待，大模型自动提炼最优关键词与排查规则。
            </p>
          </div>
        ) : (
          agentMessages.map((msg, index) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={index}
                className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="size-7 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
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
                  <div className="size-7 rounded-xl bg-stone-800 border border-stone-700 text-stone-300 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {agentPending && (
          <div className="flex gap-2.5 items-center text-stone-400">
            <div className="size-7 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="bg-stone-900 border border-stone-800 rounded-2xl px-4 py-2 text-xs flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400 animate-ping" />
              <span>正在分析需求，提炼画像中...</span>
            </div>
          </div>
        )}
      </div>

      {/* 工具调用结果卡片 */}
      {toolResult && (
        <div className="mb-3.5 rounded-2xl border border-stone-700 bg-stone-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-emerald-400">
            <Terminal className="h-3.5 w-3.5" />
            <span>工具调用返回 ({toolResult.type})</span>
          </div>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-black/70 p-3 font-mono text-xs leading-relaxed text-stone-300 border border-stone-800">
            {toolResult.text}
          </pre>
        </div>
      )}

      {/* 一键投递确认按钮 */}
      {prepareRunReady && (
        <div className="mb-3.5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-3.5 shadow-sm">
          <span className="text-xs text-emerald-300">
            {t("agent.prepareRun.hint")}
          </span>
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
        </div>
      )}

      {/* 结构化画像预览卡片 */}
      {preview && (
        <div className="mb-3.5 rounded-2xl border border-amber-500/40 bg-gradient-to-b from-stone-900 to-amber-950/20 p-4 shadow-sm">
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
            className="btn-primary w-full text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5"
            onClick={apply}
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
        </div>
      )}

      {/* 借鉴 Hunt Now "Beam Composer" 设计的输入框组件 */}
      <div className="rounded-2xl border border-stone-700/80 bg-stone-900/90 p-2.5 shadow-sm focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all">
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
          placeholder="像聊天一样说出求职需求（例如：我是电气专业想在深圳找硬件研发...）"
          disabled={agentPending}
        />

        {/* 底部功能栏：标签推荐 + 快捷键 + 发送按钮 */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {PROMPT_TAGS.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendText(t.prompt)}
                disabled={agentPending}
                className="shrink-0 flex items-center gap-1 rounded-full border border-stone-800 bg-stone-950/80 px-2.5 py-1 text-[11px] text-stone-400 hover:border-amber-500/40 hover:text-stone-200 transition-all select-none"
              >
                <Plus className="h-3 w-3 text-stone-500" />
                <span>{t.label}</span>
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
              className="grid size-8 place-items-center rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-bold"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {message && <p className="text-xs text-amber-400 mt-2">{message}</p>}
    </section>
  );
}
