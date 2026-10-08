/** 类型化的 pyInvoke 封装，所有跟 Python 后端的 IPC 调用都从这里走。
 * 改 backend 命令 / 返回类型时同步改这里，TypeScript 报错就是 contract 断了的信号。 */
import { pyInvoke } from "tauri-plugin-pytauri-api";

// ---------- types ----------

export type EventKind =
  | "browser_started"
  | "page_opened"
  | "page_filter"
  | "login_ok"
  | "job_found"
  | "job_matched"
  | "job_skipped"
  | "review_requested"
  | "review_cleared"
  | "letter_sent"
  | "feed_exhausted"
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
  dryRun: boolean;
  profile: string;
  useCurrentPage: boolean;
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
};

export type PlatformListResult = {
  platforms: PlatformItem[];
};

export const ipc = {
  listPlatforms: () => pyInvoke<PlatformListResult>("list_platforms", {}),
  openPlatformLogin: (platformId: string) =>
    pyInvoke<{ status: string; platform?: string; url?: string; message?: string }>(
      "open_platform_login",
      { platformId },
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
};
