import { useState, useEffect } from "react";
import { Info, Save } from "lucide-react";
import { ipc, type LLMPreset } from "../../../lib/ipc";
import { useRunStore } from "../../../store";

export default function DrawerModelTab() {
  const llmConfig = useRunStore((s) => s.llmConfig);
  const setLLMConfig = useRunStore((s) => s.setLLMConfig);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [presetId, setPresetId] = useState("");
  const [busyModel, setBusyModel] = useState(false);
  const [modelMessage, setModelMessage] = useState<string | null>(null);

  useEffect(() => {
    if (llmConfig) {
      setBaseUrl(llmConfig.base_url || "");
      setModel(llmConfig.model || "");
    } else {
      ipc
        .getLLMConfig()
        .then((cfg) => {
          setLLMConfig(cfg);
          setBaseUrl(cfg.base_url || "");
          setModel(cfg.model || "");
        })
        .catch(() => {});
    }
  }, [llmConfig, setLLMConfig]);

  const presets: LLMPreset[] = llmConfig?.presets ?? [];
  const activePreset = presets.find((p) => p.id === presetId);

  function applyPreset(nextPresetId: string) {
    setPresetId(nextPresetId);
    const preset = presets.find((p) => p.id === nextPresetId);
    if (!preset) return;
    setBaseUrl(preset.base_url);
    setModel(preset.default_model);
  }

  async function handleSaveModel() {
    setBusyModel(true);
    setModelMessage(null);
    try {
      await ipc.saveLLMConfig(baseUrl.trim(), apiKey, model.trim());
      const config = await ipc.getLLMConfig();
      setLLMConfig(config);
      setApiKey("");
      setModelMessage("已成功保存大模型配置并激活！");
    } catch (err) {
      setModelMessage(`保存失败: ${String(err)}`);
    } finally {
      setBusyModel(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            大语言模型配置 (AI Copilot)
          </h3>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
              llmConfig?.configured
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-stone-800 text-stone-400 border-stone-700"
            }`}
          >
            {llmConfig?.configured ? "已配置并激活" : "未配置 (可选功能)"}
          </span>
        </div>
        <p className="text-xs text-[var(--muted-fg)] leading-relaxed">
          用于支持自然语言求职意向提取、关键词智能扩充与专属人设生成。无需配置即可正常使用规则匹配巡航。
        </p>

        {/* 预置选择 */}
        <div>
          <label className="field-label">快速选用服务商预置</label>
          <select
            className="field-select"
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">— 快速选用预置服务商 (OpenRouter / DeepSeek / 硅基流动等) —</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">API 端点 (Base URL)</label>
            <input
              className="field-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>
          <div>
            <label className="field-label">模型名称 (Model ID)</label>
            <input
              className="field-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="qwen/qwen3.8-27b:free"
            />
          </div>
        </div>

        <div>
          <label className="field-label">API 密钥 (API Key)</label>
          <input
            className="field-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={llmConfig?.configured ? "•••••••••••••••• (留空则保持现有密钥不变)" : "sk-..."}
            autoComplete="off"
          />
        </div>

        {activePreset?.signup_hint && (
          <div className="flex items-start gap-2 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-xs text-amber-300">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{activePreset.signup_hint}</span>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between border-t border-[var(--grid)]">
          <span className="text-xs text-stone-400">
            {modelMessage || (llmConfig?.configured ? `当前配置：${llmConfig.model || "默认模型"}` : "未配置 API Key")}
          </span>
          <button
            type="button"
            className="btn-primary text-xs flex items-center gap-1.5"
            onClick={handleSaveModel}
            disabled={busyModel}
          >
            <Save className="h-3.5 w-3.5" />
            {busyModel ? "保存中..." : "保存模型配置"}
          </button>
        </div>
      </div>
    </div>
  );
}
