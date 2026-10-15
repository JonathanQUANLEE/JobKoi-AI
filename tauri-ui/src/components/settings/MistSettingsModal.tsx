import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FilterIcon,
  ShieldCheckIcon,
  Comment01Icon,
  CpuIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { ipc } from "../../lib/ipc";
import type { RuleForm } from "../../lib/profileForm";
import { useRunStore } from "../../store";
import RulesSettingsView from "./views/RulesSettingsView";
import PolicySettingsView from "./views/PolicySettingsView";
import GreetingSettingsView from "./views/GreetingSettingsView";
import ModelSettingsView from "./views/ModelSettingsView";
import "./MistSettingsModal.css";

export type MistModalType = "rules" | "policy" | "greeting" | "model" | null;

interface MistSettingsModalProps {
  type: MistModalType;
  onClose: () => void;
  rule?: string | RuleForm;
  setRule?: any;
  dailyLimit?: string;
  setDailyLimit?: (val: string) => void;
  delayMin?: string | number;
  setDelayMin?: (val: string) => void;
  delayMax?: string | number;
  setDelayMax?: (val: string) => void;
  /** 分平台拟人化节奏（2026-10-13）：空串 = 跟随通用档。 */
  liepinDelayMin?: string | number;
  setLiepinDelayMin?: (val: string) => void;
  liepinDelayMax?: string | number;
  setLiepinDelayMax?: (val: string) => void;
  job51DelayMin?: string | number;
  setJob51DelayMin?: (val: string) => void;
  job51DelayMax?: string | number;
  setJob51DelayMax?: (val: string) => void;
  greeting?: string;
  setGreeting?: (val: string) => void;
  onSaveConfig?: () => Promise<boolean>;
}

export default function MistSettingsModal({
  type,
  onClose,
  rule = "",
  setRule,
  dailyLimit = "100",
  setDailyLimit,
  delayMin = "20",
  setDelayMin,
  delayMax = "40",
  setDelayMax,
  liepinDelayMin = "",
  setLiepinDelayMin,
  liepinDelayMax = "",
  setLiepinDelayMax,
  job51DelayMin = "",
  setJob51DelayMin,
  job51DelayMax = "",
  setJob51DelayMax,
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
  const [localLiepinDelayMin, setLocalLiepinDelayMin] = useState(String(liepinDelayMin ?? ""));
  const [localLiepinDelayMax, setLocalLiepinDelayMax] = useState(String(liepinDelayMax ?? ""));
  const [localJob51DelayMin, setLocalJob51DelayMin] = useState(String(job51DelayMin ?? ""));
  const [localJob51DelayMax, setLocalJob51DelayMax] = useState(String(job51DelayMax ?? ""));
  const [localGreeting, setLocalGreeting] = useState(greeting);

  // 大模型设置状态（V0.4：默认智谱 GLM-4-Flash，OpenRouter 作为第二推荐可切换）
  const [baseUrl, setBaseUrl] = useState(llmConfig?.base_url || "https://open.bigmodel.cn/api/paas/v4");
  const [apiKey, setApiKey] = useState(llmConfig?.api_key || "");
  const [model, setModel] = useState(llmConfig?.model || "glm-4-flash");
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ESC 键退出
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
    setLocalLiepinDelayMin(String(liepinDelayMin ?? ""));
    setLocalLiepinDelayMax(String(liepinDelayMax ?? ""));
    setLocalJob51DelayMin(String(job51DelayMin ?? ""));
    setLocalJob51DelayMax(String(job51DelayMax ?? ""));
    setLocalGreeting(greeting);
    if (llmConfig) {
      setBaseUrl(llmConfig.base_url || "https://open.bigmodel.cn/api/paas/v4");
      setApiKey(llmConfig.api_key || "");
      setModel(llmConfig.model || "glm-4-flash");
    }
  }, [rule, dailyLimit, delayMin, delayMax, liepinDelayMin, liepinDelayMax, job51DelayMin, job51DelayMax, greeting, llmConfig]);

  if (!type) return null;

  // 保存过滤规则
  const handleSaveRules = () => {
    if (typeof rule === "object" && rule !== null) {
      setRule?.((prev: RuleForm) => ({ ...prev, excludeKeywords: localRule }));
    } else {
      setRule?.(localRule);
    }
    // 时序坑（2026-10-12 事故）：React 18 批处理下，同一事件处理器里
    // currentProfileData() 读到的还是 setState 之前的旧表单——旧值快照
    // 经 hydrate/saveConfig 会把刚设的新值又盖回去（用户实测"保存后重开
    // 弹窗又回到旧档"的根因）。正确姿势：只更新表单状态，等生效后再落盘。
    window.setTimeout(() => onSaveConfig?.().catch(() => {}), 0);
    useRunStore.getState().showCenterToast("规则已保存", { tone: "success" });
    notify({ type: "success", text: "过滤与避坑规则已保存" });
    onClose();
  };

  // 保存投递与安全防风控
  const handleSavePolicy = () => {
    setDailyLimit?.(localDailyLimit);
    setDelayMin?.(localDelayMin);
    setDelayMax?.(localDelayMax);
    setLiepinDelayMin?.(localLiepinDelayMin);
    setLiepinDelayMax?.(localLiepinDelayMax);
    setJob51DelayMin?.(localJob51DelayMin);
    setJob51DelayMax?.(localJob51DelayMax);
    window.setTimeout(() => onSaveConfig?.().catch(() => {}), 0);
    useRunStore.getState().showCenterToast("安全设置已保存", { tone: "success" });
    notify({ type: "success", text: "投递频率与防风控保护策略已生效" });
    onClose();
  };

  // 保存招呼语
  const handleSaveGreeting = () => {
    setGreeting?.(localGreeting);
    ipc.saveGreeting(localGreeting).catch(() => {});
    window.setTimeout(() => onSaveConfig?.().catch(() => {}), 0);
    useRunStore.getState().showCenterToast("招呼语已保存", { tone: "success" });
    notify({ type: "success", text: "打招呼问候模板已更新" });
    onClose();
  };

  // 保存模型设置
  const handleSaveModel = async () => {
    try {
      const res = await ipc.saveLLMConfig(baseUrl.trim(), apiKey.trim(), model.trim());
      // 后端 save_llm_config 成功返回 status="saved"（出错抛异常走 catch）。
      // 老代码判 "ok" 永远不成立且无 else → 点"保存配置"毫无反应，
      // 用户实测"没办法保存"的根因（2026-10-14 修复；保留 "ok" 双兼容）。
      if (res.status === "saved" || res.status === "ok") {
        setLLMConfig({
          base_url: baseUrl.trim(),
          api_key: res.api_key || apiKey.trim(),
          model: model.trim(),
          configured: res.configured ?? true,
          presets: llmConfig?.presets || [],
        });
        useRunStore.getState().showCenterToast("模型配置已保存", { tone: "success" });
        notify({ type: "success", text: "AI 大模型配置保存成功" });
        onClose();
      } else {
        notify({ type: "error", text: `保存失败: ${res.status}` });
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
      <div className="settings-mist" />

      <div
        className="settings-content text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部悬浮标题与极简退出按钮 */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="floating-title">
            {type === "rules" && <HugeiconsIcon icon={FilterIcon} size={22} className="text-amber-400 shrink-0" />}
            {type === "policy" && <HugeiconsIcon icon={ShieldCheckIcon} size={22} className="text-blue-400 shrink-0" />}
            {type === "greeting" && <HugeiconsIcon icon={Comment01Icon} size={22} className="text-emerald-400 shrink-0" />}
            {type === "model" && <HugeiconsIcon icon={CpuIcon} size={22} className="text-purple-400 shrink-0" />}

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
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        {/* 弹窗 1: 过滤规则设置 */}
        {type === "rules" && (
          <RulesSettingsView
            localRule={localRule}
            setLocalRule={setLocalRule}
            onSave={handleSaveRules}
            onClose={onClose}
          />
        )}

        {/* 弹窗 2: 投递设置与安全 */}
        {type === "policy" && (
          <PolicySettingsView
            localDailyLimit={localDailyLimit}
            setLocalDailyLimit={setLocalDailyLimit}
            localDelayMin={localDelayMin}
            setLocalDelayMin={setLocalDelayMin}
            localDelayMax={localDelayMax}
            setLocalDelayMax={setLocalDelayMax}
            localLiepinDelayMin={localLiepinDelayMin}
            setLocalLiepinDelayMin={setLocalLiepinDelayMin}
            localLiepinDelayMax={localLiepinDelayMax}
            setLocalLiepinDelayMax={setLocalLiepinDelayMax}
            localJob51DelayMin={localJob51DelayMin}
            setLocalJob51DelayMin={setLocalJob51DelayMin}
            localJob51DelayMax={localJob51DelayMax}
            setLocalJob51DelayMax={setLocalJob51DelayMax}
            onSave={handleSavePolicy}
            onClose={onClose}
          />
        )}

        {/* 弹窗 3: 打招呼模板 */}
        {type === "greeting" && (
          <GreetingSettingsView
            localGreeting={localGreeting}
            setLocalGreeting={setLocalGreeting}
            onSave={handleSaveGreeting}
            onClose={onClose}
          />
        )}

        {/* 弹窗 4: AI 大模型配置 */}
        {type === "model" && (
          <ModelSettingsView
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            presets={llmConfig?.presets || []}
            testingModel={testingModel}
            testResult={testResult}
            onTestModel={handleTestModel}
            onSave={handleSaveModel}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
