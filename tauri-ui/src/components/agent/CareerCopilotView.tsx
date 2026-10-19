import { useState, useRef, useEffect } from "react";
import {
  User,
  ArrowUp,
  Target,
  Terminal,
  Sparkles,
  Check,
  Copy,
  Bot,
  UploadCloud,
  FileText,
  RotateCcw,
  Palette,
  Sun,
  Zap,
  Shield,
  Settings,
  BarChart2,
  Activity,
  LayoutDashboard,
  HelpCircle,
  FileCode2,
} from "lucide-react";
import { ipc, type AgentAction, type AgentToolResult } from "../../lib/ipc";
import { summarizeAgentProfile } from "../../lib/agentPreview";
import { readFileAsBase64 } from "../../lib/resumeUtils";
import { useRunStore, useT } from "../../store";
import { MagicCard } from "../core/MagicBento";
import { PROMPT_TAGS, type PromptTag } from "./types";

interface CareerCopilotViewProps {
  getCurrentForm: () => Record<string, unknown>;
  onApply: (profileData: Record<string, unknown>) => void;
  onRun: () => void;
  onOpenSettings?: (tab?: "rules" | "policy" | "greeting" | "basic" | "model") => void;
  onExecuteAction?: (action: AgentAction) => Promise<void> | void;
}

export default function CareerCopilotView({
  getCurrentForm,
  onApply,
  onRun,
  onOpenSettings,
  onExecuteAction,
}: CareerCopilotViewProps) {
  const t = useT();
  const running = useRunStore((s) => s.running);
  const agentMessages = useRunStore((s) => s.agentMessages);
  const agentPending = useRunStore((s) => s.agentPending);
  const agentProfilePreview = useRunStore((s) => s.agentProfilePreview);
  const pushAgentMessage = useRunStore((s) => s.pushAgentMessage);
  const clearAgentMessages = useRunStore((s) => s.clearAgentMessages);
  const setAgentPending = useRunStore((s) => s.setAgentPending);
  const setAgentProfilePreview = useRunStore((s) => s.setAgentProfilePreview);

  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [toolResult, setToolResult] = useState<AgentToolResult | null>(null);
  const [prepareRunReady, setPrepareRunReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 简历感知与对话上下文绑定
  const [activeResumeName, setActiveResumeName] = useState<string | null>(null);
  const [activeResumeText, setActiveResumeText] = useState<string>("");
  const [loadingResume, setLoadingResume] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  // 初始化：自动探测本地简历资料库中的默认简历
  useEffect(() => {
    ipc
      .listResumes()
      .then(async (res) => {
        const list = res.resumes || [];
        if (list.length > 0) {
          const def = list.find((r) => r.is_default) || list[0];
          setActiveResumeName(def.name);
          try {
            const content = await ipc.getResumeContent(def.name);
            if (content.text) setActiveResumeText(content.text);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);

  const handleCopyText = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.warn("Failed to copy:", err);
    }
  };

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [agentMessages, agentPending, queuedMessage]);

  // 排队消息自动消费（当智能管家完成前一轮回答后自动发出）
  useEffect(() => {
    if (!agentPending && queuedMessage) {
      const next = queuedMessage;
      setQueuedMessage(null);
      void handleSendText(next);
    }
  }, [agentPending, queuedMessage]);

  // 直接在管家内上传新简历附件
  async function handleDirectUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingResume(true);
    try {
      const b64 = await readFileAsBase64(file);
      await ipc.saveResumeFile(file.name, b64);
      setActiveResumeName(file.name);
      let text = "";
      try {
        const content = await ipc.getResumeContent(file.name);
        text = content.text?.trim() || "";
        setActiveResumeText(text);
      } catch {}
      pushAgentMessage({
        role: "assistant",
        content: `已成功关联简历《${file.name}》！我已经读完你的简历，你可以随时问我：“帮我分析简历亮点”、“我适合投哪些岗位”或“帮我润色经历”。`,
      });
    } catch (err) {
      pushAgentMessage({
        role: "assistant",
        content: `上传简历失败：${String(err)}`,
      });
    } finally {
      setLoadingResume(false);
      if (uploadFileRef.current) uploadFileRef.current.value = "";
    }
  }

  async function handleSendText(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    if (agentPending) {
      setQueuedMessage(trimmed);
      setInput("");
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
      const history = agentMessages
        .filter((m) => !m.content.startsWith("出错了：") && !m.content.startsWith("出错了:"))
        .slice(-10);
      const currentForm = {
        ...getCurrentForm(),
        ...(activeResumeName
          ? {
              resume_name: activeResumeName,
              resume_text: activeResumeText ? activeResumeText.slice(0, 1500) : "",
            }
          : {}),
      };
      const result = await ipc.agentChat(trimmed, history, currentForm);
      if (result.status === "ok") {
        pushAgentMessage({ role: "assistant", content: result.reply ?? "" });
        setAgentProfilePreview(result.profile ?? null);
        const action = result.action ?? null;
        if (action?.type === "prepare_run") {
          setPrepareRunReady(true);
        } else if (action) {
          if (
            action.type === "switch_theme" ||
            action.type === "open_settings" ||
            action.type === "navigate" ||
            action.type === "switch_lang"
          ) {
            if (onExecuteAction) {
              await onExecuteAction(action);
            }
          } else {
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
    /* 工业级弹性布局（Codex / OpenCode 式视口约束）：
     * 全链路保持 h-full flex-1 min-h-0 overflow-hidden；
     * 顶部感知栏与底部输入坞严格 shrink-0 锁死高度；
     * 中间消息列表 flex-1 min-h-0 独立内滚，彻底杜绝输入框被下移顶飞。 */
    <div className="flex-1 min-h-0 h-full w-full flex flex-col justify-between overflow-hidden gap-2.5">
      {/* 顶部：当前关联简历感知栏 */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-stone-800 bg-stone-900/60 backdrop-blur text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`size-2 rounded-full shrink-0 ${
              activeResumeName ? "bg-emerald-400 animate-pulse" : "bg-stone-600"
            }`}
          />
          <span className="text-stone-400 shrink-0">当前关联简历:</span>
          {activeResumeName ? (
            <span
              className="text-amber-300 font-semibold truncate max-w-[220px]"
              title={activeResumeName}
            >
              {activeResumeName}
            </span>
          ) : (
            <span className="text-stone-500">未关联（可上传简历让管家为你诊断）</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeResumeName && (
            <button
              type="button"
              onClick={() =>
                handleSendText(
                  `请仔细分析我的简历《${activeResumeName}》，挖掘我的优势亮点，并给出具体的求职与优化建议。`
                )
              }
              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-medium transition-all cursor-pointer"
            >
              让管家分析此简历
            </button>
          )}
          <button
            type="button"
            onClick={() => uploadFileRef.current?.click()}
            disabled={loadingResume}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-[11px] transition-all cursor-pointer flex items-center gap-1"
          >
            <UploadCloud className="size-3" />
            <span>{loadingResume ? "解析中..." : activeResumeName ? "更换简历" : "上传简历"}</span>
          </button>
          {agentMessages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("确定要清空与 AI 智能管家的历史对话并开启新对话吗？")) {
                  clearAgentMessages();
                }
              }}
              title="清空对话记录，开启全新对话"
              className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-[11px] transition-all cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="size-3 text-stone-400" />
              <span>开启新对话</span>
            </button>
          )}
          <input
            ref={uploadFileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={handleDirectUpload}
          />
        </div>
      </div>

      {/* 对话区：自适应伸展铺满空间 */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2 text-xs">
        {agentMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
            <div className="size-16 rounded-3xl bg-amber-500/10 p-1 flex items-center justify-center border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Bot className="size-8 text-amber-400" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <p className="text-base font-bold text-stone-100">你好！我是你的 AI 智能管家</p>
              <p className="text-xs text-stone-400 leading-relaxed">
                随时让我<span className="text-amber-300">切换黑白主题、调节投递快慢、解答软件疑问</span>，
                或<span className="text-amber-300">把简历交给我，我们随时聊聊你的求职困惑与经历修改</span>。
              </p>
            </div>

            {/* 精选快捷测试卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg pt-2 text-left">
              <button
                type="button"
                onClick={() => handleSendText("帮我切换到黑白极简高级主题")}
                className="p-3 rounded-xl border border-stone-800/80 bg-stone-900/50 hover:border-violet-500/40 hover:bg-stone-900/80 transition-all cursor-pointer text-xs group"
              >
                <div className="flex items-center gap-2 font-bold text-stone-200 group-hover:text-violet-300">
                  <div className="p-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-400">
                    <Palette className="size-3.5" />
                  </div>
                  <span>切换极简黑白主题</span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5 leading-normal">
                  0.01 秒极速变色，体验无刷新主题切换
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSendText("帮我切换到效率档，投递得更快一点")}
                className="p-3 rounded-xl border border-stone-800/80 bg-stone-900/50 hover:border-amber-500/40 hover:bg-stone-900/80 transition-all cursor-pointer text-xs group"
              >
                <div className="flex items-center gap-2 font-bold text-stone-200 group-hover:text-amber-300">
                  <div className="p-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <Zap className="size-3.5" />
                  </div>
                  <span>切换投递为效率档</span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5 leading-normal">
                  调节拟人化节奏至 15~30 秒短时冲刺
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSendText("你能看看我的简历吗？聊聊我的经历优势和改进建议")
                }
                className="p-3 rounded-xl border border-stone-800/80 bg-stone-900/50 hover:border-indigo-500/40 hover:bg-stone-900/80 transition-all cursor-pointer text-xs group"
              >
                <div className="flex items-center gap-2 font-bold text-stone-200 group-hover:text-indigo-300">
                  <div className="p-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                    <FileText className="size-3.5" />
                  </div>
                  <span>聊聊我的简历优势</span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5 leading-normal">
                  结合已绑定的简历，给出针对性优化建议
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSendText("这个软件怎么使用？有哪些核心模块？")}
                className="p-3 rounded-xl border border-stone-800/80 bg-stone-900/50 hover:border-sky-500/40 hover:bg-stone-900/80 transition-all cursor-pointer text-xs group"
              >
                <div className="flex items-center gap-2 font-bold text-stone-200 group-hover:text-sky-300">
                  <div className="p-1 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
                    <HelpCircle className="size-3.5" />
                  </div>
                  <span>软件使用全能答疑</span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5 leading-normal">
                  了解 7 大核心模块架构与防封号机制
                </p>
              </button>
            </div>
          </div>
        ) : (
          agentMessages.map((msg, index) => {
            const isUser = msg.role === "user";
            return (
              <div key={index} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"} group`}>
                {!isUser && (
                  <div className="size-8 rounded-xl overflow-hidden border border-amber-500/30 shadow-sm shrink-0">
                    <img src="/favicon.png" alt="AI" className="size-full object-cover" />
                  </div>
                )}
                <div className="relative group max-w-[85%]">
                  <div
                    className={`rounded-2xl px-4 py-2.5 leading-relaxed break-words shadow-sm ${
                      isUser
                        ? "bg-amber-500 text-stone-950 font-medium rounded-tr-sm"
                        : "bg-stone-900 border border-stone-800 text-stone-200 rounded-tl-sm pr-9"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {!isUser && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(msg.content, index)}
                      title={copiedIndex === index ? "已复制到剪贴板" : "一键复制回答"}
                      className="absolute top-2 right-2 p-1 rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                    >
                      {copiedIndex === index ? (
                        <Check className="size-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  )}
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

      {/* 排队等待消息提示条 */}
      {queuedMessage && (
        <div className="shrink-0 flex items-center justify-between px-3.5 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-2 rounded-full bg-amber-400 animate-ping shrink-0" />
            <span className="font-semibold shrink-0">已排队待发送：</span>
            <span className="truncate text-stone-200">“{queuedMessage}”</span>
          </div>
          <button
            type="button"
            onClick={() => setQueuedMessage(null)}
            className="text-stone-400 hover:text-red-400 text-[11px] ml-2 shrink-0 cursor-pointer transition-colors"
          >
            取消排队
          </button>
        </div>
      )}

      {/* 输入框（shrink-0 钉死底部，永不随内容移动） */}
      <MagicCard className="shrink-0 rounded-2xl border border-stone-700/80 bg-stone-900/90 p-2.5 shadow-sm focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all" glowColor="245, 158, 11" enableTilt={false} particleCount={4}>
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
          placeholder={
            agentPending
              ? "管家正在思考中… 您可在此提前输入下一个问题（按 Enter 加入排队）"
              : "对管家下达指令或聊聊你的求职困惑（例如：帮我换成黑白主题、看看我的简历、投快一点...）"
          }
          disabled={false}
        />

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {PROMPT_TAGS.map((tItem, idx) => {
              const renderIcon = () => {
                switch (tItem.iconType) {
                  case "palette":
                    return <Palette className="size-3 text-violet-400" />;
                  case "sun":
                    return <Sun className="size-3 text-amber-400" />;
                  case "zap":
                    return <Zap className="size-3 text-amber-400" />;
                  case "shield":
                    return <Shield className="size-3 text-emerald-400" />;
                  case "settings":
                    return <Settings className="size-3 text-stone-400" />;
                  case "bar-chart":
                    return <BarChart2 className="size-3 text-sky-400" />;
                  case "file-text":
                    return <FileText className="size-3 text-indigo-400" />;
                  case "activity":
                    return <Activity className="size-3 text-rose-400" />;
                  case "layout":
                    return <LayoutDashboard className="size-3 text-stone-400" />;
                  case "help":
                    return <HelpCircle className="size-3 text-teal-400" />;
                  default:
                    return <Sparkles className="size-3 text-amber-400" />;
                }
              };
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendText(tItem.prompt)}
                  className="shrink-0 flex items-center gap-1.5 rounded-full border border-stone-800 bg-stone-950/80 px-2.5 py-1 text-[11px] text-stone-400 hover:border-amber-500/40 hover:text-stone-200 transition-all cursor-pointer"
                >
                  {renderIcon()}
                  <span>{tItem.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden text-[10px] text-stone-500 lg:inline">
              <kbd className="font-mono bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">Enter</kbd> 发送
            </span>
            <button
              onClick={() => handleSendText(input)}
              disabled={!input.trim()}
              title={agentPending ? "加入待发队列（回复后自动发送）" : "发送指令"}
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
