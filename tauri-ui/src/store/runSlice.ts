import type { StateCreator } from "zustand";
import type { ProgressEvent } from "../lib/ipc";
import type { RunStore } from "./types";

const MAX_EVENTS = 500;
const MAX_LOGS = 1000;

export type RunSlice = {
  running: boolean;
  /** 最近一次巡航的开始时刻（实时巡航页的运行时长计时器用；停止后保留供回看） */
  cruiseStartedAt: number | null;
  events: ProgressEvent[];
  logs: string[];
  currentIndex: number | null;  // 当前 job_index（从 job_found 提取）
  reviewPending: Record<string, unknown> | null;
  restoredStats: { scanned: number; sent: number; skipped: number } | null;
  restoredCurrentJob: Record<string, unknown> | null;
  restoredLatestSkip: Record<string, unknown> | null;
  restoredLatestSent: Record<string, unknown> | null;
  restoredPage: Record<string, unknown> | null;
  restoredPageFilters: Record<string, unknown>[];

  // 常驻限额停机横幅：本地安全限额 / 平台限额提示 / 登录失效命中后持续显示，直到下一轮运行
  limitNotice: { message: string } | null;
  setLimitNotice: (notice: { message: string } | null) => void;

  setRunning: (running: boolean) => void;
  pushEvent: (ev: ProgressEvent) => void;
  pushLog: (line: string) => void;
  clear: () => void;
  setReviewPending: (pending: Record<string, unknown> | null) => void;
  restoreRunState: (state: {
    stats?: { scanned: number; sent: number; skipped: number };
    currentJob?: Record<string, unknown> | null;
    latestSkip?: Record<string, unknown> | null;
    latestSent?: Record<string, unknown> | null;
    page?: Record<string, unknown> | null;
    pageFilters?: Record<string, unknown>[];
  }) => void;
};

export const createRunSlice: StateCreator<RunStore, [], [], RunSlice> = (set) => ({
  running: false,
  cruiseStartedAt: null,
  events: [],
  logs: [],
  currentIndex: null,
  reviewPending: null,
  restoredStats: null,
  restoredCurrentJob: null,
  restoredLatestSkip: null,
  restoredLatestSent: null,
  restoredPage: null,
  restoredPageFilters: [],
  limitNotice: null,
  setLimitNotice: (limitNotice) => set({ limitNotice }),

  setRunning: (running) =>
    set((s) => ({
      running,
      // 启动时记录开始时刻（实时巡航页计时器）；停止时保留旧值供"上次巡航"回看
      cruiseStartedAt: running ? Date.now() : s.cruiseStartedAt,
    })),
  pushEvent: (ev) =>
    set((s) => {
      const events = [...s.events, ev].slice(-MAX_EVENTS);
      let currentIndex = s.currentIndex;
      if (ev.kind === "job_found" && typeof ev.payload.index === "number") {
        currentIndex = ev.payload.index;
      }
      let reviewPending = s.reviewPending;
      if (ev.kind === "review_requested") {
        reviewPending = ev.payload;
      }
      if (ev.kind === "review_cleared" || ev.kind === "loop_ended") {
        reviewPending = null;
      }
      let running = s.running;
      if (ev.kind === "loop_ended") {
        running = false;
      }
      // 常驻停机横幅：本地安全限额 / 平台限额提示 / 登录失效命中后持续显示，直到下一轮运行
      let limitNotice = s.limitNotice;
      if (
        ev.kind === "limit_reached" ||
        ev.kind === "platform_limit_reached" ||
        ev.kind === "login_required"
      ) {
        const msg =
          typeof ev.payload.message === "string" && ev.payload.message.trim()
            ? ev.payload.message
            : "今日投递已达上限，已安全停止。可在「投递明细记录」中查看今天的实际投递数量。";
        limitNotice = { message: msg };
      }
      return { events, currentIndex, running, reviewPending, limitNotice };
    }),
  pushLog: (line) => set((s) => ({ logs: [...s.logs, line].slice(-MAX_LOGS) })),
  clear: () => set({
    events: [],
    logs: [],
    currentIndex: null,
    reviewPending: null,
    limitNotice: null,
    restoredStats: null,
    restoredCurrentJob: null,
    restoredLatestSkip: null,
    restoredLatestSent: null,
    restoredPage: null,
    restoredPageFilters: [],
  }),
  setReviewPending: (pending) => set({ reviewPending: pending }),
  restoreRunState: ({ stats, currentJob, latestSkip, latestSent, page, pageFilters }) =>
    set({
      restoredStats: stats ?? null,
      restoredCurrentJob: currentJob ?? null,
      restoredLatestSkip: latestSkip ?? null,
      restoredLatestSent: latestSent ?? null,
      restoredPage: page ?? null,
      restoredPageFilters: pageFilters ?? [],
    }),
});
