/** 类型化的 pyInvoke 封装，所有跟 Python 后端的 IPC 调用都从这里走。
 * 改 backend 命令 / 返回类型时同步改这里，TypeScript 报错就是 contract 断了的信号。 */
import { pyInvoke } from "tauri-plugin-pytauri-api";

// ---------- types ----------

export type EventKind =
  | "browser_started"
  | "page_opened"
  | "page_filter"
  | "login_ok"
  | "login_required"
  | "job_found"
  | "job_matched"
  | "job_skipped"
  | "review_requested"
  | "review_cleared"
  | "letter_sent"
  | "feed_exhausted"
  | "limit_reached"
  | "platform_limit_reached"
  | "loop_ended"
  | "error";

export type ProgressEvent = {
  kind: EventKind;
  payload: Record<string, unknown>;
  ts_local?: string;
};

export type RunConfig = {
  usrName: string;
  label: string;
  profile: string;
  useCurrentPage: boolean;
  /** 本轮要跑的招聘平台 id（默认 ["boss"]；勾选多个则并发巡航） */
  platforms?: string[];
};

export type ProfileSummary = {
  name: string;
  path: string;
};

export type ProfileData = Record<string, unknown>;

export type LoadedProfile = {
  name: string;
  path: string;
  data: ProfileData;
};

export type Greeting = {
  path: string;
  text: string;
};

export type RunState = {
  running: boolean;
  review?: {
    pending?: Record<string, unknown> | null;
  };
  stats?: {
    scanned: number;
    sent: number;
    skipped: number;
  };
  current_job?: Record<string, unknown> | null;
  latest_skip?: Record<string, unknown> | null;
  latest_sent?: Record<string, unknown> | null;
  page?: Record<string, unknown> | null;
  page_filters?: Record<string, unknown>[];
};

export type BrowserPageState = {
  has_tab: boolean;
  url: string;
  title: string;
  loaded_job_count: number;
};

// ---------- agent（智能助手，里程碑 1） ----------

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** agent 声明的工具意图（白名单在后端净化，前端只透传）。 */
export type AgentAction = {
  type: "get_stats" | "preview_jobs" | "prepare_run";
  params?: { n?: number };
};

/** agent_chat 的返回：可预期错误也走返回值（status=error），保持聊天历史。 */
export type AgentChatResult = {
  status: "ok" | "error";
  code?: string;
  message?: string;
  reply?: string;
  /** 与 profileForm 的 BuiltProfileData 同构（snake_case 原样透传）。 */
  profile?: Record<string, unknown> | null;
  action?: AgentAction | null;
};

/** agent_execute_action 的返回（get_stats / preview_jobs）。 */
export type AgentToolResult = {
  status: "ok" | "error";
  type: string;
  text: string;
  data?: Record<string, unknown>;
  code?: string;
  message?: string;
};

export type LLMPreset = {
  id: string;
  label: string;
  base_url: string;
  default_model: string;
  signup_hint: string;
};

export type LLMConfig = {
  base_url: string;
  /** 后端返回的脱敏掩码（如 sk-o****3456）；空串表示未配置。 */
  api_key: string;
  model: string;
  configured: boolean;
  presets: LLMPreset[];
};

export type SaveLLMConfigResult = {
  status: string;
  api_key: string;
  configured: boolean;
};

// ---------- 简历管理（F1） ----------

export type ResumeItem = {
  name: string;
  size: number;
  mtime: string;
  is_default: boolean;
};

export type ResumeListResult = {
  resumes: ResumeItem[];
};

export type ResumeContentResult = {
  status: "ok" | "error";
  name: string;
  ext: string;
  mime: string;
  size: number;
  data_url: string;
  text?: string;
};

// ---------- F3：BOSS 新回复检测 ----------

export type ReplyCheckResult = {
  status: "ok" | "error";
  code?: string;
  message?: string;
  unread?: number;
  new_replies?: boolean;
  chat_url?: string;
};

// ---------- 多平台适配层 ----------

export type PlatformItem = {
  id: string;
  name: string;
  tagline: string;
  daily_limit: number;
  theme_color: string;
  is_supported: boolean;
  is_logged_in: boolean;
  status_text: string;
  today_sent?: number;
  total_sent?: number;
  remaining?: number;
};

export type PlatformListResult = {
  platforms: PlatformItem[];
};

export interface ATSScoreData {
  overall_score: number;
  dimensions: {
    quantification: number;
    action_verbs: number;
    star_logic: number;
    technical_depth: number;
    readability: number;
  };
  metrics_count: number;
  strong_verbs_count: number;
  weak_verbs_count: number;
  word_count: number;
  highlights: string[];
  issues: string[];
}

export interface SemanticMatchData {
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  similarity_ratio: number;
}

export interface ResumeDiagnoseResult {
  status: "ok" | "error";
  message?: string;
  ats_score?: ATSScoreData;
  semantic_match?: SemanticMatchData;
  polish_advice?: string;
  active_skills?: string[];
  is_offline_fallback?: boolean;
}

export interface DeliveryRecordItem {
  platform: string;
  platform_name: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  time: string;
  status: string;
}

export interface DeliveryHistoryResult {
  records: DeliveryRecordItem[];
}

// ---------- 统计页真实数据模式（后端按天聚合三平台真实账本） ----------

export type DailyStatDay = {
  date: string; // "YYYY-MM-DD"
  label: string; // "MM-DD"
  weekday: string; // "周一"
  bossSent: number;
  liepinSent: number;
  job51Sent: number;
  totalSent: number;
};

export type DeliveryDailyStatsResult = {
  days: DailyStatDay[];
  totals: {
    sentSum: number;
    activeDays: number;
    bossSent: number;
    liepinSent: number;
    job51Sent: number;
    firstDate: string;
    lastDate: string;
  };
};

export const ipc = {
  listPlatforms: () => pyInvoke<PlatformListResult>("list_platforms", {}),
  openPlatformLogin: (platformId: string) =>
    pyInvoke<{
      status: string;
      platform?: string;
      url?: string;
      message?: string;
      logged_in?: boolean;
    }>("open_platform_login", { platformId }),
  checkLoginStatus: (platformId: string) =>
    pyInvoke<{ logged_in: boolean; verified: boolean }>("check_login_status", {
      platformId,
    }),
  getDeliveryHistory: (platform: string = "", limit: number = 100) =>
    pyInvoke<DeliveryHistoryResult>("get_delivery_history", { platform, limit }),
  getDeliveryDailyStats: (days: number = 30) =>
    pyInvoke<DeliveryDailyStatsResult>("get_delivery_daily_stats", { days }),
  resetTodayDelivery: (platform: string = "boss") =>
    pyInvoke<{ status: string; archived_count: number; platform: string }>(
      "reset_today_delivery",
      { platform },
    ),
  startRun: (config: RunConfig, progressChannel: unknown, logChannel: unknown) =>
    pyInvoke<{ status: string }>("start_run", { config, progressChannel, logChannel }),
  stopRun: () => pyInvoke<{ status: string }>("stop_run", {}),
  shutdownBrowser: () => pyInvoke<{ status: string }>("shutdown_browser", {}),
  openManualBrowser: (url?: string) =>
    pyInvoke<BrowserPageState>("open_manual_browser", { url: url ?? "" }),
  checkBossReplies: () => pyInvoke<ReplyCheckResult>("check_boss_replies", {}),
  listProfiles: () => pyInvoke<{ profiles: ProfileSummary[] }>("list_profiles", {}),
  getProfile: (name: string) => pyInvoke<LoadedProfile>("get_profile", { name }),
  saveProfile: (name: string, data: ProfileData) =>
    pyInvoke<{ status: string; name: string; path: string }>("save_profile", { name, data }),
  getGreeting: (path?: string) => pyInvoke<Greeting>("get_greeting", { path: path ?? "" }),
  saveGreeting: (text: string, path?: string) =>
    pyInvoke<{ status: string; path: string }>("save_greeting", { text, path: path ?? "" }),
  submitReviewDecision: (decision: "send" | "skip" | "quit") =>
    pyInvoke<{ status: string; decision: string }>("submit_review_decision", { decision }),
  getRunState: () => pyInvoke<RunState>("get_run_state", {}),
  getBrowserPageState: () => pyInvoke<BrowserPageState>("get_browser_page_state", {}),
  agentChat: (
    message: string,
    history: AgentChatMessage[],
    currentForm: Record<string, unknown>,
  ) =>
    pyInvoke<AgentChatResult>("agent_chat", { message, history, currentForm }),
  agentExecuteAction: (type: string, params: Record<string, unknown>) =>
    pyInvoke<AgentToolResult>("agent_execute_action", { type, params }),
  getLLMConfig: () => pyInvoke<LLMConfig>("get_llm_config", {}),
  saveLLMConfig: (baseUrl: string, apiKey: string, model: string) =>
    pyInvoke<SaveLLMConfigResult>("save_llm_config", { baseUrl, apiKey, model }),
  listResumes: () => pyInvoke<ResumeListResult>("list_resumes", {}),
  setDefaultResume: (name: string) =>
    pyInvoke<{ status: string; name: string }>("set_default_resume", { name }),
  getResumeContent: (name: string) =>
    pyInvoke<ResumeContentResult>("get_resume_content", { name }),
  saveResumeFile: (name: string, contentB64: string) =>
    pyInvoke<{ status: string; name: string; size: number; is_default: boolean }>(
      "save_resume_file",
      { name, contentB64 },
    ),
  deleteResumeFile: (name: string) =>
    pyInvoke<{ status: string; name: string }>("delete_resume_file", { name }),
  openResumeNative: (name: string) =>
    pyInvoke<{ status: string; name: string; path: string }>("open_resume_native", { name }),
  diagnoseResume: (
    resumeText: string,
    targetRole?: string,
    activeSkills?: string[],
    userPrompt?: string,
  ) =>
    pyInvoke<ResumeDiagnoseResult>("diagnose_resume", {
      resumeText,
      targetRole: targetRole ?? "",
      activeSkills: activeSkills ?? ["star", "xyz", "ats", "verbs"],
      userPrompt: userPrompt ?? "",
    }),
  calculateATSScore: (resumeText: string) =>
    pyInvoke<ATSScoreData>("calculate_ats_score", { resumeText }),
  windowMinimize: () => pyInvoke<{ status: string }>("window_minimize", {}),
  windowToggleMaximize: () => pyInvoke<{ status: string }>("window_toggle_maximize", {}),
  windowClose: () => pyInvoke<{ status: string }>("window_close", {}),
  // 定时巡航闹钟（系统级 Windows 计划任务）
  getScheduleStatus: () =>
    pyInvoke<{ exists: boolean; raw?: string; error?: string }>("get_schedule_status", {}),
  saveSchedule: (config: {
    time: string;
    enabled: boolean;
    repeatDays?: number[];
    autoRun?: boolean;
  }) =>
    pyInvoke<{ status: string; task?: string; time?: string; scope?: string; message?: string }>(
      "save_schedule",
      {
        time: config.time,
        enabled: config.enabled,
        repeatDays: config.repeatDays ?? [],
        autoRun: config.autoRun ?? false,
      },
    ),
  cancelSchedule: () => pyInvoke<{ status: string }>("cancel_schedule", {}),
};
