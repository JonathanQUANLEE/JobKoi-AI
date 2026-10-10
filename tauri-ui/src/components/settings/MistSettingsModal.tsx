import { useEffect, useState } from "react";
import {
  X,
  SlidersHorizontal,
  ShieldCheck,
  MessageSquareQuote,
  Bot,
  Check,
  Sparkles,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { ipc, type LLMConfig } from "../../lib/ipc";
import type { RuleForm } from "../../lib/profileForm";
import { useRunStore } from "../../store";
import "./MistSettingsModal.css";

export type MistModalType = "rules" | "policy" | "greeting" | "model" | null;

interface MistSettingsModalProps {
  type: MistModalType;
  onClose: () => void;
  // 表单与配置数据
  currentProfileData?: Record<string, unknown> | (() => Record<string, unknown>);
  onSaveProfileData?: (data: Record<string, unknown>) => void;
  rule?: string | RuleForm;
  setRule?: any;
  dailyLimit?: string;
  setDailyLimit?: (val: string) => void;
  delayMin?: string | number;
  setDelayMin?: (val: string) => void;
  delayMax?: string | number;
  setDelayMax?: (val: string) => void;
  dryRun?: boolean;
  setDryRun?: (val: boolean) => void;
  greeting?: string;
  setGreeting?: (val: string) => void;
  onSaveConfig?: () => Promise<void>;
}

export default function MistSettingsModal({
  type,
  onClose,
  currentProfileData,
  onSaveProfileData,
  rule = "",
  setRule,
  dailyLimit = "100",
  setDailyLimit,
  delayMin = "3",
  setDelayMin,
  delayMax = "6",
  setDelayMax,
  dryRun = false,
  setDryRun,
  greeting = "",
  setGreeting,
  onSaveConfig,
}: MistSettingsModalProps) {
  const llmConfig = useRunStore((s) => s.llmConfig);
  const setLLMConfig = useRunStore((s) => s.setLLMConfig);
  const notify = useRunStore((s) => s.notify);

  const getRuleString = (r: string | RuleForm | undefined): string => {
    if (!r) return "";
    if (typeof r === "string") return r;
    return r.excludeKeywords || "";
  };

  // 本地临时编辑状态
  const [localRule, setLocalRule] = useState<string>(() => getRuleString(rule));
  const [localDailyLimit, setLocalDailyLimit] = useState(String(dailyLimit));
  const [localDelayMin, setLocalDelayMin] = useState(String(delayMin));
  const [localDelayMax, setLocalDelayMax] = useState(String(delayMax));
  const [localDryRun, setLocalDryRun] = useState(dryRun);
  const [localGreeting, setLocalGreeting] = useState(greeting);

  // 大模型设置状态（已彻底移除冗余无用的预设配置）
  const [baseUrl, setBaseUrl] = useState(llmConfig?.base_url || "https://openrouter.ai/api/v1");
  const [apiKey, setApiKey] = useState(llmConfig?.api_key || "");
  const [model, setModel] = useState(llmConfig?.model || "nvidia/nemotron-3.5-lightning:free");
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ESC 键随时退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 同步外部状态
  useEffect(() => {
    setLocalRule(getRuleString(rule));
    setLocalDailyLimit(String(dailyLimit));
    setLocalDelayMin(String(delayMin));
    setLocalDelayMax(String(delayMax));
    setLocalDryRun(dryRun);
    setLocalGreeting(greeting);
    if (llmConfig) {
      setBaseUrl(llmConfig.base_url || "https://openrouter.ai/api/v1");
      setApiKey(llmConfig.api_key || "");
      setModel(llmConfig.model || "nvidia/nemotron-3.5-lightning:free");
    }
  }, [rule, dailyLimit, delayMin, delayMax, dryRun, greeting, llmConfig]);

  if (!type) return null;

  // 保存过滤规则
  const handleSaveRules = () => {
    if (typeof rule === "object" && rule !== null) {
      setRule?.((prev: RuleForm) => ({ ...prev, excludeKeywords: localRule }));
    } else {
      setRule?.(localRule);
    }
    const resolvedProfile = typeof currentProfileData === "function" ? currentProfileData() : currentProfileData;
    if (resolvedProfile && onSaveProfileData) {
      const updated = { ...resolvedProfile, rule: localRule };
      onSaveProfileData(updated);
    }
    onSaveConfig?.().catch(() => {});
    notify({ type: "success", text: "过滤与避坑规则已保存" });
    onClose();
  };

  // 保存投递与安全防风控
  const handleSavePolicy = () => {
    setDailyLimit?.(localDailyLimit);
    setDelayMin?.(localDelayMin);
    setDelayMax?.(localDelayMax);
    setDryRun?.(localDryRun);
    const resolvedProfile = typeof currentProfileData === "function" ? currentProfileData() : currentProfileData;
    if (resolvedProfile && onSaveProfileData) {
      const updated = {
        ...resolvedProfile,
        daily_limit: localDailyLimit,
        delay_min: localDelayMin,
        delay_max: localDelayMax,
        dry_run: localDryRun,
      };
      onSaveProfileData(updated);
    }
    onSaveConfig?.().catch(() => {});
    notify({ type: "success", text: "投递频率与防风控保护策略已生效" });
    onClose();
  };

  // 保存招呼语
  const handleSaveGreeting = () => {
    setGreeting?.(localGreeting);
    ipc.saveGreeting(localGreeting).catch(() => {});
    onSaveConfig?.().catch(() => {});
    notify({ type: "success", text: "打招呼问候模板已更新" });
    onClose();
  };

  // 保存模型设置
  const handleSaveModel = async () => {
    try {
      const res = await ipc.saveLLMConfig(baseUrl.trim(), apiKey.trim(), model.trim());
      if (res.status === "ok") {
        setLLMConfig({
          base_url: baseUrl.trim(),
          api_key: res.api_key || apiKey.trim(),
          model: model.trim(),
          configured: true,
          presets: llmConfig?.presets || [],
        });
        notify({ type: "success", text: "AI 大模型配置保存成功" });
        onClose();
      }
    } catch (err) {
      notify({ type: "error", text: `保存失败: ${String(err)}` });
    }
  };

  // 测试模型可用性
  const handleTestModel = async () => {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, msg: "请先填写 API Key" });
      return;
    }
    setTestingModel(true);
    setTestResult(null);
    try {
      // 临时保存并测一次轻量请求
      await ipc.saveLLMConfig(baseUrl.trim(), apiKey.trim(), model.trim());
      const res = await ipc.agentChat("你好，测试连接是否畅通", [], {});
      if (res.status === "ok") {
        setTestResult({ ok: true, msg: "模型连接测试成功！响应正常" });
        setLLMConfig({
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          model: model.trim(),
          configured: true,
          presets: llmConfig?.presets || [],
        });
      } else {
        setTestResult({ ok: false, msg: `连接测试失败: ${res.message || "未知错误"}` });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: `连接异常: ${String(err)}` });
    } finally {
      setTestingModel(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      {/* 方案 A: 中央椭圆渐隐雾化背景（无矩形边框限制，偏透明质感） */}
      <div className="settings-mist" />

      {/* 方案 A + B: 悬浮从雾气中平滑浮现的内容区 */}
      <div
        className="settings-content text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部悬浮标题与极简退出按钮 */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="floating-title">
            {type === "rules" && <SlidersHorizontal className="size-5 text-amber-400" />}
            {type === "policy" && <ShieldCheck className="size-5 text-blue-400" />}
            {type === "greeting" && <MessageSquareQuote className="size-5 text-emerald-400" />}
            {type === "model" && <Bot className="size-5 text-purple-400" />}

            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                {type === "rules" && "岗位过滤与避坑偏好"}
                {type === "policy" && "投递安全与防风控保护"}
                {type === "greeting" && "个性化招呼语与问候模板"}
                {type === "model" && "AI 大模型配置"}
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                {type === "rules" && "设置不想看到的行业、关键词或黑名单，让投递更顺心"}
                {type === "policy" && "基于拟人化生物节奏算法，保护账号不被招聘平台风控判定"}
                {type === "greeting" && "自动投递时发送给 HR 的首条消息，好的开场白回复率提升 3 倍"}
                {type === "model" && "绑定 API Key，解锁自然语言提炼画像与简历 STAR 深度精修"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center size-8 rounded-full bg-white/5 hover:bg-white/15 text-stone-400 hover:text-white transition-all cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* -------------------- 弹窗 1: 过滤规则设置 (通俗自然语言，文科生零门槛) -------------------- */}
        {type === "rules" && (
          <div className="py-4 space-y-5">
            <div className="mist-setting-row">
              <label className="text-xs font-semibold text-stone-200">
                排除词 / 避坑标签 (包含这些词的岗位直接跳过)
              </label>
              <p className="text-[11px] text-stone-400 leading-relaxed">
                用逗号或空格隔开。例如：<code className="text-amber-300 font-mono">外包 电话销售 培训 单休 大小周 夜班</code>
              </p>
              <textarea
                rows={3}
                value={localRule}
                onChange={(e) => setLocalRule(e.target.value)}
                placeholder="例如：外包, 催收, 兼职, 电话销售, 招转培, 单休, 大小周"
                className="mist-input font-mono text-xs leading-relaxed"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed">
              💡 <strong>贴心提示</strong>：目标岗位、期望城市与薪资范围已经在【求职画像】中由 AI 顾问为你自动打理，这里只需填写你“最不想去的公司类型或讨厌的关键词”即可，无需重复配置复杂专业条件。
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-white transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveRules}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                保存过滤偏好
              </button>
            </div>
          </div>
        )}

        {/* -------------------- 弹窗 2: 投递设置与安全 (通俗解释为什么需要防风控) -------------------- */}
        {type === "policy" && (
          <div className="py-4 space-y-5">
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200/90 leading-relaxed">
              🛡️ <strong>为什么需要防风控保护？</strong><br />
              各大招聘平台（BOSS直聘等）均部署有严格的机械人爬虫检测。本软件内置<strong>泊松过程拟人化等待与贝塞尔平滑轨迹</strong>，每次沟通间隔随机浮动，高度还原真实人类操作节奏，确保您的账号安全无忧。
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="mist-setting-row">
                <label className="text-xs font-semibold text-stone-200">
                  每日投递安全上限 (家/天)
                </label>
                <p className="text-[11px] text-stone-400">
                  建议设为 50~100 次，避免过度频繁被平台限流
                </p>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={localDailyLimit}
                  onChange={(e) => setLocalDailyLimit(e.target.value)}
                  className="mist-input text-xs font-mono"
                />
              </div>

              <div className="mist-setting-row">
                <label className="text-xs font-semibold text-stone-200">
                  拟人化等待时间区间 (秒)
                </label>
                <p className="text-[11px] text-stone-400">
                  每次打招呼后的随机停留时间（推荐 3 ~ 6 秒）
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={localDelayMin}
                    onChange={(e) => setLocalDelayMin(e.target.value)}
                    className="mist-input text-xs font-mono text-center"
                  />
                  <span className="text-stone-500 text-xs">至</span>
                  <input
                    type="number"
                    min="3"
                    max="20"
                    value={localDelayMax}
                    onChange={(e) => setLocalDelayMax(e.target.value)}
                    className="mist-input text-xs font-mono text-center"
                  />
                  <span className="text-stone-400 text-xs">秒</span>
                </div>
              </div>
            </div>

            <div className="mist-setting-row flex-row items-center justify-between border-t border-white/10 pt-3">
              <div>
                <span className="text-xs font-semibold text-stone-200 block">
                  演练试跑模式 (Dry Run)
                </span>
                <span className="text-[11px] text-stone-400">
                  开启后仅模拟筛选与匹配流程，不会真正向 HR 发出招呼语，新手推荐先演练体验
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLocalDryRun(!localDryRun)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  localDryRun ? "bg-amber-500" : "bg-stone-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    localDryRun ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-white transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSavePolicy}
                className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-stone-950 font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                保存安全设置
              </button>
            </div>
          </div>
        )}

        {/* -------------------- 弹窗 3: 打招呼模板 (高情商开场白模板) -------------------- */}
        {type === "greeting" && (
          <div className="py-4 space-y-4">
            <div className="mist-setting-row">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-200">
                  招呼语内容 (支持动态变量插入)
                </label>
                <span className="text-[11px] text-stone-400 font-mono">
                  可用变量: {"{name}"} 姓名 · {"{job}"} 岗位名
                </span>
              </div>
              <textarea
                rows={4}
                value={localGreeting}
                onChange={(e) => setLocalGreeting(e.target.value)}
                placeholder="您好！看到贵司正在招聘{job}岗位，我的专业与技能非常契合，这是我的简历，期待能与您进一步沟通交流！"
                className="mist-input text-xs leading-relaxed"
              />
            </div>

            {/* 快速选用推荐高回复率模板 */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-stone-400">
                精选高情商开箱模板 (点击快速填入)：
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setLocalGreeting(
                      "您好！看到贵司在招{job}岗位，我对贵司的发展非常向往。我的专业背景与核心技能高度契合，附上我的详细简历，期待与您深入沟通！"
                    )
                  }
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left text-[11px] text-stone-300 transition-all cursor-pointer"
                >
                  <span className="font-bold text-emerald-400 block mb-0.5">🎓 诚恳求职模板 (应届/实习)</span>
                  <p className="line-clamp-2 text-stone-400">突出向往与背景契合度，措辞谦逊专业...</p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setLocalGreeting(
                      "您好，关注到贵司的{job}职位。我有扎实的工程落地与项目经验，深耕核心技术栈，希望能协助贵团队达成业务目标，期待进一步交流！"
                    )
                  }
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left text-[11px] text-stone-300 transition-all cursor-pointer"
                >
                  <span className="font-bold text-amber-400 block mb-0.5">💼 经验实战模板 (社招/跳槽)</span>
                  <p className="line-clamp-2 text-stone-400">强调落地成果与技术积累，直奔主题...</p>
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-white transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveGreeting}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                保存招呼语
              </button>
            </div>
          </div>
        )}

        {/* -------------------- 弹窗 4: AI 大模型配置 (删掉无用的预设配置) -------------------- */}
        {type === "model" && (
          <div className="py-4 space-y-4">
            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200/90 leading-relaxed">
              ✨ <strong>推荐配置 (支持免费 OpenRouter 专属模型)</strong><br />
              已为你预设免费高性价比模型 <code className="text-purple-300 font-mono">nvidia/nemotron-3.5-lightning:free</code>，支持 100万 超长上下文，每天可免费享受 50 次深度简历体检与改写！
            </div>

            <div className="mist-setting-row">
              <label className="text-xs font-semibold text-stone-200">
                API Base URL (接口端点地址)
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                className="mist-input text-xs font-mono"
              />
            </div>

            <div className="mist-setting-row">
              <label className="text-xs font-semibold text-stone-200">
                API Key (密钥令牌)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="mist-input text-xs font-mono"
              />
            </div>

            <div className="mist-setting-row">
              <label className="text-xs font-semibold text-stone-200">
                模型名称 (Model Identifier)
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="nvidia/nemotron-3.5-lightning:free"
                className="mist-input text-xs font-mono"
              />
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  testResult.ok
                    ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-950/60 border-rose-500/30 text-rose-300"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-rose-400" />
                )}
                <span>{testResult.msg}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestModel}
                disabled={testingModel}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="size-3.5 text-purple-400" />
                <span>{testingModel ? "正在测试连接..." : "测试连接状态"}</span>
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-white transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveModel}
                  className="px-5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  保存配置
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
