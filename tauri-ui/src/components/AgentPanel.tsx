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
  Clock,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { ipc, type AgentToolResult, type ATSScoreData, type ResumeDiagnoseResult } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { useRunStore, useT } from "../store";
import { MagicCard } from "./core/MagicBento";
import LatticeLoader from "./core/LatticeLoader";

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

// 轻量精致的技能包元数据（拒绝臃肿大黑框，化为灵动芯片）
const SKILL_CHIPS = [
  {
    id: "star",
    name: "STAR 闭环改写",
    short: "STAR 闭环",
    desc: "情境(S) + 任务(T) + 行动(A) + 成果(R) 严密逻辑闭环",
    activeColor: "bg-amber-500/15 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/20",
    dotColor: "bg-amber-400",
  },
  {
    id: "xyz",
    name: "Google X-Y-Z 量化",
    short: "X-Y-Z 量化",
    desc: "通过做 [Z]，达成 [X] 成果，以 [Y] 指标精准衡量",
    activeColor: "bg-blue-500/15 border-blue-500/50 text-blue-300 ring-1 ring-blue-500/20",
    dotColor: "bg-blue-400",
  },
  {
    id: "ats",
    name: "ATS 关键词穿透",
    short: "ATS 穿透",
    desc: "覆盖目标岗位高频技术词，消除机筛解析盲区",
    activeColor: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/20",
    dotColor: "bg-emerald-400",
  },
  {
    id: "verbs",
    name: "强动词能量升级",
    short: "强动词升级",
    desc: "淘汰'负责/参与'平庸词，升级为'主导/重构/攻坚'",
    activeColor: "bg-purple-500/15 border-purple-500/50 text-purple-300 ring-1 ring-purple-500/20",
    dotColor: "bg-purple-400",
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

  // 主模式切换：默认主打 Agent 2 (简历精修)，支持切换 Agent 1 (意向管家)
  const [panelMode, setPanelMode] = useState<"polish" | "copilot">("polish");

  // ==================== Agent 2 (简历精修工作台) 状态 ====================
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("后端开发工程师");
  const [customPrompt, setCustomPrompt] = useState("");
  const [activeSkills, setActiveSkills] = useState<string[]>(["star", "xyz", "ats", "verbs"]);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [atsScore, setAtsScore] = useState<ATSScoreData | null>(null);

  // 诊断与进度控制状态（彻底解决用户提出的进度透明度问题）
  const [diagnosing, setDiagnosing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(15);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [diagnoseStatus, setDiagnoseStatus] = useState<"working" | "done" | "error">("working");
  const [diagnoseResult, setDiagnoseResult] = useState<ResumeDiagnoseResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 持续微调多轮对话状态
  const [polishChatMessages, setPolishChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpPending, setFollowUpPending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  // ==================== Agent 1 (意向管家) 状态 ====================
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [toolResult, setToolResult] = useState<AgentToolResult | null>(null);
  const [prepareRunReady, setPrepareRunReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 1. 初始化大模型配置
  useEffect(() => {
    if (llmConfig) return;
    ipc.getLLMConfig().then((cfg) => setLLMConfig(cfg)).catch(() => {});
  }, [llmConfig, setLLMConfig]);

  // 2. 响应从简历资料库一键跳转过来的待精修简历
  useEffect(() => {
    if (pendingResumePolish) {
      setPanelMode("polish");
      setLoadedFileName(pendingResumePolish.name);
      if (pendingResumePolish.text) {
        setResumeText(pendingResumePolish.text);
        ipc
          .calculateATSScore(pendingResumePolish.text)
          .then((score) => setAtsScore(score))
          .catch(() => {});
      }
      setPendingResumePolish(null);
    }
  }, [pendingResumePolish, setPendingResumePolish]);

  // 3. 用户在左侧输入或粘贴时，本地 1ms 即刻计算 ATS 启发式算法评分
  useEffect(() => {
    if (!resumeText.trim()) {
      setAtsScore(null);
      return;
    }
    const timer = setTimeout(() => {
      ipc
        .calculateATSScore(resumeText)
        .then((res) => setAtsScore(res))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [resumeText]);

  // 4. 诊断进度流水线心跳模拟（平滑进度条 + 动态估时 + 阶段步进）
  useEffect(() => {
    if (!diagnosing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setProgressPercent(12);
    setElapsedSeconds(0);
    setEstimatedSeconds(14);
    setCurrentStageIndex(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);

      // 阶段与进度平滑递增
      if (elapsed <= 1) {
        setCurrentStageIndex(0); // 本地 ATS 扫描
        setProgressPercent(28);
        setEstimatedSeconds(Math.max(1, 14 - elapsed));
      } else if (elapsed <= 3) {
        setCurrentStageIndex(1); // 技能矩阵融合
        setProgressPercent(52);
        setEstimatedSeconds(Math.max(1, 14 - elapsed));
      } else if (elapsed <= 9) {
        setCurrentStageIndex(2); // 大模型深度润色中
        setProgressPercent(Math.min(88, 52 + (elapsed - 3) * 6));
        setEstimatedSeconds(Math.max(1, 14 - elapsed));
      } else {
        setCurrentStageIndex(3); // 格式排版与卡片组装
        setProgressPercent(Math.min(96, 88 + (elapsed - 9) * 1.5));
        setEstimatedSeconds(2);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [diagnosing]);

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
        setResumeText(String(evt.target?.result || ""));
      };
      reader.readAsText(file);
    } else {
      setResumeText((prev) =>
        prev
          ? `${prev}\n\n[已载入附件：${file.name}（${(file.size / 1024).toFixed(1)} KB）]`
          : `[已载入附件：${file.name}（${(file.size / 1024).toFixed(1)} KB）]\n请在此粘贴对应正文内容或重点经历段落以获取深度诊断。`
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 启动核心诊断流程
  const handleRunDiagnosis = async () => {
    const textToDiagnose = resumeText.trim();
    if (!textToDiagnose) {
      setMessage("请先在左侧输入或粘贴需要诊断精修的简历内容");
      return;
    }
    if (!llmConfig?.configured) {
      onOpenSettings?.("model");
      setMessage("请先在右上角【模型设置】中配置 API Key（支持免费 OpenRouter 专属模型）");
      return;
    }

    abortControllerRef.current = false;
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

      if (abortControllerRef.current) return;

      if (res.status === "ok") {
        setProgressPercent(100);
        setCurrentStageIndex(3);
        setDiagnoseStatus("done");
        setDiagnoseResult(res);
        if (res.ats_score) setAtsScore(res.ats_score);
        if (res.polish_advice) {
          setPolishChatMessages([{ role: "assistant", content: res.polish_advice }]);
        }
      } else {
        setDiagnoseStatus("error");
        setMessage(res.message || "诊断服务请求异常，请检查网络或 API 配置");
      }
    } catch (err) {
      if (!abortControllerRef.current) {
        setDiagnoseStatus("error");
        setMessage(String(err));
      }
    } finally {
      setTimeout(() => {
        setDiagnosing(false);
      }, 700);
    }
  };

  // 取消本次诊断
  const handleCancelDiagnosis = () => {
    abortControllerRef.current = true;
    setDiagnosing(false);
    setMessage("已中止本次诊断");
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

  // 多轮追问
  const handleFollowUpSend = async () => {
    const trimmed = followUpInput.trim();
    if (!trimmed || followUpPending) return;

    setPolishChatMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setFollowUpInput("");
    setFollowUpPending(true);

    try {
      const context = `用户简历段落：\n${resumeText.slice(0, 1000)}\n\n目标岗位：${targetRole}\n用户针对精修提出了新要求：\n${trimmed}\n\n请以顶级技术面试官身份，应用 STAR 与 Google X-Y-Z 法则，精炼输出 1~2 段可直接复制的完美改写。`;
      const res = await ipc.agentChat(context, [], getCurrentForm ? getCurrentForm() : {});
      if (res.status === "ok" && res.reply) {
        setPolishChatMessages((prev) => [...prev, { role: "assistant", content: res.reply || "" }]);
      } else {
        setPolishChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `微调处理异常：${res.message || "未知错误"}` },
        ]);
      }
    } catch (err) {
      setPolishChatMessages((prev) => [...prev, { role: "assistant", content: `请求失败：${String(err)}` }]);
    } finally {
      setFollowUpPending(false);
    }
  };

  // ==================== Agent 1 (意向管家) 处理 ====================
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

  function apply() {
    if (!agentProfilePreview) return;
    onApply(agentProfilePreview);
    setApplied(true);
  }

  const preview = summarizeAgentProfile(agentProfilePreview);
  const modeKey = (agentProfilePreview?.send as Record<string, unknown> | undefined)?.mode;
  const modeLabel = typeof modeKey === "string" ? t(`mode.${modeKey}.title`) : "-";

  return (
    <MagicCard className="panel w-full" glowColor="245, 158, 11" enableTilt={false}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp"
        onChange={handleLocalFileUpload}
        className="hidden"
      />

      {/* 顶部状态栏：双 Agent 切换胶囊 + 紧凑模型状态 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-stone-800/80">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm shadow-sm">
            {panelMode === "polish" ? <Sparkles className="size-4 text-amber-400" /> : <Bot className="size-4 text-amber-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-stone-100">
                {panelMode === "polish" ? "简历精修与诊断 · Agent 2" : "求职意向画像 · Agent 1"}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {panelMode === "polish" ? "ATS 算法 + STAR 技能" : "意向提炼"}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                  llmConfig?.configured
                    ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-400"
                    : "bg-stone-800 border-stone-700 text-stone-400"
                }`}
              >
                {llmConfig?.configured ? "AI 模型已就绪" : "待配置 API"}
              </span>
            </div>
          </div>
        </div>

        {/* 顶部右侧模式切换 */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-stone-900/90 p-0.5 border border-stone-800">
            <button
              type="button"
              onClick={() => setPanelMode("polish")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                panelMode === "polish" ? "bg-amber-500 text-stone-950 shadow-sm" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>简历精修</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelMode("copilot")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                panelMode === "copilot" ? "bg-amber-500 text-stone-950 shadow-sm" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <Bot className="size-3.5" />
              <span>意向管家</span>
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-800 bg-stone-900/60 hover:border-amber-500/40 text-xs text-stone-400 hover:text-stone-200 transition-all cursor-pointer"
            onClick={() => onOpenSettings?.("model")}
            title="配置 API Key"
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">模型设置</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 模式 A: 简历精修 Studio (左右双栏工作台布局)                                */}
      {/* ========================================================================= */}
      {panelMode === "polish" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full">
          {/* -------------------- 左栏 (5 列)：输入与技能控制台 -------------------- */}
          <div className="lg:col-span-5 space-y-4">
            {/* 1. 技能包矩阵：精致轻量微光 Pill 芯片（拒绝大方块堆砌！） */}
            <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-300 flex items-center gap-1.5">
                  <Award className="size-3.5 text-amber-400" />
                  <span>精修技能包 (点击开启/关闭)</span>
                </span>
                <span className="text-[10px] text-stone-500">
                  {activeSkills.length}/{SKILL_CHIPS.length} 已激活
                </span>
              </div>

              {/* 灵动的 4 色 Pill 胶囊栏 */}
              <div className="flex flex-wrap gap-1.5">
                {SKILL_CHIPS.map((chip) => {
                  const isActive = activeSkills.includes(chip.id);
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => toggleSkill(chip.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer select-none ${
                        isActive
                          ? chip.activeColor
                          : "bg-stone-950/40 border-stone-800 text-stone-500 hover:text-stone-300"
                      }`}
                      title={chip.desc}
                    >
                      <span className={`size-1.5 rounded-full ${isActive ? chip.dotColor : "bg-stone-600"}`} />
                      <span>{chip.short}</span>
                      {isActive && <Check className="size-3 ml-0.5 opacity-80" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. 简历正文输入与附件载入 */}
            <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="size-4 text-amber-400 shrink-0" />
                  <span className="font-bold text-stone-200 shrink-0">简历原文 / 重点经历</span>
                  {loadedFileName && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 truncate max-w-[130px]">
                      <FileCheck className="size-3 shrink-0" />
                      <span className="truncate">{loadedFileName}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-800 hover:bg-stone-700 text-[11px] text-stone-300 transition-all cursor-pointer"
                    title="上传本地简历文件或证书截图"
                  >
                    <UploadCloud className="size-3 text-stone-400" />
                    <span>上传文件</span>
                  </button>
                  {resumeText && (
                    <button
                      type="button"
                      onClick={() => {
                        setResumeText("");
                        setLoadedFileName(null);
                        setDiagnoseResult(null);
                      }}
                      className="text-[11px] text-stone-500 hover:text-stone-300 px-1"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              {/* 文本输入框 */}
              <textarea
                rows={7}
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="在此粘贴完整简历或具体某段项目经历（例如：熟练掌握Java与Spring Boot，主导电商用户中心重构，日活10万，优化SQL使耗时降低40%）..."
                className="w-full resize-y rounded-xl bg-stone-950/80 border border-stone-800/80 p-3 text-xs leading-relaxed text-stone-200 placeholder:text-stone-600 outline-none focus:border-amber-500/50 transition-all font-mono"
              />

              {/* 目标岗位与侧重输入 */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">目标岗位 (用于 ATS 关键词匹配)</label>
                  <input
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="如：后端工程师 / AI 算法"
                    className="w-full rounded-lg bg-stone-950 border border-stone-800 px-2.5 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">重点诉求 (可选)</label>
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="如：强化高并发量化成果"
                    className="w-full rounded-lg bg-stone-950 border border-stone-800 px-2.5 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              {/* 底部启动按钮 */}
              <div className="pt-1 flex items-center justify-between">
                <span className="text-[10px] text-stone-500">
                  字数: {resumeText.length} · {resumeText.length > 30 ? "字数充足" : "建议至少 30 字"}
                </span>

                <button
                  type="button"
                  onClick={handleRunDiagnosis}
                  disabled={diagnosing || !resumeText.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Zap className="size-3.5 fill-current" />
                  <span>{diagnosing ? "正在诊断中..." : "开始 ATS 算法诊断与 AI 精修"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* -------------------- 右栏 (7 列)：诊断成果与算法透视台 -------------------- */}
          <div className="lg:col-span-7 space-y-4">
            {/* 状态 A: 正在诊断中（解决卡顿与无进度感的问题） */}
            {diagnosing && (
              <div className="rounded-2xl border border-amber-500/40 bg-stone-900/90 p-5 space-y-4 shadow-xl animate-in fade-in duration-200">
                {/* 顶部加载动效与计时器 */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-stone-800">
                  <div className="flex items-center gap-3">
                    <LatticeLoader
                      status={diagnoseStatus}
                      label="AI 简历精修 Agent 正在深度诊断..."
                      doneLabel="精修完成"
                      errorLabel="诊断异常"
                      pattern="orbit"
                      grid={3}
                      shape="round"
                      doneColor="#22c55e"
                      errorColor="#ef4444"
                      cellSize={6}
                      gap={2}
                      fontSize={13}
                      step={90}
                      glow={true}
                      glowColor="rgba(245, 158, 11, 0.4)"
                      showTimer={true}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCancelDiagnosis}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-all cursor-pointer"
                  >
                    <X className="size-3" />
                    <span>取消本次诊断</span>
                  </button>
                </div>

                {/* 核心动态进度条与估时感知 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-200 flex items-center gap-1.5">
                      <TrendingUp className="size-3.5 text-amber-400" />
                      <span>正在执行诊断流水线 ({progressPercent}%)</span>
                    </span>
                    <span className="text-[11px] font-mono text-amber-400">
                      已耗时 {elapsedSeconds}s · 预计还需 ~{estimatedSeconds}s
                    </span>
                  </div>

                  {/* 进度条槽 */}
                  <div className="w-full h-2 rounded-full bg-stone-950 border border-stone-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* 4 阶段流水线步进器 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div
                    className={`p-2 rounded-xl border flex flex-col justify-between ${
                      currentStageIndex >= 0
                        ? "bg-stone-950 border-emerald-500/30 text-emerald-300"
                        : "bg-stone-950/40 border-stone-800 text-stone-500"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">1. ATS 扫描</span>
                      {currentStageIndex > 0 ? (
                        <CheckCircle className="size-3 text-emerald-400" />
                      ) : (
                        <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                      )}
                    </div>
                    <span className="text-[10px] text-stone-400">本地算法提取指标</span>
                  </div>

                  <div
                    className={`p-2 rounded-xl border flex flex-col justify-between ${
                      currentStageIndex >= 1
                        ? "bg-stone-950 border-emerald-500/30 text-emerald-300"
                        : "bg-stone-950/40 border-stone-800 text-stone-500"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">2. Skills 注入</span>
                      {currentStageIndex > 1 ? (
                        <CheckCircle className="size-3 text-emerald-400" />
                      ) : currentStageIndex === 1 ? (
                        <span className="size-2 rounded-full bg-blue-400 animate-ping" />
                      ) : null}
                    </div>
                    <span className="text-[10px] text-stone-400">STAR/XYZ 规则融合</span>
                  </div>

                  <div
                    className={`p-2 rounded-xl border flex flex-col justify-between ${
                      currentStageIndex >= 2
                        ? "bg-stone-950 border-amber-500/40 text-amber-300"
                        : "bg-stone-950/40 border-stone-800 text-stone-500"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">3. 经历重构</span>
                      {currentStageIndex > 2 ? (
                        <CheckCircle className="size-3 text-emerald-400" />
                      ) : currentStageIndex === 2 ? (
                        <span className="size-2 rounded-full bg-amber-400 animate-ping" />
                      ) : null}
                    </div>
                    <span className="text-[10px] text-stone-400">大模型生成对比</span>
                  </div>

                  <div
                    className={`p-2 rounded-xl border flex flex-col justify-between ${
                      currentStageIndex >= 3
                        ? "bg-stone-950 border-purple-500/40 text-purple-300"
                        : "bg-stone-950/40 border-stone-800 text-stone-500"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">4. 卡片组装</span>
                      {progressPercent === 100 ? (
                        <CheckCircle className="size-3 text-purple-400" />
                      ) : currentStageIndex === 3 ? (
                        <span className="size-2 rounded-full bg-purple-400 animate-ping" />
                      ) : null}
                    </div>
                    <span className="text-[10px] text-stone-400">Bullet Points 排版</span>
                  </div>
                </div>
              </div>
            )}

            {/* 状态 B: 本地即时 ATS 启发式算法评分看板 (未诊断或平时展示) */}
            {atsScore && !diagnosing && (
              <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 space-y-3">
                {/* 综合得分与标题 */}
                <div className="flex items-center justify-between pb-2.5 border-b border-stone-800">
                  <div className="flex items-center gap-2">
                    <Gauge className="size-4 text-emerald-400" />
                    <span className="text-xs font-bold text-stone-200">
                      ATS 算法指标体检 (本地即时计算)
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

                {/* 5 维度细分条形图 */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-stone-400">量化密度</span>
                      <span className="font-bold text-stone-200">{atsScore.dimensions.quantification}分</span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${atsScore.dimensions.quantification}%` }} />
                    </div>
                  </div>

                  <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-stone-400">动词力度</span>
                      <span className="font-bold text-stone-200">{atsScore.dimensions.action_verbs}分</span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${atsScore.dimensions.action_verbs}%` }} />
                    </div>
                  </div>

                  <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-stone-400">STAR 闭环</span>
                      <span className="font-bold text-stone-200">{atsScore.dimensions.star_logic}分</span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${atsScore.dimensions.star_logic}%` }} />
                    </div>
                  </div>

                  <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-stone-400">技术深度</span>
                      <span className="font-bold text-stone-200">{atsScore.dimensions.technical_depth}分</span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${atsScore.dimensions.technical_depth}%` }} />
                    </div>
                  </div>

                  <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80 col-span-2 sm:col-span-1">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-stone-400">排版质量</span>
                      <span className="font-bold text-stone-200">{atsScore.dimensions.readability}分</span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${atsScore.dimensions.readability}%` }} />
                    </div>
                  </div>
                </div>

                {/* 统计指标与亮点徽章 */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    ⚡ 强动词: {atsScore.strong_verbs_count} 个
                  </span>
                  <span className={`px-2 py-0.5 rounded-md border ${atsScore.weak_verbs_count > 0 ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-stone-800 border-stone-700 text-stone-400"}`}>
                    ⚠️ 待优化词: {atsScore.weak_verbs_count} 个
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300">
                    📊 量化点: {atsScore.metrics_count} 处
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-stone-800 border border-stone-700 text-stone-400 font-mono">
                    总词数: {atsScore.word_count} 字
                  </span>
                </div>

                {/* 优势与改进建议标签 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                  {atsScore.highlights.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" />
                        <span>检测到的亮点</span>
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {atsScore.highlights.map((h, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
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
                        <span>待优化项</span>
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {atsScore.issues.map((issue, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/30 text-amber-300">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 状态 C: 诊断成果报告与一键复制 */}
            {diagnoseResult && diagnoseResult.polish_advice && !diagnosing && (
              <div className="rounded-2xl border border-amber-500/40 bg-stone-900/80 p-4 space-y-3 shadow-lg animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-amber-400" />
                    <span className="text-xs font-bold text-stone-100">AI 深度精修报告与 STAR 改写成果</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyAdvice}
                    className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400 text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5" />
                        <span>已复制到剪贴板</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        <span>一键复制精修文本</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 成果正文展示 */}
                <div className="max-h-[360px] overflow-y-auto pr-1 text-xs text-stone-200 leading-relaxed font-sans whitespace-pre-wrap rounded-xl bg-stone-950/90 p-3.5 border border-stone-800/80">
                  {diagnoseResult.polish_advice}
                </div>

                {/* 持续追问对话区 */}
                <div className="pt-2 border-t border-stone-800/80 space-y-2">
                  <span className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
                    <Bot className="size-3.5 text-amber-400" />
                    <span>继续追问微调</span>
                  </span>

                  {polishChatMessages.length > 1 && (
                    <div className="max-h-36 overflow-y-auto space-y-2 pr-1 text-xs">
                      {polishChatMessages.slice(1).map((msg, idx) => (
                        <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-1.5 text-xs whitespace-pre-wrap ${
                              msg.role === "user"
                                ? "bg-amber-500 text-stone-950 font-medium"
                                : "bg-stone-950 border border-stone-800 text-stone-200"
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

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
                      placeholder="继续提出要求，例如：帮我把第2段缩短一点 / 针对腾讯面试怎么介绍？"
                      className="flex-1 rounded-xl bg-stone-950 border border-stone-800 px-3 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="button"
                      onClick={handleFollowUpSend}
                      disabled={followUpPending || !followUpInput.trim()}
                      className="size-7 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center hover:bg-amber-400 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      <Send className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模式 B: 求职意向画像 (Agent 1 意向管家) 极简界面                             */}
      {/* ========================================================================= */}
      {panelMode === "copilot" && (
        <div className="space-y-3.5 max-w-4xl mx-auto">
          {/* 对话区 */}
          <div ref={listRef} className="h-60 overflow-y-auto space-y-3.5 pr-1.5 text-xs">
            {agentMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <div className="size-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-2 border border-amber-500/20">
                  <Bot className="h-5 w-5 text-amber-400" />
                </div>
                <p className="text-sm font-bold text-stone-100 mb-1">说出你的背景，AI 替你规划投递</p>
                <p className="text-xs text-stone-400 max-w-sm leading-relaxed">
                  说出你的专业、意向城市与薪资期待，大模型自动提炼最优关键词与排查规则。
                </p>
              </div>
            ) : (
              agentMessages.map((msg, index) => {
                const isUser = msg.role === "user";
                return (
                  <div key={index} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <div className="size-7 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs shrink-0">
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
                      <div className="size-7 rounded-xl bg-stone-800 border border-stone-700 text-stone-300 flex items-center justify-center text-xs shrink-0">
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
        </div>
      )}

      {message && <p className="text-xs text-amber-400 mt-2">{message}</p>}
    </MagicCard>
  );
}
