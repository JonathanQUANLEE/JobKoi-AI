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

// ---------- wrappers ----------

export const ipc = {
  startRun: (config: RunConfig, progressChannel: unknown, logChannel: unknown) =>
    pyInvoke<{ status: string }>("start_run", { config, progressChannel, logChannel }),
  stopRun: () => pyInvoke<{ status: string }>("stop_run", {}),
  shutdownBrowser: () => pyInvoke<{ status: string }>("shutdown_browser", {}),
  openManualBrowser: () => pyInvoke<BrowserPageState>("open_manual_browser", { url: "" }),
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
};
