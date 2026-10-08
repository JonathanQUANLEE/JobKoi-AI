import { useState, useEffect, type ReactNode } from "react";
import {
  SlidersHorizontal,
  ShieldCheck,
  MessageSquareQuote,
  Bot,
  FolderArchive,
  X,
  Check,
  Info,
  Save,
} from "lucide-react";
import { type FilterPolicy, type MatchMode, type Scope, type RuleForm } from "../lib/profileForm";
import { optionLabel, type Lang } from "../lib/i18n";
import { ipc, type LLMPreset } from "../lib/ipc";
import { useRunStore, useT } from "../store";

export type DrawerTab = "basic" | "rules" | "greeting" | "policy" | "model";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Lang;
  profiles: Array<{ name: string; path: string }>;
  profileName: string;
  setProfileName: (name: string) => void;
  onLoadProfile: (name: string) => void;
  onSaveConfig: () => Promise<void>;
  busy: boolean;

  // Basic
  usrName: string;
  setUsrName: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  startUrl: string;
  setStartUrl: (v: string) => void;

  // Rules
  rule: RuleForm;
  setRule: (r: RuleForm) => void;

  // Page Filters
  cityValues: string;
  setCityValues: (v: string) => void;
  educationValues: string;
  setEducationValues: (v: string) => void;
  bossActiveValues: string;
  setBossActiveValues: (v: string) => void;
  filterPolicy: FilterPolicy;
  setFilterPolicy: (p: FilterPolicy) => void;

  // Greeting
  greetingPath: string;
  setGreetingPath: (v: string) => void;
  greeting: string;
  setGreeting: (v: string) => void;

  // Send Policy
  delayMin: string;
  setDelayMin: (v: string) => void;
  delayMax: string;
  setDelayMax: (v: string) => void;
  maxSent: string;
  setMaxSent: (v: string) => void;
  dailyLimit: string;
  setDailyLimit: (v: string) => void;
  dryRun: boolean;
  setDryRun: (v: boolean) => void;
  stopOnCaptcha: boolean;
  setStopOnCaptcha: (v: boolean) => void;
  sendResumeAfterGreeting: boolean;
  setSendResumeAfterGreeting: (v: boolean) => void;
  autoResumeOnReply: boolean;
  setAutoResumeOnReply: (v: boolean) => void;
  aiGreeting: boolean;
  setAiGreeting: (v: boolean) => void;
  initialTab?: DrawerTab;
}

const CITY_OPTIONS = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京"];
const EDUCATION_OPTIONS = ["不限", "大专", "本科", "硕士"];
const BOSS_ACTIVE_OPTIONS = ["刚刚活跃", "今日活跃", "3日内活跃", "本周活跃"];

export default function SettingsDrawer(props: SettingsDrawerProps) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<DrawerTab>(props.initialTab || "rules");

  // LLM Config state (ZCode 模式：将模型配置移入设置抽屉)
  const llmConfig = useRunStore((s) => s.llmConfig);
  const setLLMConfig = useRunStore((s) => s.setLLMConfig);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [presetId, setPresetId] = useState("");
  const [busyModel, setBusyModel] = useState(false);
  const [modelMessage, setModelMessage] = useState<string | null>(null);

  useEffect(() => {
    if (props.initialTab) {
      setActiveTab(props.initialTab);
    }
  }, [props.initialTab, props.isOpen]);

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

  if (!props.isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm transition-opacity">
      {/* 遮罩背景点击退出 */}
      <div className="absolute inset-0 cursor-pointer" onClick={props.onClose} />

      {/* 侧滑主体面板 */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-[var(--grid)] bg-[var(--panel)] shadow-2xl">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-[var(--grid)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">配置与过滤规则中心</h2>
              <p className="text-xs text-[var(--muted-fg)]">精细化控制求职关键词、城市范围、拟人风控延时与 AI 大模型</p>
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--grid)] text-stone-400 hover:border-stone-600 hover:text-stone-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 标签栏（统一 Lucide 图标规范） */}
        <div className="flex border-b border-[var(--grid)] px-6 bg-[var(--panel-2)]/50 overflow-x-auto">
          <TabButton
            active={activeTab === "rules"}
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            label="关键词与筛选"
            onClick={() => setActiveTab("rules")}
          />
          <TabButton
            active={activeTab === "policy"}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="拟人风控与策略"
            onClick={() => setActiveTab("policy")}
          />
          <TabButton
            active={activeTab === "greeting"}
            icon={<MessageSquareQuote className="h-3.5 w-3.5" />}
            label="打招呼文本"
            onClick={() => setActiveTab("greeting")}
          />
          <TabButton
            active={activeTab === "model"}
            icon={<Bot className="h-3.5 w-3.5" />}
            label="AI 模型配置"
            onClick={() => setActiveTab("model")}
          />
          <TabButton
            active={activeTab === "basic"}
            icon={<FolderArchive className="h-3.5 w-3.5" />}
            label="预设配置档"
            onClick={() => setActiveTab("basic")}
          />
        </div>

        {/* 表单内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* TAB 1: 规则与过滤 */}
          {activeTab === "rules" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">岗位关键词精准过滤</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">{t("field.requiredKeywords")}（必须包含）</label>
                    <input
                      className="field-input"
                      value={props.rule.requiredKeywords}
                      onChange={(e) => props.setRule({ ...props.rule, requiredKeywords: e.target.value })}
                      placeholder="如：后端开发,AI"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("field.anyKeywords")}（包含任意之一）</label>
                    <input
                      className="field-input"
                      value={props.rule.anyKeywords}
                      onChange={(e) => props.setRule({ ...props.rule, anyKeywords: e.target.value })}
                      placeholder="如：Python,Golang,LLM"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="field-label">{t("field.excludeKeywords")}（黑名单/绝对排除）</label>
                    <input
                      className="field-input"
                      value={props.rule.excludeKeywords}
                      onChange={(e) => props.setRule({ ...props.rule, excludeKeywords: e.target.value })}
                      placeholder="如：销售,客服,培训,无底薪"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 pt-2">
                  <div>
                    <label className="field-label">{t("field.scope")}</label>
                    <select
                      className="field-select"
                      value={props.rule.scope}
                      onChange={(e) => props.setRule({ ...props.rule, scope: e.target.value as Scope })}
                    >
                      <option value="title">{optionLabel(props.lang, "scope.title")}</option>
                      <option value="description">{optionLabel(props.lang, "scope.description")}</option>
                      <option value="title_description">{optionLabel(props.lang, "scope.title_description")}</option>
                      <option value="location">{optionLabel(props.lang, "scope.location")}</option>
                      <option value="all">{optionLabel(props.lang, "scope.all")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t("field.match")}</label>
                    <select
                      className="field-select"
                      value={props.rule.match}
                      onChange={(e) => props.setRule({ ...props.rule, match: e.target.value as MatchMode })}
                    >
                      <option value="contains">{optionLabel(props.lang, "match.contains")}</option>
                      <option value="regex">{optionLabel(props.lang, "match.regex")}</option>
                      <option value="exact">{optionLabel(props.lang, "match.exact")}</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={props.rule.caseSensitive}
                        onChange={(e) => props.setRule({ ...props.rule, caseSensitive: e.target.checked })}
                      />
                      <span>{t("field.caseSensitive")}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 页面过滤器 */}
              <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">页面维度匹配（城市与学历）</h3>
                <div>
                  <label className="field-label">{t("field.city")}</label>
                  <div className="option-picker">
                    {CITY_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`option-chip ${props.cityValues.includes(c) ? "active" : ""}`}
                        onClick={() => {
                          const list = props.cityValues ? props.cityValues.split(",").map((s) => s.trim()) : [];
                          const next = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
                          props.setCityValues(next.join(","));
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <input
                    className="field-input"
                    value={props.cityValues}
                    onChange={(e) => props.setCityValues(e.target.value)}
                    placeholder="选填或手动逗号分隔，如：深圳,广州"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">{t("field.education")}</label>
                    <div className="option-picker">
                      {EDUCATION_OPTIONS.map((ed) => (
                        <button
                          key={ed}
                          type="button"
                          className={`option-chip ${props.educationValues.includes(ed) ? "active" : ""}`}
                          onClick={() => props.setEducationValues(ed === "不限" ? "" : ed)}
                        >
                          {ed}
                        </button>
                      ))}
                    </div>
                    <input
                      className="field-input"
                      value={props.educationValues}
                      onChange={(e) => props.setEducationValues(e.target.value)}
                      placeholder="支持选填多个"
                    />
                  </div>

                  <div>
                    <label className="field-label">BOSS直聘活跃度限定</label>
                    <div className="option-picker">
                      {BOSS_ACTIVE_OPTIONS.map((act) => (
                        <button
                          key={act}
                          type="button"
                          className={`option-chip ${props.bossActiveValues.includes(act) ? "active" : ""}`}
                          onClick={() => props.setBossActiveValues(act)}
                        >
                          {act}
                        </button>
                      ))}
                    </div>
                    <input
                      className="field-input"
                      value={props.bossActiveValues}
                      onChange={(e) => props.setBossActiveValues(e.target.value)}
                      placeholder="如：刚刚活跃,今日活跃"
                    />
                  </div>
                </div>

                <div className="border-t border-[var(--grid)] pt-3">
                  <label className="field-label">{t("field.filterPolicy")}</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["strict", "warning", "off"] as FilterPolicy[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                          props.filterPolicy === p
                            ? "border-amber-500 bg-amber-500/10 font-bold text-amber-400"
                            : "border-[var(--grid)] bg-stone-900/40 text-stone-400 hover:text-stone-200"
                        }`}
                        onClick={() => props.setFilterPolicy(p)}
                      >
                        <div className="capitalize">{p}</div>
                        <div className="text-[10px] text-[var(--muted-fg)] mt-0.5">
                          {p === "strict" ? "严格拦截不匹配" : p === "warning" ? "提示放行" : "关闭拦截"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 拟人风控与投递策略 */}
          {activeTab === "policy" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">防封禁拟人延时设定</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">{t("field.delayMin")} (秒)</label>
                    <input
                      className="field-input"
                      type="number"
                      value={props.delayMin}
                      onChange={(e) => props.setDelayMin(e.target.value)}
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("field.delayMax")} (秒)</label>
                    <input
                      className="field-input"
                      type="number"
                      value={props.delayMax}
                      onChange={(e) => props.setDelayMax(e.target.value)}
                      placeholder="60"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[var(--grid)]">
                  <div>
                    <label className="field-label">{t("field.maxSent")} (本次上限)</label>
                    <input
                      className="field-input"
                      type="number"
                      value={props.maxSent}
                      onChange={(e) => props.setMaxSent(e.target.value)}
                      placeholder="50"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("field.dailyLimit")} (每日保护限额)</label>
                    <input
                      className="field-input"
                      type="number"
                      value={props.dailyLimit}
                      onChange={(e) => props.setDailyLimit(e.target.value)}
                      placeholder="80"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">投递动作安全开关</h3>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={props.dryRun}
                    onChange={(e) => props.setDryRun(e.target.checked)}
                  />
                  <span>{t("toggle.dryRun")}（演练不真实点击投递）</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={props.stopOnCaptcha}
                    onChange={(e) => props.setStopOnCaptcha(e.target.checked)}
                  />
                  <span>{t("toggle.stopOnCaptcha")}（遇到安全验证码自动停机报警）</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={props.sendResumeAfterGreeting}
                    onChange={(e) => props.setSendResumeAfterGreeting(e.target.checked)}
                  />
                  <span>打招呼后立即投递简历附件</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={props.autoResumeOnReply}
                    onChange={(e) => props.setAutoResumeOnReply(e.target.checked)}
                  />
                  <span>HR 回复消息后自动发送在线简历</span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: 打招呼文本 */}
          {activeTab === "greeting" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">固定打招呼模板</h3>
                  <label className="checkbox-line text-xs">
                    <input
                      type="checkbox"
                      checked={props.aiGreeting}
                      onChange={(e) => props.setAiGreeting(e.target.checked)}
                    />
                    <span className="text-amber-400 font-semibold">{t("toggle.aiGreeting")}</span>
                  </label>
                </div>
                <div>
                  <label className="field-label">{t("field.greetingFile")}</label>
                  <input
                    className="field-input"
                    value={props.greetingPath}
                    onChange={(e) => props.setGreetingPath(e.target.value)}
                    placeholder="./greetings/default.txt"
                  />
                </div>
                <div>
                  <label className="field-label">招呼语内容（支持就地修改）</label>
                  <textarea
                    className="field-textarea min-h-52 text-xs"
                    value={props.greeting}
                    onChange={(e) => props.setGreeting(e.target.value)}
                    placeholder={t("placeholder.greeting")}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI 模型配置 (ZCode Pattern) */}
          {activeTab === "model" && (
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
          )}

          {/* TAB 5: 配置档管理 */}
          {activeTab === "basic" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">预设配置档切换</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">{t("field.currentProfile")}</label>
                    <select
                      className="field-select"
                      value={props.profileName}
                      onChange={(e) => {
                        props.setProfileName(e.target.value);
                        props.onLoadProfile(e.target.value);
                      }}
                    >
                      {props.profiles.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t("field.profileName")}</label>
                    <input
                      className="field-input"
                      value={props.profileName}
                      onChange={(e) => props.setProfileName(e.target.value)}
                      placeholder="gui-default"
                    />
                  </div>
                </div>

                <div className="border-t border-[var(--grid)] pt-3 space-y-3">
                  <div>
                    <label className="field-label">{t("field.userName")}</label>
                    <input
                      className="field-input"
                      value={props.usrName}
                      onChange={(e) => props.setUsrName(e.target.value)}
                      placeholder="您的称呼（可选）"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("field.searchKeyword")}</label>
                    <input
                      className="field-input"
                      value={props.label}
                      onChange={(e) => props.setLabel(e.target.value)}
                      placeholder="默认检索关键词"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("field.startUrl")}</label>
                    <input
                      className="field-input"
                      value={props.startUrl}
                      onChange={(e) => props.setStartUrl(e.target.value)}
                      placeholder="选填：自定义起始检索页面 URL"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部吸底操作栏 */}
        <div className="flex items-center justify-between border-t border-[var(--grid)] bg-[var(--paper)] px-6 py-4">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={props.onClose}
          >
            关闭抽屉
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary text-xs flex items-center gap-2"
              onClick={async () => {
                await props.onSaveConfig();
                props.onClose();
              }}
              disabled={props.busy}
            >
              <Check className="h-4 w-4" />
              保存并应用此配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold tracking-wide transition-all border-b-2 whitespace-nowrap ${
        active
          ? "border-amber-500 text-amber-400 bg-amber-500/5"
          : "border-transparent text-stone-400 hover:text-stone-200"
      }`}
    >
      {icon && <span className="opacity-90">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
