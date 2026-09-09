/** 全局状态：当前是否在运行、最近事件、最近日志。Zustand。
 * 单页 GUI 内多个区域会同时读写这些状态，用全局 store 可以避免层层传参。 */
import { create } from "zustand";
import { useCallback } from "react";
import type { ProgressEvent } from "./lib/ipc";
import { type Lang, detectLang, translate } from "./lib/i18n";

const MAX_EVENTS = 500;
const MAX_LOGS = 1000;

type RunState = {
  running: boolean;
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

  // UI 语言：启动时按系统 locale 探测，仅保存在当前前端会话。
  lang: Lang;

  setRunning: (running: boolean) => void;
  pushEvent: (ev: ProgressEvent) => void;
  pushLog: (line: string) => void;
  clear: () => void;
  setLang: (lang: Lang) => void;
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

export const useRunStore = create<RunState>((set) => ({
  running: false,
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

  lang: detectLang(),

  setRunning: (running) => set({ running }),
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
      return { events, currentIndex, running, reviewPending };
    }),
  pushLog: (line) => set((s) => ({ logs: [...s.logs, line].slice(-MAX_LOGS) })),
  clear: () => set({
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
  }),
  setLang: (lang) => set({ lang }),
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
}));

/** 组件里取翻译函数：`const t = useT()`，`t("run.title")`。
 * 订阅 store.lang，切语言时所有用到的组件自动重渲染。 */
export function useT() {
  const lang = useRunStore((s) => s.lang);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
}
