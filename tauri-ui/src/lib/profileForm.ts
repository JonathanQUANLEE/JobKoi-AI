export type Mode = "scan" | "review" | "auto";
export type MatchMode = "contains" | "regex" | "exact" | "smart";
export type Scope = "title" | "description" | "title_description" | "location" | "all";
export type FilterPolicy = "warning" | "strict";

// 城市输入宽容解析（防"深圳 广州"粘连静默失效），见 lib/cityInput.ts
import { parseCityList } from "./cityInput";

export type RuleForm = {
  requiredKeywords: string;
  anyKeywords: string;
  excludeKeywords: string;
  scope: Scope;
  match: MatchMode;
  caseSensitive: boolean;
};

export type ProfileFormValues = {
  label: string;
  startUrl: string;
  rule: RuleForm;
  cityValues: string;
  educationValues: string;
  bossActiveValues: string;
  filterPolicy: FilterPolicy;
  mode: Mode;
  greetingPath: string;
  delayMin: string;
  delayMax: string;
  /** 分平台拟人化节奏（2026-10-13 用户拍板：每平台独立三档）。空串 = 未单设，运行时回退 delayMin/Max。 */
  liepinDelayMin: string;
  liepinDelayMax: string;
  job51DelayMin: string;
  job51DelayMax: string;
  maxSent: string;
  /** 分平台单轮上限（2026-10-17）：空串 = 未单设，运行时回退系统默认（猎聘 15 / 前程 10）。 */
  liepinRunMax: string;
  job51RunMax: string;
  dailyLimit: string;
  /** 分平台每日投递上限（2026-10-18 严重缺陷修复）：空串 = 未单设，运行时回退系统默认（猎聘 50 / 前程 40）。
   * 修复前这两个数字只写 localStorage、后端从不读取——用户调低日限保号实际不生效。 */
  liepinDailyLimit: string;
  job51DailyLimit: string;
  stopOnCaptcha: boolean;
  /** F2：BOSS 打招呼后自动点“发简历”（默认关，opt-in）。 */
  sendResumeAfterGreeting: boolean;
  /** F3：检测到招聘者回复后自动进会话发简历（默认关，opt-in）。 */
  autoResumeOnReply: boolean;
  /** F5：review 模式用 AI 按 JD 生成招呼语（默认关，opt-in）。 */
  aiGreeting: boolean;
};

type RuleBlock = {
  enabled: boolean;
  scope: Scope;
  match: MatchMode;
  case_sensitive: boolean;
  keywords: string[];
};

export type BuiltProfileData = {
  search: {
    query: string;
    start_url?: string;
  };
  page_filters: {
    strict: boolean;
    city: { enabled: boolean; values: string[] };
    education: { enabled: boolean; values: string[] };
    boss_active: { enabled: boolean; values: string[] };
  };
  filters: {
    title: {
      required: RuleBlock;
      any: RuleBlock;
      exclude: RuleBlock;
    };
  };
  send: {
    mode: Mode;
    greeting_file: string;
    delay_min: number;
    delay_max: number;
    liepin_delay_min?: number;
    liepin_delay_max?: number;
    job51_delay_min?: number;
    job51_delay_max?: number;
    max_sent: number;
    liepin_run_max?: number;
    job51_run_max?: number;
    daily_sent_limit: number;
    liepin_daily_limit?: number;
    job51_daily_limit?: number;
    stop_on_captcha: boolean;
    send_resume_after_greeting: boolean;
    auto_send_resume_on_reply: boolean;
    ai_greeting: boolean;
  };
  state: {
    seen_jobs_file: string;
    sent_log_file: string;
    skipped_log_file: string;
  };
};

export function buildProfileData(values: ProfileFormValues): BuiltProfileData {
  const requiredKeywords = splitKeywords(values.rule.requiredKeywords);
  const anyKeywords = splitKeywords(values.rule.anyKeywords);
  const excludeKeywords = splitKeywords(values.rule.excludeKeywords);
  // 城市走宽容解析（多分隔符 + 白名单归一 + 垃圾拦截）——无论上游 UI 漏了
  // 哪种输入形态，落盘的 city.values 一定是干净数组（防静默失效兜底线）。
  const city = parseCityList(values.cityValues);
  const education = splitKeywords(values.educationValues);
  const bossActive = splitKeywords(values.bossActiveValues);

  // GUI 表单统一生成 profile YAML；后端再走 CLI 同一套 profile 加载流程。
  const search: BuiltProfileData["search"] = {
    query: values.label.trim(),
  };
  const startUrl = values.startUrl.trim();
  if (startUrl) {
    search.start_url = startUrl;
  }

  return {
    search,
    page_filters: {
      strict: values.filterPolicy === "strict",
      city: { enabled: city.length > 0, values: city },
      education: { enabled: education.length > 0, values: education },
      boss_active: { enabled: bossActive.length > 0, values: bossActive },
    },
    filters: {
      title: {
        required: buildRuleBlock(values.rule, requiredKeywords),
        any: buildRuleBlock(values.rule, anyKeywords),
        exclude: buildRuleBlock(values.rule, excludeKeywords),
      },
    },
    send: {
      mode: values.mode,
      greeting_file: values.greetingPath.trim() || "./greetings/default.txt",
      delay_min: clampDelayOrDefault(values.delayMin, 20),
      delay_max: clampDelayOrDefault(values.delayMax, 40),
      // 分平台节奏（可选字段：空串不落盘 → 后端回退 delay_min/max）
      ...(values.liepinDelayMin.trim() ? { liepin_delay_min: clampDelayOrDefault(values.liepinDelayMin, 20) } : {}),
      ...(values.liepinDelayMax.trim() ? { liepin_delay_max: clampDelayOrDefault(values.liepinDelayMax, 40) } : {}),
      ...(values.job51DelayMin.trim() ? { job51_delay_min: clampDelayOrDefault(values.job51DelayMin, 20) } : {}),
      ...(values.job51DelayMax.trim() ? { job51_delay_max: clampDelayOrDefault(values.job51DelayMax, 40) } : {}),
      max_sent: numberOrDefault(values.maxSent, 50),
      // 分平台单轮上限（可选字段：空串不落盘 → 后端回退系统默认 猎聘 15 / 前程 10）
      ...(values.liepinRunMax.trim() ? { liepin_run_max: numberOrDefault(values.liepinRunMax, 15) } : {}),
      ...(values.job51RunMax.trim() ? { job51_run_max: numberOrDefault(values.job51RunMax, 10) } : {}),
      daily_sent_limit: numberOrDefault(values.dailyLimit, 80),
      // 分平台日限（2026-10-18 修复）：空串不落盘 → 运行时回退系统默认（猎聘 50 / 前程 40），
      // 与既有分平台字段的"未单设"语义一致。
      ...(values.liepinDailyLimit.trim() ? { liepin_daily_limit: numberOrDefault(values.liepinDailyLimit, 50) } : {}),
      ...(values.job51DailyLimit.trim() ? { job51_daily_limit: numberOrDefault(values.job51DailyLimit, 40) } : {}),
      stop_on_captcha: values.stopOnCaptcha,
      send_resume_after_greeting: values.sendResumeAfterGreeting,
      auto_send_resume_on_reply: values.autoResumeOnReply,
      ai_greeting: values.aiGreeting,
    },
    state: {
      seen_jobs_file: "./logs/seen_jobs.jsonl",
      sent_log_file: "./logs/sent_jobs.jsonl",
      skipped_log_file: "./logs/skipped_jobs.jsonl",
    },
  };
}

export function toggleCsvValue(value: string, option: string) {
  const items = splitKeywords(value);
  const next = items.includes(option)
    ? items.filter((item) => item !== option)
    : [...items, option];
  return Array.from(new Set(next)).join(",");
}

function buildRuleBlock(rule: RuleForm, keywords: string[]): RuleBlock {
  return {
    enabled: keywords.length > 0,
    scope: rule.scope,
    match: rule.match,
    case_sensitive: rule.caseSensitive,
    keywords,
  };
}

function splitKeywords(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrDefault(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : fallback;
}

/**
 * 拟人化节流安全区间（与后端 platforms/limits.py 的 BOSS_DELAY_RANGE_SECONDS 一致）：
 * 下限 15s = 同类工具公开文档最保守建议（影刀 RPA「打招呼至少 15s 一次」防封号）。
 * GUI 三档预设：效率 15-30 / 标准 20-40 / 稳健 30-45；任何设置界面存的值
 * 越界都在落盘前钳进区间——后端运行时还有一道同值钳制兜底。
 */
export const DELAY_RANGE_SECONDS: [number, number] = [15, 45];

function clampDelayOrDefault(value: string, fallback: number) {
  const parsed = numberOrDefault(value, fallback);
  const [low, high] = DELAY_RANGE_SECONDS;
  return Math.min(high, Math.max(low, parsed));
}
