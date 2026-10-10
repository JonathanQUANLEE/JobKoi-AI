import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
  FileText,
  UploadCloud,
  CheckCircle2,
  Copy,
  Gauge,
  Zap,
  Award,
  Search,
  RefreshCw,
  X,
  FileCheck,
  ChevronRight,
  TrendingUp,
  ShieldAlert,
  Send,
  Layers,
} from "lucide-react";
import { ipc, type AgentToolResult, type ATSScoreData, type ResumeDiagnoseResult } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { useRunStore, useT } from "../store";
import { MagicCard } from "./core/MagicBento";
import LatticeLoader from "./core/LatticeLoader";

/**
 * 智能助手与简历精修双 Agent 面板
 * - Agent 1: 投递与意向画像提炼管家 (Copilot)
 * - Agent 2: 简历深度精修与诊断专家 (ATS 启发式算法 + STAR / Google X-Y-Z 技能包)
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

const SKILL_OPTIONS = [
  {
    id: "star",
    name: "STAR 闭环改写",
    tag: "STAR Method",
    desc: "情境 (S) + 任务 (T) + 行动 (A) + 成果 (R) 严密逻辑闭环",
    color: "from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-300",
    activeBadge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  },
  {
    id: "xyz",
    name: "Google X-Y-Z 量化",
    tag: "X-Y-Z Formula",
    desc: "通过做 [Z]，达成 [X] 成果，以 [Y] 指标衡量",
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/40 text-blue-300",
    activeBadge: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  },
  {
    id: "ats",
    name: "ATS 关键词穿透",
    tag: "ATS Keywords",
    desc: "精准覆盖目标岗位高频技术词汇，提升初筛通过率",
    color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/40 text-emerald-300",
    activeBadge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  {
    id: "verbs",
    name: "强动词能量升级",
    tag: "Action Verbs",
    desc: "淘汰'负责/参与'等平庸词，升级为'主导/重构/攻坚'",
    color: "from-purple-500/20 to-purple-600/10 border-purple-500/40 text-purple-300",
    activeBadge: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  },
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
  const pendingResumePolish = useRunStore((s) => s.pendingResumePolish);
  const setPendingResumePolish = useRunStore((s) => s.setPendingResumePolish);

  // 核心模式切换：默认主打 Agent 2 (简历精修与诊断)，也可随时切换 Agent 1 (投递画像管家)
  const [panelMode, setPanelMode] = useState<"polish" | "copilot">("polish");

  // ==================== Agent 2 简历精修专用状态 ====================
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("后端开发工程师");
  const [customPrompt, setCustomPrompt] = useState("");
  const [activeSkills, setActiveSkills] = useState<string[]>(["star", "xyz", "ats", "verbs"]);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [atsScore, setAtsScore] = useState<ATSScoreData | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseStatus, setDiagnoseStatus] = useState<"working" | "done" | "error">("working");
  const [diagnoseResult, setDiagnoseResult] = useState<ResumeDiagnoseResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [polishChatMessages, setPolishChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpPending, setFollowUpPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================== Agent 1 意向画像专用状态 ====================
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [toolResult, setToolResult] = useState<AgentToolResult | null>(null);
  const [prepareRunReady, setPrepareRunReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 1. 获取 LLM 配置
  useEffect(() => {
    if (llmConfig) return;
    ipc
      .getLLMConfig()
      .then((config) => {
        setLLMConfig(config);
      })
      .catch(() => {});
  }, [llmConfig, setLLMConfig]);

  // 2. 响应从简历资料库一键跳转的待精修简历
  useEffect(() => {
    if (pendingResumePolish) {
      setPanelMode("polish");
      setLoadedFileName(pendingResumePolish.name);
      if (pendingResumePolish.text) {
        setResumeText(pendingResumePolish.text);
        // 本地启发式评分即刻触发
        ipc
          .calculateATSScore(pendingResumePolish.text)
          .then((score) => setAtsScore(score))
          .catch(() => {});
      }
      // 消费完毕重置 store 引用
      setPendingResumePolish(null);
    }
  }, [pendingResumePolish, setPendingResumePolish]);

  // 3. 文本变更时轻量防抖计算本地 ATS 启发式算法评分
  useEffect(() => {
    if (!resumeText.trim()) {
      setAtsScore(null);
      return;
    }
    const timer = setTimeout(() => {
      ipc
        .calculateATSScore(resumeText)
        .then((res) => {
          setAtsScore(res);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [resumeText]);

  // 4. 对话列表自动滚动
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [agentMessages.length, agentPending, polishChatMessages.length]);

  // 切换 Skill 开关
  const toggleSkill = (id: string) => {
    setActiveSkills((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 本地文件上传与读取
  const handleLocalFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadedFileName(file.name);
    if (file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = String(evt.target?.result || "");
        setResumeText(text);
      };
      reader.readAsText(file);
    } else {
      // 其它格式文件提示或由文本框输入
      setResumeText((prev) =>
        prev
          ? `${prev}\n\n[已载入本地附件：${file.name}（大小: ${(file.size / 1024).toFixed(1)} KB）]`
          : `[已载入本地附件：${file.name}（大小: ${(file.size / 1024).toFixed(1)} KB）]\n请在此粘贴对应正文内容或重点经历段落以获取更精准的诊断。`
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 执行核心诊断流程
  const handleRunDiagnosis = async () => {
    const textToDiagnose = resumeText.trim();
    if (!textToDiagnose) {
      setMessage("请先输入或从资料库选择需要诊断精修的简历内容");
      return;
    }
    if (!llmConfig?.configured) {
      onOpenSettings?.("model");
      setMessage("请先在设置中配置大模型 API Key（支持免费 OpenRouter 专属模型）");
      return;
    }

    setDiagnosing(true);
    setDiagnoseStatus("working");
    setMessage(null);

    try {
      const res = await ipc.diagnoseResume(
        textToDiagnose,
        targetRole,
        activeSkills,
        customPrompt
      );

      if (res.status === "ok") {
        setDiagnoseResult(res);
        if (res.ats_score) {
          setAtsScore(res.ats_score);
        }
        setDiagnoseStatus("done");
        if (res.polish_advice) {
          setPolishChatMessages([
            {
              role: "assistant",
              content: res.polish_advice,
            },
          ]);
        }
      } else {
        setDiagnoseStatus("error");
        setMessage(res.message || "诊断请求失败，请检查网络或 API 配置");
      }
    } catch (err) {
      setDiagnoseStatus("error");
      setMessage(String(err));
    } finally {
      setTimeout(() => {
        setDiagnosing(false);
      }, 1000);
    }
  };

  // 多轮追问
  const handleFollowUpSend = async () => {
    const trimmed = followUpInput.trim();
    if (!trimmed || followUpPending) return;

    setPolishChatMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setFollowUpInput("");
    setFollowUpPending(true);

    try {
      const context = `用户当前简历段落：\n${resumeText.slice(0, 800)}\n\n目标岗位：${targetRole}\n用户针对刚刚的诊断提出了进一步需求：\n${trimmed}\n\n请以资深猎头与技术面试官身份，应用 STAR 与 Google X-Y-Z 技能法则，输出精准且可直接复制的修改版内容。`;
      const res = await ipc.agentChat(context, [], getCurrentForm ? getCurrentForm() : {});
      if (res.status === "ok" && res.reply) {
        setPolishChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.reply || "" },
        ]);
      } else {
        setPolishChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `追问处理异常：${res.message || "未知错误"}` },
        ]);
      }
    } catch (err) {
      setPolishChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `请求失败：${String(err)}` },
      ]);
    } finally {
      setFollowUpPending(false);
    }
  };

  // 一键复制精修文本
  const handleCopyAdvice = () => {
    const textToCopy = diagnoseResult?.polish_advice || "";
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ==================== Agent 1 (Copilot) 处理函数 ====================
  async function handleSendText(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || agentPending) return;

    if (!llmConfig?.configured) {
      if (onOpenSettings) onOpenSettings("model");
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
    <MagicCard className="panel" glowColor="245, 158, 11" enableTilt={false}>
      {/* 隐藏的本地文件上传 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp"
        onChange={handleLocalFileUpload}
        className="hidden"
      />

      {/* 头部：双 Agent 切换与全局模型状态 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-4 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-purple-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold text-sm shadow-sm">
            {panelMode === "polish" ? (
              <Sparkles className="size-5 text-amber-400 animate-pulse" />
            ) : (
              <Bot className="size-5 text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-stone-100">
                {panelMode === "polish" ? "简历精修与诊断 · Agent 2" : "求职意向画像 · Agent 1"}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                双 Agent 架构
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                  llmConfig?.configured
                    ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-400"
                    : "bg-stone-800 border-stone-700 text-stone-400"
                }`}
              >
                {llmConfig?.configured ? "大模型已就绪" : "待配置模型"}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mt-0.5">
              {panelMode === "polish"
                ? "融合 ATS 启发式算法评分 · STAR 法则闭环 · Google X-Y-Z 量化技能"
                : "对话提炼求职意向 · 自动生成过滤与投递画像"}
            </p>
          </div>
        </div>

        {/* 顶部右侧：Agent 模式切换胶囊 + 模型设置直达 */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-stone-900/90 p-1 border border-stone-800">
            <button
              type="button"
              onClick={() => setPanelMode("polish")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                panelMode === "polish"
                  ? "bg-amber-500 text-stone-950 shadow-sm"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>简历精修</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelMode("copilot")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                panelMode === "copilot"
                  ? "bg-amber-500 text-stone-950 shadow-sm"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <Bot className="size-3.5" />
              <span>意向管家</span>
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-800 bg-stone-900/60 hover:border-amber-500/40 text-xs text-stone-400 hover:text-stone-200 transition-all select-none cursor-pointer"
            onClick={() => onOpenSettings?.("model")}
            title="配置大模型 API 与 Provider"
          >
            <SlidersHorizontal className="size-3.5 text-stone-400" />
            <span className="hidden sm:inline">模型设置</span>
          </button>
        </div>
      </div>

      {/* 若未配置大模型，展示引导卡片 */}
      {!llmConfig?.configured && (
        <MagicCard
          className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300"
          glowColor="245, 158, 11"
          enableTilt={false}
          particleCount={4}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-amber-400" />
            <span>尚未配置大模型 API Key（已支持 OpenRouter 免费模型），配置后即可解锁深度诊断与润色</span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline underline-offset-2 hover:text-amber-200 ml-3 shrink-0 cursor-pointer"
            onClick={() => onOpenSettings?.("model")}
          >
            前往配置
          </button>
        </MagicCard>
      )}

      {/* ========================================================================= */}
      {/* 模式 A: 简历精修与诊断 (Agent 2) 主界面                                     */}
      {/* ========================================================================= */}
      {panelMode === "polish" && (
        <div className="space-y-4">
          {/* 1. 4 大专业技能包矩阵（可自由勾选赋能） */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-stone-300 flex items-center gap-1.5">
                <Award className="size-3.5 text-amber-400" />
                <span>简历诊断与精修技能包 (Skills Matrix)</span>
              </span>
              <span className="text-[10px] text-stone-500">
                已激活 {activeSkills.length} / {SKILL_OPTIONS.length} 项技能
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {SKILL_OPTIONS.map((skill) => {
                const isActive = activeSkills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggleSkill(skill.id)}
                    className={`relative text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? "bg-gradient-to-br from-stone-900 to-stone-900/90 border-amber-500/50 shadow-sm shadow-amber-500/10"
                        : "bg-stone-950/60 border-stone-800/80 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-stone-200">{skill.name}</span>
                      <span
                        className={`size-4 rounded-md flex items-center justify-center text-[10px] border ${
                          isActive
                            ? "bg-amber-500 text-stone-950 border-amber-400"
                            : "border-stone-700 text-stone-500"
                        }`}
                      >
                        {isActive ? <Check className="size-3" /> : null}
                      </span>
                    </div>
                    <p className="text-[10px] text-stone-400 line-clamp-2 leading-relaxed">
                      {skill.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 简历输入区与来源管理 */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-amber-400" />
                <span className="text-xs font-bold text-stone-200">简历正文 / 项目经历段落</span>
                {loadedFileName && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    <FileCheck className="size-3 text-amber-400" />
                    <span className="max-w-[160px] truncate">{loadedFileName}</span>
                    <button
                      type="button"
                      onClick={() => setLoadedFileName(null)}
                      className="hover:text-amber-100 ml-0.5"
                      title="清除文件来源标签"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-700 bg-stone-800/80 hover:bg-stone-700 text-stone-300 hover:text-stone-100 text-[11px] font-medium transition-all cursor-pointer"
                  title="上传本地简历文件（.txt / .docx / .pdf）或佐证图片"
                >
                  <UploadCloud className="size-3.5 text-stone-400" />
                  <span>上传本地文件/截图</span>
                </button>
                {resumeText && (
                  <button
                    type="button"
                    onClick={() => {
                      setResumeText("");
                      setLoadedFileName(null);
                      setDiagnoseResult(null);
                    }}
                    className="text-[11px] text-stone-500 hover:text-stone-300 px-1.5 py-1"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={5}
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="在此粘贴完整简历或具体某段项目/工作经历（例如：熟练掌握Java，负责电商用户中心微服务开发，日活10万，优化SQL使查询耗时降低40%）..."
              className="w-full resize-y rounded-xl bg-stone-950/80 border border-stone-800/80 p-3 text-xs leading-relaxed text-stone-200 placeholder:text-stone-600 outline-none focus:border-amber-500/50 transition-all font-mono"
            />

            {/* 目标岗位与侧重诉求输入 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-stone-400 mb-1">
                  目标应聘岗位 (用于 ATS 关键词匹配)
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="例如：后端开发工程师 / 算法工程师 / 前端主管"
                  className="w-full rounded-xl bg-stone-950/80 border border-stone-800 px-3 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-stone-400 mb-1">
                  定制侧重要求 (可选)
                </label>
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="例如：重点突出高并发调优成果；多用大厂严选动词"
                  className="w-full rounded-xl bg-stone-950/80 border border-stone-800 px-3 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* 诊断启动按钮 */}
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-stone-500">
                字数：{resumeText.length} 字 · {resumeText.length > 50 ? "已满足基本诊断长度" : "建议至少输入 50 字以上"}
              </span>

              <button
                type="button"
                onClick={handleRunDiagnosis}
                disabled={diagnosing || !resumeText.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="size-4 fill-current" />
                <span>开始 ATS 算法诊断与 AI 深度精修</span>
              </button>
            </div>
          </div>

          {/* 3. 诊断中状态：展示专属 React Bits <LatticeLoader /> 动效 */}
          {diagnosing && (
            <div className="p-6 rounded-2xl border border-amber-500/30 bg-stone-900/90 shadow-xl flex flex-col items-center justify-center space-y-3 animate-in fade-in duration-200">
              <LatticeLoader
                status={diagnoseStatus}
                label="AI 简历精修 Agent 正在融合专业技能包诊断..."
                doneLabel="精修诊断完成"
                errorLabel="诊断处理异常"
                pattern="orbit"
                grid={3}
                shape="round"
                doneColor="#22c55e"
                errorColor="#ef4444"
                cellSize={7}
                gap={3}
                fontSize={13}
                step={90}
                idleOpacity={0.15}
                glow={true}
                glowColor="rgba(245, 158, 11, 0.4)"
                showTimer={true}
              />
              <p className="text-[11px] text-stone-400">
                正在执行 ATS 启发式打分、STAR 闭环重构与 Google X-Y-Z 深度量化改写
              </p>
            </div>
          )}

          {/* 4. 本地即时 ATS 启发式算法评分卡片 */}
          {atsScore && (
            <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Gauge className="size-4 text-emerald-400" />
                  <span className="text-xs font-bold text-stone-200">
                    ATS 算法多维诊断指标 (实时启发式计算)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-stone-400">综合得分:</span>
                  <span
                    className={`text-base font-black font-mono ${
                      atsScore.overall_score >= 80
                        ? "text-emerald-400"
                        : atsScore.overall_score >= 65
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {atsScore.overall_score}
                  </span>
                  <span className="text-xs text-stone-500">/ 100</span>
                </div>
              </div>

              {/* 5 维度雷达条 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-stone-400">量化成果密度</span>
                    <span className="font-bold text-stone-200">
                      {atsScore.dimensions.quantification}分
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${atsScore.dimensions.quantification}%` }}
                    />
                  </div>
                </div>

                <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-stone-400">强动词能量比</span>
                    <span className="font-bold text-stone-200">
                      {atsScore.dimensions.action_verbs}分
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${atsScore.dimensions.action_verbs}%` }}
                    />
                  </div>
                </div>

                <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-stone-400">STAR 逻辑闭环</span>
                    <span className="font-bold text-stone-200">
                      {atsScore.dimensions.star_logic}分
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${atsScore.dimensions.star_logic}%` }}
                    />
                  </div>
                </div>

                <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-stone-400">技术深度覆盖</span>
                    <span className="font-bold text-stone-200">
                      {atsScore.dimensions.technical_depth}分
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${atsScore.dimensions.technical_depth}%` }}
                    />
                  </div>
                </div>

                <div className="bg-stone-950/70 p-2.5 rounded-xl border border-stone-800/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-stone-400">排版与可读性</span>
                    <span className="font-bold text-stone-200">
                      {atsScore.dimensions.readability}分
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all"
                      style={{ width: `${atsScore.dimensions.readability}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 关键统计指标徽章 */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium">
                  ⚡ 强动词：{atsScore.strong_verbs_count} 个
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg border font-medium ${
                    atsScore.weak_verbs_count > 0
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                      : "bg-stone-800 border-stone-700 text-stone-400"
                  }`}
                >
                  ⚠️ 待优化平庸词：{atsScore.weak_verbs_count} 个
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 font-medium">
                  📊 量化指标点：{atsScore.metrics_count} 处
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 font-mono">
                  总词数：{atsScore.word_count} 字
                </span>
              </div>

              {/* 亮点与优化缺陷 tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {atsScore.highlights.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      <span>检测出的亮点优势</span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {atsScore.highlights.map((h, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {atsScore.issues.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                      <ShieldAlert className="size-3" />
                      <span>算法改进建议</span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {atsScore.issues.map((issue, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-amber-950/40 border border-amber-500/30 text-amber-300"
                        >
                          {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. 结构化精修报告与示范改写展示卡 */}
          {diagnoseResult && diagnoseResult.polish_advice && (
            <div className="rounded-2xl border border-amber-500/40 bg-stone-900/90 p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-amber-400" />
                  <span className="text-xs font-bold text-stone-100">
                    AI 深度精修报告与 Bullet Points 改写
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyAdvice}
                  className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400 text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-stone-950" />
                      <span>已复制到剪贴板</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5 text-stone-950" />
                      <span>一键复制精修文本</span>
                    </>
                  )}
                </button>
              </div>

              {/* 报告正文预览 */}
              <div className="max-h-[380px] overflow-y-auto pr-1 text-xs text-stone-200 leading-relaxed font-sans whitespace-pre-wrap rounded-xl bg-stone-950/80 p-3.5 border border-stone-800/80">
                {diagnoseResult.polish_advice}
              </div>
            </div>
          )}

          {/* 6. 多轮追问与持续润色对话流 */}
          {diagnoseResult && (
            <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-300">
                <Bot className="size-4 text-amber-400" />
                <span>与简历精修 Agent 持续对话追问</span>
              </div>

              {polishChatMessages.length > 1 && (
                <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1 text-xs">
                  {polishChatMessages.slice(1).map((msg, idx) => {
                    const isUser = msg.role === "user";
                    return (
                      <div
                        key={idx}
                        className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        {!isUser && (
                          <div className="size-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 text-xs">
                            <Bot className="size-3.5" />
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                            isUser
                              ? "bg-amber-500 text-stone-950 font-medium"
                              : "bg-stone-950 border border-stone-800 text-stone-200"
                          }`}
                        >
                          {msg.content}
                        </div>
                        {isUser && (
                          <div className="size-6 rounded-lg bg-stone-800 text-stone-300 flex items-center justify-center shrink-0 text-xs">
                            <User className="size-3.5" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 追问输入框 */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleFollowUpSend();
                    }
                  }}
                  disabled={followUpPending}
                  placeholder="继续提出要求，例如：帮我把第2段项目经历再改简短一点 / 针对腾讯面试怎么介绍？"
                  className="flex-1 rounded-xl bg-stone-950 border border-stone-800 px-3 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={handleFollowUpSend}
                  disabled={followUpPending || !followUpInput.trim()}
                  className="size-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center hover:bg-amber-400 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模式 B: 求职意向画像提炼 (Agent 1) 经典界面                                 */}
      {/* ========================================================================= */}
      {panelMode === "copilot" && (
        <div className="space-y-3.5">
          {/* 对话区 */}
          <div ref={listRef} className="h-60 overflow-y-auto space-y-3.5 pr-1.5 text-xs">
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
            <MagicCard
              className="rounded-2xl border border-stone-700 bg-stone-900 p-4 shadow-sm"
              glowColor="16, 185, 129"
              enableTilt={false}
              particleCount={6}
            >
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-emerald-400">
                <Terminal className="h-3.5 w-3.5" />
                <span>工具调用返回 ({toolResult.type})</span>
              </div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-black/70 p-3 font-mono text-xs leading-relaxed text-stone-300 border border-stone-800">
                {toolResult.text}
              </pre>
            </MagicCard>
          )}

          {/* 一键投递确认按钮 */}
          {prepareRunReady && (
            <MagicCard
              className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-3.5 shadow-sm"
              glowColor="16, 185, 129"
              enableTilt={false}
              particleCount={6}
            >
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

          {/* 结构化画像预览卡片 */}
          {preview && (
            <MagicCard
              className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-stone-900 to-amber-950/20 p-4 shadow-sm"
              glowColor="245, 158, 11"
              enableTilt={false}
              particleCount={8}
            >
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
            </MagicCard>
          )}

          {/* 经典输入框组件 */}
          <MagicCard
            className="rounded-2xl border border-stone-700/80 bg-stone-900/90 p-2.5 shadow-sm focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all"
            glowColor="245, 158, 11"
            enableTilt={false}
            particleCount={4}
          >
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
                {PROMPT_TAGS.map((tItem, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendText(tItem.prompt)}
                    disabled={agentPending}
                    className="shrink-0 flex items-center gap-1 rounded-full border border-stone-800 bg-stone-950/80 px-2.5 py-1 text-[11px] text-stone-400 hover:border-amber-500/40 hover:text-stone-200 transition-all select-none cursor-pointer"
                  >
                    <Plus className="h-3 w-3 text-stone-500" />
                    <span>{tItem.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="hidden text-[10px] text-stone-500 lg:inline">
                  <kbd className="font-mono bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">
                    Enter
                  </kbd>{" "}
                  发送
                </span>

                <button
                  onClick={() => handleSendText(input)}
                  disabled={agentPending || !input.trim()}
                  className="grid size-8 place-items-center rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </MagicCard>
        </div>
      )}

      {message && <p className="text-xs text-amber-400 mt-2">{message}</p>}
    </MagicCard>
  );
}
