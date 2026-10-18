import { useState, useEffect, useMemo, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { Channel } from "@tauri-apps/api/core";
import { ipc, type ProgressEvent, type RunConfig, type ProfileData } from "../lib/ipc";
import { eventLogLine } from "../lib/eventDisplay";
import { latestPayloadForJob } from "../lib/runView";
import { useRunStore } from "../store";
import {
  latestJob,
  summarizeEvents,
  formatLocalTime,
  hasUnsavedProfileChanges,
} from "../lib/dashboardHelpers";

/** 读取平台中心勾选的巡航平台（localStorage 由 PlatformHub 写入）。 */
function loadEnabledPlatforms(): string[] {
  try {
    const saved = localStorage.getItem("jobhunter_enabled_platforms");
    const parsed = saved ? JSON.parse(saved) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((item) => typeof item === "string");
    }
  } catch {
    /* ignore */
  }
  return ["boss"];
}

interface UseJobBotRuntimeOptions {
  t: (key: string, vars?: Record<string, string | number>) => string;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  message: string | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  usrName: string;
  label: string;
  profileName: string;
  greeting: string;
  greetingPath: string;
  currentProfileData: () => ProfileData;
  validateBeforeRun: () => string | null;
  /** 巡航成功启动后的回调（Dashboard 用它跳转到「实时巡航」监控页）。 */
  onCruiseStarted?: () => void;
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
  profileName,
  greeting,
  greetingPath,
  currentProfileData,
  validateBeforeRun,
  onCruiseStarted,
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

  // 巡航结束（running true→false）：组装「结束说明弹窗」（2026-10-12 用户拍板：
  // 无论什么原因结束都要如实解释——原因 + 汇总 + 按城市拆开的统计，用户点叉关闭）。
  const prevRunningRef = useRef(running);
  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = running;
    if (!wasRunning || running) return;
    let ended: ProgressEvent | null = null;
    // 收集全部平台的结束汇总（BOSS/猎聘/51job 并发巡航时各发一份），
    // 统计跨平台聚合；城市明细与人话解释优先用 BOSS 的（只有它带 per_city）。
    const summaries: ProgressEvent[] = [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      if (!ended && ev.kind === "loop_ended") ended = ev;
      if (ev.kind === "api_flow_finished") summaries.push(ev);
      if (ended && summaries.length > 0 && ev.kind === "api_flow_started") break;
    }
    if (!ended) return;
    const bossSummary =
      summaries.find((s) => s.payload.platform === "boss") ?? summaries[summaries.length - 1];
    const summary = summaries.length > 0 ? bossSummary : null;
    const reasonMap: Record<string, string> = {
      completed: "本轮巡航已结束",
      cancelled: "巡航已手动停止",
      error: "巡航异常终止",
    };
    const perCity = Array.isArray(summary?.payload.per_city)
      ? (summary!.payload.per_city as {
          city: string;
          scanned: number;
          sent: number;
          skipped: number;
        }[])
      : [];
    // 统计口径：后端权威汇总优先（事件流超 500 条会被截断、前端重数会失真
    // ——2026-10-12 实测"扫描 0/跳过 249"对不上"扫描 330"），多平台并发时
    // 把各平台的汇总加总；没有任何汇总的 DOM 流才用前端事件流统计兜底。
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const stats =
      summaries.length > 0
        ? summaries.reduce(
            (acc, s) => ({
              scanned: acc.scanned + num(s.payload.scanned),
              sent: acc.sent + num(s.payload.total),
              skipped:
                acc.skipped +
                num(s.payload.skipped_duplicates) +
                num(s.payload.skipped_filtered) +
                num(s.payload.skipped_already_contacted) +
                num(s.payload.failed),
            }),
            { scanned: 0, sent: 0, skipped: 0 },
          )
        : summarizeEvents(events);
    const startedAt = useRunStore.getState().cruiseStartedAt;
    useRunStore.getState().showCruiseEndNotice({
      reason: reasonMap[String(ended.payload.reason || "")] || "巡航已结束",
      message: String(summary?.payload?.message || ""),
      perCity,
      stats,
      durationMs: startedAt ? Date.now() - startedAt : null,
      time: ended.ts_local || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

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
    // 知情确认（方案 1）：表单与磁盘不一致时先弹窗告知"启动会自动保存"。
    // 行为零变化——只是把 startRun 原有的启动前自动保存从"静默"变"可见"。
    if (running) {
      // 已在巡航中：不做未保存判断，直接走原有流程（后端会报 already_running）
    } else {
      const dirty = await hasUnsavedProfileChanges({
        profileName,
        currentProfileData,
        greeting,
        greetingPath,
      });
      if (dirty) {
        const proceed = await new Promise<boolean>((resolve) => {
          useRunStore.getState().requestStartConfirm(resolve);
        });
        if (!proceed) return;
      }
    }

    const error = validateBeforeRun();
    if (error) {
      setMessage(error);
      useRunStore.getState().notify({
        type: "warning",
        text: `无法启动巡航：${error}`,
        source: "巡航启动",
      });
      return;
    }

    // 前置反馈 1：已勾选平台的登录态——若勾选了某平台且尚未登录，拦截并引导去平台中心扫码
    try {
      const plats = await ipc.listPlatforms();
      const enabled = loadEnabledPlatforms();
      for (const pId of enabled) {
        const p = plats.platforms.find((item) => item.id === pId);
        if (p && (p.status_text || "").includes("未登录")) {
          const name = p.name || pId;
          setMessage(`${name}尚未登录：请先在「招聘平台中心」点登录扫码，再启动巡航。`);
          useRunStore.getState().notify({
            type: "warning",
            text: `${name}尚未登录，请先在招聘平台中心扫码登录！`,
            source: "巡航启动",
          });
          return;
        }
      }
    } catch {
      /* 平台状态查询失败时交给后端 log_in 兜底，不重复拦截 */
    }

    // 前置反馈 2：未绑定默认简历 → 软提醒（不阻塞）
    try {
      const resumeRes = await ipc.listResumes();
      if (!resumeRes.resumes.some((item) => item.is_default)) {
        useRunStore.getState().notify({
          type: "info",
          text: "尚未绑定默认简历：建议到「简历资料库」设置默认简历，联系 HR 时沟通率更高。",
          source: "发车提醒",
        });
      }
    } catch {
      /* 简历列表读取失败不阻塞巡航 */
    }
    setBusy(true);
    setMessage(null);
    try {
      const effectiveGreeting = greeting.trim() || "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流！";
      await ipc.saveGreeting(effectiveGreeting, greetingPath.trim() || "./greetings/default.txt");
      await ipc.saveProfile(profileName.trim(), currentProfileData());
      clear();
      setRunning(true);
      useRunStore.getState().notify({
        type: "info",
        text: `已启动「${label.trim() || "全自动"}」自动巡航，正在唤起/连接受控浏览器...`,
        source: "巡航工作台",
      });
      const progressChannel = new Channel<ProgressEvent>((ev) => {
        const timestamp = ev.ts_local || formatLocalTime();
        const event = { ...ev, ts_local: timestamp };
        pushEvent(event);
        pushLog(eventLogLine(event, timestamp));

        if (ev.kind === "limit_reached" || (ev as any).reason === "daily_limit") {
          useRunStore.getState().notify({
            type: "warning",
            text: (ev as any).message || "今日投递已达安全上限，已自动安全停机以保护账号安全！",
            source: "安全防护",
            duration: 12000,
          });
        }
        // 验证码强提醒（2026-10-18 用户需求）：窗口已被后端强制前置，
        // 前端同步弹一条长停留通知，把"需要你现在去验证"说清楚——否则
        // 用户只看到巡航莫名结束，不知道要处理浏览器里的验证码。
        if (ev.kind === "captcha_stopped") {
          const p = ev.payload as Record<string, unknown>;
          const platformName =
            p.platform === "liepin" ? "猎聘" : p.platform === "job51" ? "前程无忧" : "BOSS 直聘";
          useRunStore.getState().notify({
            type: "error",
            text:
              (typeof p.message === "string" && p.message) ||
              `${platformName}触发验证码/安全验证，巡航已停止。请立即在已弹出的浏览器窗口中完成验证。`,
            source: "需要你处理",
            duration: 60000,
          });
        }
      });
      const logChannel = new Channel<string>((line) => pushLog(`${formatLocalTime()} ${line}`));
      const config: RunConfig = {
        usrName: usrName.trim() || "求职者",
        label: label.trim(),
        profile: profileName.trim(),
        useCurrentPage: false,
        platforms: loadEnabledPlatforms(),
      };
      await ipc.startRun(config, progressChannel, logChannel);
      onCruiseStarted?.();
    } catch (err) {
      setRunning(false);
      pushLog(`${formatLocalTime()} ${t("message.startFailed", { error: String(err) })}`);
      setMessage(t("message.startFailed", { error: String(err) }));
      useRunStore.getState().notify({
        type: "error",
        text: `启动巡航失败: ${String(err)}`,
        source: "巡航工作台",
      });
    } finally {
      setBusy(false);
    }
  }, [
    validateBeforeRun,
    greeting,
    greetingPath,
    profileName,
    currentProfileData,
    running,
    clear,
    setRunning,
    pushEvent,
    pushLog,
    usrName,
    label,
    t,
    setBusy,
    setMessage,
    onCruiseStarted,
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
