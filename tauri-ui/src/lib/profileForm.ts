export type Mode = "scan" | "review" | "auto";
export type MatchMode = "contains" | "regex" | "exact";
export type Scope = "title" | "description" | "title_description" | "location" | "all";
export type FilterPolicy = "warning" | "strict";

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
  maxSent: string;
  dailyLimit: string;
  stopOnCaptcha: boolean;
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
    max_sent: number;
    daily_sent_limit: number;
    stop_on_captcha: boolean;
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
  const city = splitKeywords(values.cityValues);
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
      delay_min: numberOrDefault(values.delayMin, 10),
      delay_max: numberOrDefault(values.delayMax, 60),
      max_sent: numberOrDefault(values.maxSent, 50),
      daily_sent_limit: numberOrDefault(values.dailyLimit, 80),
      stop_on_captcha: values.stopOnCaptcha,
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
