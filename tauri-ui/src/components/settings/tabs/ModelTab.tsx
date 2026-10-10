import type { LLMConfig, LLMPreset } from "../../../lib/ipc";

interface ModelTabProps {
  llmConfig: LLMConfig | null;
  selectedPreset: string;
  onSelectPreset: (p: LLMPreset) => void;
  baseUrlInput: string;
  setBaseUrlInput: (v: string) => void;
  apiKeyInput: string;
  setApiKeyInput: (v: string) => void;
  modelInput: string;
  setModelInput: (v: string) => void;
  modelStatusMsg: string | null;
  isMonochrome: boolean;
  onSaveModel: () => Promise<void>;
}

export default function ModelTab({
  llmConfig,
  selectedPreset,
  onSelectPreset,
  baseUrlInput,
  setBaseUrlInput,
  apiKeyInput,
  setApiKeyInput,
  modelInput,
  setModelInput,
  modelStatusMsg,
  isMonochrome,
  onSaveModel,
}: ModelTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-stone-400 text-[11px] mb-1.5 font-medium">
          常用大模型服务商预设
        </label>
        <div className="flex flex-wrap gap-2">
          {llmConfig?.presets?.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPreset(p)}
              className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
                selectedPreset === p.id
                  ? isMonochrome
                    ? "border-white/80 bg-white/15 text-white font-bold"
                    : "border-amber-500/70 bg-amber-500/15 text-amber-300 font-bold"
                  : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:bg-[var(--panel-hover)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-stone-400 text-[11px] mb-1 font-medium">
          API Base URL
        </label>
        <input
          type="text"
          value={baseUrlInput}
          onChange={(e) => setBaseUrlInput(e.target.value)}
          placeholder="https://api.deepseek.com"
          className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
        />
      </div>

      <div>
        <label className="block text-stone-400 text-[11px] mb-1 font-medium">
          API Key (密钥)
        </label>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="sk-..."
          className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
        />
        <p className="text-[10px] text-stone-500 mt-1">密钥仅在本地加密存储，直接与大模型厂商安全交互</p>
      </div>

      <div>
        <label className="block text-stone-400 text-[11px] mb-1 font-medium">
          模型名称 (Model)
        </label>
        <input
          type="text"
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          placeholder="deepseek-chat"
          className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
        />
      </div>

      {modelStatusMsg && (
        <div className={`p-2.5 rounded-xl border text-xs ${isMonochrome ? "bg-white/10 border-white/20 text-white" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>
          {modelStatusMsg}
        </div>
      )}

      <div className="pt-2 border-t border-[var(--grid)] flex justify-end">
        <button
          type="button"
          onClick={onSaveModel}
          className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer shadow-md ${
            isMonochrome
              ? "bg-white hover:bg-zinc-200 text-black shadow-white/10"
              : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 shadow-amber-500/20"
          }`}
        >
          保存大模型配置
        </button>
      </div>
    </div>
  );
}
