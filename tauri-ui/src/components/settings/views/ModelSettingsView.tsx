import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";

interface ModelSettingsViewProps {
  baseUrl: string;
  setBaseUrl: (val: string) => void;
  apiKey: string;
  setApiKey: (val: string) => void;
  model: string;
  setModel: (val: string) => void;
  testingModel: boolean;
  testResult: { ok: boolean; msg: string } | null;
  onTestModel: () => void;
  onSave: () => void;
  onClose: () => void;
}

export default function ModelSettingsView({
  baseUrl,
  setBaseUrl,
  apiKey,
  setApiKey,
  model,
  setModel,
  testingModel,
  testResult,
  onTestModel,
  onSave,
  onClose,
}: ModelSettingsViewProps) {
  return (
    <div className="py-4 space-y-4">
      <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200/90 leading-relaxed flex items-start gap-2.5">
        <HugeiconsIcon icon={SparklesIcon} size={16} className="text-purple-400 shrink-0 mt-0.5" />
        <div>
          <strong>推荐配置 (支持免费 OpenRouter 专属模型)</strong><br />
          已为你预设免费高性价比模型 <code className="text-purple-300 font-mono">nvidia/nemotron-3.5-lightning:free</code>，支持 100万 超长上下文，每天可免费享受 50 次深度简历体检与改写！
        </div>
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
            <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="text-emerald-400 shrink-0" />
          ) : (
            <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-rose-400 shrink-0" />
          )}
          <span>{testResult.msg}</span>
        </div>
      )}

      <div className="pt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onTestModel}
          disabled={testingModel}
          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
        >
          <HugeiconsIcon icon={SparklesIcon} size={14} className="text-purple-400" />
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
            className="px-5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
