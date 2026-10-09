import { useState, useEffect, useMemo, useCallback, type Dispatch, type SetStateAction } from "react";
import { Channel } from "@tauri-apps/api/core";
import { ipc, type ProgressEvent, type RunConfig, type ProfileData } from "../lib/ipc";
import { eventLogLine } from "../lib/eventDisplay";
import { latestPayloadForJob } from "../lib/runView";
import { useRunStore } from "../store";
import {
  latestJob,
  summarizeEvents,
  formatLocalTime,
} from "../lib/dashboardHelpers";

interface UseJobBotRuntimeOptions {
  t: (key: string, vars?: Record<string, string | number>) => string;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  message: string | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  usrName: string;
  label: string;
  dryRun: boolean;
  profileName: string;
  greeting: string;
  greetingPath: string;
  currentProfileData: () => ProfileData;
  validateBeforeRun: () => string | null;
}

export interface UseJobBotRuntimeReturn {
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  message: string | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  replyNotice: { unread: number; chatUrl: string } | null;
  setReplyNotice: Dispatch<SetStateAction<{ unread: number; chatUrl: string } | null>>;

  // Store state & memoized stats
  running: boolean;
  events: ProgressEvent[];
  logs: string[];
  currentIndex: number | null;
  stats: { scanned: number; sent: number; skipped: number };
  currentJob: ReturnType<typeof latestJob> | undefined;
  latestSkip: ProgressEvent["payload"] | undefined;
  latestSent: ProgressEvent["payload"] | undefined;
  statusText: string;
  reviewPending: Record<string, unknown> | null;

  // Actions
  startRun: () => Promise<void>;
  stopRun: () => Promise<void>;
  resetChrome: () => Promise<void>;
  openManualBrowser: () => Promise<void>;
  copyLogs: () => Promise<void>;
  openChatPage: (url: string) => Promise<void>;
  submitReviewDecision: (decision: "send" | "skip" | "quit") => Promise<void>;
}

export function useJobBotRuntime({
  t,
  busy,
  setBusy,
  message,
  setMessage,
  usrName,
  label,
  dryRun,
  profileName,
  greeting,
  greetingPath,
  currentProfileData,
  validateBeforeRun,
}: UseJobBotRuntimeOptions): UseJobBotRuntimeReturn {
  const running = useRunStore((s) => s.running);
  const events = useRunStore((s) => s.events);
  const logs = useRunStore((s) => s.logs);
  const currentIndex = useRunStore((s) => s.currentIndex);
  const restoredStats = useRunStore((s) => s.restoredStats);
  const restoredCurrentJob = useRunStore((s) => s.restoredCurrentJob);
  const restoredLatestSkip = useRunStore((s) => s.restoredLatestSkip);
  const restoredLatestSent = useRunStore((s) => s.restoredLatestSent);
  const setRunning = useRunStore((s) => s.setRunning);
  const pushEvent = useRunStore((s) => s.pushEvent);
  const pushLog = useRunStore((s) => s.pushLog);
  const clear = useRunStore((s) => s.clear);
  const reviewPending = useRunStore((s) => s.reviewPending);
  const setReviewPending = useRunStore((s) => s.setReviewPending);
  const restoreRunState = useRunStore((s) => s.restoreRunState);

  const [replyNotice, setReplyNotice] = useState<{ unread: number; chatUrl: string } | null>(null);

  // 初始化恢复运行状态
  useEffect(() => {
    ipc
      .getRunState()
      .then(({ running, review, stats, current_job, latest_skip, latest_sent, page, page_filters }) => {
        setRunning(running);
        setReviewPending(review?.pending ?? null);
        restoreRunState({
          stats,
          currentJob: current_job ?? null,
          latestSkip: latest_skip ?? null,
          latestSent: latest_sent ?? null,
          page: page ?? null,
          pageFilters: page_filters ?? [],
        });
      })
      .catch(() => {});
  }, [setRunning, setReviewPending, restoreRunState]);

  // F3：BOSS 新回复轮询（60s，仅空闲时）
  useEffect(() => {
    if (running) return;
    const timer = setInterval(async () => {
      try {
        const result = await ipc.checkBossReplies();
        if (result.status === "ok" && result.new_replies) {
          setReplyNotice({
            unread: result.unread ?? 0,
            chatUrl: result.chat_url ?? "https://www.zhipin.com/web/geek/chat",
          });
        }
      } catch {
        /* 轮询失败静默 */
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [running]);

  const eventStats = useMemo(() => summarizeEvents(events), [events]);
  const stats = events.length > 0 || !restoredStats ? eventStats : restoredStats;
  const currentJob = useMemo(
    () => latestJob(events) ?? restoredCurrentJob ?? undefined,
    [events, restoredCurrentJob],
  );
  const latestSkip = useMemo(
    () =>
      latestPayloadForJob(events, "job_skipped", currentJob) ??
      (events.length === 0 ? restoredLatestSkip : undefined) ??
      undefined,
    [events, currentJob, restoredLatestSkip],
  );
  const latestSent = useMemo(
    () =>
      latestPayloadForJob(events, "letter_sent", currentJob) ??
      (events.length === 0 ? restoredLatestSent : undefined) ??
      undefined,
    [events, currentJob, restoredLatestSent],
  );

  const statusText = running
    ? currentIndex
      ? t("status.runningIndex", { index: currentIndex })
      : t("status.starting")
    : t("status.idle");

  const startRun = useCallback(async () => {
    const error = validateBeforeRun();
    if (error) {
      setMessage(error);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await ipc.saveGreeting(greeting.trim(), greetingPath.trim() || "./greetings/default.txt");
      await ipc.saveProfile(profileName.trim(), currentProfileData());
      clear();
      setRunning(true);
      const progressChannel = new Channel<ProgressEvent>((ev) => {
        const timestamp = ev.ts_local || formatLocalTime();
        const event = { ...ev, ts_local: timestamp };
        pushEvent(event);
        pushLog(eventLogLine(event, timestamp));
      });
      const logChannel = new Channel<string>((line) => pushLog(`${formatLocalTime()} ${line}`));
      const config: RunConfig = {
        usrName: usrName.trim(),
        label: label.trim(),
        dryRun,
        profile: profileName.trim(),
        useCurrentPage: true,
      };
      await ipc.startRun(config, progressChannel, logChannel);
    } catch (err) {
      setRunning(false);
      pushLog(`${formatLocalTime()} ${t("message.startFailed", { error: String(err) })}`);
      setMessage(t("message.startFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }, [
    validateBeforeRun,
    greeting,
    greetingPath,
    profileName,
    currentProfileData,
    clear,
    setRunning,
    pushEvent,
    pushLog,
    usrName,
    label,
    dryRun,
    t,
    setBusy,
    setMessage,
  ]);

  const stopRun = useCallback(async () => {
    setBusy(true);
    try {
      await ipc.stopRun();
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.stopFailed", { error: String(err) })}`);
    } finally {
      setBusy(false);
    }
  }, [setBusy, pushLog, t]);

  const resetChrome = useCallback(async () => {
    setBusy(true);
    try {
      await ipc.shutdownBrowser();
      pushLog(`${formatLocalTime()} ${t("message.browserClosed")}`);
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.browserCloseFailed", { error: String(err) })}`);
    } finally {
      setBusy(false);
    }
  }, [setBusy, pushLog, t]);

  const openManualBrowser = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const state = await ipc.openManualBrowser();
      pushLog(`${formatLocalTime()} ${t("message.manualBrowserOpened")} ${state.url || ""}`.trim());
      setMessage(t("message.manualBrowserOpened"));
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.manualBrowserOpenFailed", { error: String(err) })}`);
      setMessage(t("message.manualBrowserOpenFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }, [setBusy, setMessage, pushLog, t]);

  const copyLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logs.join("\n"));
      setMessage(t("message.logsCopied"));
    } catch {
      setMessage(t("message.logsCopyFailed"));
    }
  }, [logs, setMessage, t]);

  const openChatPage = useCallback(async (url: string) => {
    setBusy(true);
    try {
      await ipc.openManualBrowser(url);
      setReplyNotice(null);
    } catch (err) {
      setMessage(t("message.manualBrowserOpenFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }, [setBusy, setMessage, t]);

  const submitReviewDecision = useCallback(
    async (decision: "send" | "skip" | "quit") => {
      setBusy(true);
      setMessage(null);
      try {
        await ipc.submitReviewDecision(decision);
        setMessage(
          decision === "send"
            ? t("message.reviewSend")
            : decision === "skip"
              ? t("message.reviewSkip")
              : t("message.reviewQuit"),
        );
      } catch (err) {
        setMessage(t("message.reviewSubmitFailed", { error: String(err) }));
      } finally {
        setBusy(false);
      }
    },
    [setBusy, setMessage, t],
  );

  return {
    busy,
    setBusy,
    message,
    setMessage,
    replyNotice,
    setReplyNotice,
    running,
    events,
    logs,
    currentIndex,
    stats,
    currentJob,
    latestSkip,
    latestSent,
    statusText,
    reviewPending,
    startRun,
    stopRun,
    resetChrome,
    openManualBrowser,
    copyLogs,
    openChatPage,
    submitReviewDecision,
  };
}
