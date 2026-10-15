import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  BoltIcon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
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

/** 推荐区只展示这两家（V0.4 用户拍板：智谱默认 + OpenRouter 可切换） */
const RECOMMENDED_PRESET_IDS = ["zhipu", "openrouter"];

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
  const recommended = presets.filter((p) => RECOMMENDED_PRESET_IDS.includes(p.id));

  const applyPreset = (preset: LLMPreset) => {
    setBaseUrl(preset.base_url);
    setModel(preset.default_model);
    setApiKey(preset.default_api_key || "");
  };

  return (
    <div className="py-4 space-y-4">
      {/* 双推荐卡片（V0.4）：智谱默认开箱即用，OpenRouter 免费国际档可切换 */}
      {recommended.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {recommended.map((preset) => {
            const active = baseUrl === preset.base_url && model === preset.default_model;
            const isZhipu = preset.id === "zhipu";
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                title={preset.signup_hint}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  active
                    ? "border-purple-400/60 bg-purple-500/15"
                    : "border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 hover:border-purple-400/40"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={isZhipu ? BoltIcon : Globe02Icon}
                    size={14}
                    className="text-purple-400 shrink-0"
                  />
                  <span className="text-xs font-bold text-purple-200 truncate">
                    {isZhipu ? "智谱 GLM-4-Flash" : "OpenRouter 免费档"}
                  </span>
                  {preset.recommended && (
                    <span className="ml-auto shrink-0 rounded-full bg-amber-500/20 border border-amber-500/30 px-1.5 py-px text-[9px] font-bold text-amber-300">
                      默认推荐
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">
                  {isZhipu
                    ? "国内直连反应快，已内置公共 Key 开箱即用，也可换成自己的。"
                    : "100 万超长上下文，每天 50 次免费；需在 openrouter.ai 注册自己的 Key。"}
                </p>
                {active && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} size={11} />
                    当前使用
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mist-setting-row">
        <label className="text-xs font-semibold text-stone-200">
          API Base URL (接口端点地址)
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://open.bigmodel.cn/api/paas/v4"
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
          placeholder="点上方推荐卡自动填入，或粘贴你自己的 Key"
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
          placeholder="glm-4-flash"
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
