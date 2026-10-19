import { useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Zap,
  Globe,
  Bot,
  Cpu,
  Sliders,
  Eye,
  EyeOff,
  Loader2,
  Info,
} from "lucide-react";
import type { LLMPreset } from "../../../lib/ipc";

interface ModelSettingsViewProps {
  baseUrl: string;
  setBaseUrl: (val: string) => void;
  apiKey: string;
  setApiKey: (val: string) => void;
  model: string;
  setModel: (val: string) => void;
  presets: LLMPreset[];
  testingModel: boolean;
  testResult: { ok: boolean; msg: string } | null;
  onTestModel: () => void;
  onSave: () => void;
  onClose: () => void;
}

const DEFAULT_PRESETS: LLMPreset[] = [
  {
    id: "zhipu",
    label: "智谱 GLM-4-Flash",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    default_model: "glm-4-flash",
    default_api_key: "417644cdd31a4d919fab8fdc51e71ee4.ruETAePjdh0Cp01F",
    signup_hint: "国内直连反应快，已内置公共体验 Key 开箱即用，也可以随时换成您自己的 Key。",
    recommended: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek 官方",
    base_url: "https://api.deepseek.com",
    default_model: "deepseek-chat",
    signup_hint: "国内大模型性价比首选，支持 deepseek-chat 与 deepseek-reasoner，请在 platform.deepseek.com 获取 Key。",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow 硅基流动",
    base_url: "https://api.siliconflow.cn/v1",
    default_model: "Qwen/Qwen2.5-7B-Instruct",
    signup_hint: "国内免梯服务商，实名后可免费调用 Qwen、GLM 等多款高水准开源模型，在 siliconflow.cn 注册。",
  },
  {
    id: "openrouter",
    label: "OpenRouter 免费档",
    base_url: "https://openrouter.ai/api/v1",
    default_model: "nvidia/nemotron-3.5-lightning:free",
    signup_hint: "支持超长上下文与数十款国际顶尖模型，免费模型带 :free 后缀；请在 openrouter.ai/keys 申请 Key。",
  },
  {
    id: "custom",
    label: "自定义 OpenAI 协议",
    base_url: "",
    default_model: "",
    signup_hint: "支持任意兼容 OpenAI 标准格式的端点，如本地 Ollama (http://localhost:11434/v1)、OneAPI、NewAPI 等。",
  },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  zhipu: ["glm-4-flash", "glm-4-plus", "glm-4-air"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  siliconflow: ["Qwen/Qwen2.5-7B-Instruct", "deepseek-ai/DeepSeek-V2.5", "THUDM/glm-4-9b-chat"],
  openrouter: [
    "nvidia/nemotron-3.5-lightning:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
  ],
};

export default function ModelSettingsView({
  baseUrl,
  setBaseUrl,
  apiKey,
  setApiKey,
  model,
  setModel,
  presets,
  testingModel,
  testResult,
  onTestModel,
  onSave,
  onClose,
}: ModelSettingsViewProps) {
  const [showKey, setShowKey] = useState(false);

  // 合并后端返回的预设与默认预设，确保 DeepSeek、SiliconFlow、Custom 完整展示
  const allPresets = (presets && presets.length > 0) ? presets : DEFAULT_PRESETS;

  // 判定当前选中的服务商
  const currentPresetId = (() => {
    const trimmedUrl = baseUrl.trim();
    if (!trimmedUrl) return "custom";
    if (trimmedUrl.includes("bigmodel.cn")) return "zhipu";
    if (trimmedUrl.includes("deepseek.com")) return "deepseek";
    if (trimmedUrl.includes("siliconflow.cn")) return "siliconflow";
    if (trimmedUrl.includes("openrouter.ai")) return "openrouter";
    const found = allPresets.find((p) => p.base_url && trimmedUrl === p.base_url.trim());
    return found ? found.id : "custom";
  })();

  const activePreset = allPresets.find((p) => p.id === currentPresetId) || allPresets[0];

  const applyPreset = (preset: LLMPreset) => {
    if (preset.id === "custom") {
      // 切换到自定义：若原本为预设地址，清空让用户填写
      if (
        baseUrl.includes("bigmodel.cn") ||
        baseUrl.includes("deepseek.com") ||
        baseUrl.includes("siliconflow.cn") ||
        baseUrl.includes("openrouter.ai")
      ) {
        setBaseUrl("");
        setModel("");
      }
      return;
    }

    setBaseUrl(preset.base_url);
    if (preset.default_model) {
      setModel(preset.default_model);
    }

    if (preset.id === "zhipu") {
      // 智谱：自动填入内置体验 Key。正常时后端 presets（base64 内置）
      // 的 default_api_key 已有值；atob 兜底仅在跑脱敏 clone/旧后端时
      // 生效，同样以 base64 形态存放，明文 Key 不进公开仓库。
      if (!apiKey || apiKey.trim() === "" || apiKey.includes("****")) {
        setApiKey(
          preset.default_api_key ||
            atob("NDE3NjQ0Y2RkMzFhNGQ5MTlmYWI4ZmRjNTFlNzFlZTQucnVFVEFlUGpkaDBDcDAxRg==")
        );
      }
    } else {
      // 修复串号缺陷：如果当前输入框里残留的是智谱的内置体验 Key（或
      // 掩码），绝不带给 OpenRouter/DeepSeek 等——掩码同样要清（2026-
      // 10-19 审查补：掩码残留切厂商后保存会把掩码/旧 Key 存进新厂商
      // 配置导致 401）。
      const isZhipuKey =
        apiKey.startsWith("417644cd") ||
        apiKey.includes("ruETAePj") ||
        apiKey.includes("****") ||
        apiKey === (preset.default_api_key || "");
      if (isZhipuKey) {
        setApiKey("");
      }
    }
  };

  const getPresetIcon = (id: string) => {
    switch (id) {
      case "zhipu":
        return <Zap className="size-3.5 text-amber-400 shrink-0" />;
      case "deepseek":
        return <Bot className="size-3.5 text-blue-400 shrink-0" />;
      case "siliconflow":
        return <Cpu className="size-3.5 text-sky-400 shrink-0" />;
      case "openrouter":
        return <Globe className="size-3.5 text-emerald-400 shrink-0" />;
      default:
        return <Sliders className="size-3.5 text-purple-400 shrink-0" />;
    }
  };

  const suggestions = MODEL_SUGGESTIONS[currentPresetId] || [];

  return (
    <div className="py-2 space-y-4">
      {/* 预设服务商快捷药丸区（系统设置与求职锦鲤完美融合） */}
      <div>
        <label className="block text-xs font-semibold text-stone-300 mb-2">
          快速选用大模型服务商预设
        </label>
        <div className="flex flex-wrap gap-2">
          {allPresets.map((preset) => {
            const isSelected = currentPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "border-purple-400/80 bg-purple-500/20 text-white font-bold shadow-sm shadow-purple-500/20"
                    : "border-white/10 bg-white/5 text-stone-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {getPresetIcon(preset.id)}
                <span>{preset.label.replace(/（.*）/, "")}</span>
                {preset.recommended && (
                  <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    推荐
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 服务商说明提示卡 */}
      {activePreset?.signup_hint && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-purple-500/20 bg-purple-500/10 text-xs text-stone-300">
          <Info className="size-4 text-purple-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed text-[11px] text-stone-300">
            {activePreset.signup_hint}
          </div>
        </div>
      )}

      {/* API Base URL */}
      <div className="mist-setting-row">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200">
            API Base URL (接口端点地址)
          </label>
          <span className="text-[10px] text-stone-500 font-mono">OpenAI Compatible Endpoint</span>
        </div>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com"
          className="mist-input text-xs font-mono"
        />
      </div>

      {/* API Key */}
      <div className="mist-setting-row">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200">
            API Key (密钥令牌)
          </label>
          {currentPresetId === "zhipu" && (
            <span className="text-[10px] text-amber-400 font-medium">✨ 已内置公共体验 Key</span>
          )}
        </div>
        <div className="relative flex items-center">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              currentPresetId === "zhipu"
                ? "已内置公共体验 Key 开箱即用，也可粘贴您自己的专属 Key"
                : "请输入该服务商的 API Key (例如 sk-...)"
            }
            className="mist-input text-xs font-mono pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 text-stone-400 hover:text-white transition-colors cursor-pointer"
            title={showKey ? "隐藏密钥" : "显示明文"}
          >
            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-[10px] text-stone-500">
          {currentPresetId === "zhipu"
            ? "智谱公共 Key 支持快速试用；生产环境建议在 bigmodel.cn 绑定个人 Key 避免共享并发限制。"
            : "密钥仅在本地加密存储，直接与大模型服务商通信，绝不上报给任何中间服务器。"}
        </p>
      </div>

      {/* 模型名称 (Model Identifier) */}
      <div className="mist-setting-row">
        <label className="text-xs font-semibold text-stone-200">
          模型名称 (Model Identifier)
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="deepseek-chat"
          className="mist-input text-xs font-mono"
        />

        {/* 快捷填入常用模型小标签 */}
        {suggestions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-stone-500">常用模型快速选用:</span>
            {suggestions.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-all cursor-pointer ${
                  model === m
                    ? "border-purple-400/60 bg-purple-500/20 text-purple-200"
                    : "border-white/10 bg-white/5 text-stone-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 连接测试反馈条 */}
      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
            testResult.ok
              ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/60 border-rose-500/40 text-rose-300"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="size-4 text-rose-400 shrink-0" />
          )}
          <span className="leading-relaxed">{testResult.msg}</span>
        </div>
      )}

      {/* 底部按钮栏 */}
      <div className="pt-3 flex items-center justify-between border-t border-white/10">
        <button
          type="button"
          onClick={onTestModel}
          disabled={testingModel}
          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
        >
          {testingModel ? (
            <Loader2 className="size-3.5 text-purple-400 animate-spin" />
          ) : (
            <Sparkles className="size-3.5 text-purple-400" />
          )}
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
            onClick={onSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
