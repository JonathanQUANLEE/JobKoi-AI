/** 全局状态：当前是否在运行、最近事件、最近日志。Zustand。
 * 单页 GUI 内多个区域会同时读写这些状态，用全局 store 可以避免层层传参。 */
import { create } from "zustand";
import { useCallback } from "react";
import type { AgentChatMessage, LLMConfig, ProgressEvent } from "./lib/ipc";
import { type Lang, detectLang, translate } from "./lib/i18n";
import { auditDb } from "./lib/auditDb";

const MAX_EVENTS = 500;
const MAX_LOGS = 1000;
const MAX_AGENT_MESSAGES = 200;
const MAX_ACTIVE_NOTIFICATIONS = 5;

export type NotificationItem = {
  id: string;
  type: "success" | "error" | "info" | "warning";
  text: string;
  source?: string;
  duration?: number;
  timestamp: number;
  timeFormatted: string;
};

export type AppTheme = "classic" | "monochrome" | "system";

export function getInitialTheme(): AppTheme {
  try {
    const saved = localStorage.getItem("jobhunter_theme") as AppTheme | null;
    if (saved === "classic" || saved === "monochrome" || saved === "system") {
      return saved;
    }
  } catch {}
  return "monochrome";
}

export function applyThemeToDOM(theme: AppTheme) {
  try {
    localStorage.setItem("jobhunter_theme", theme);
    const resolved =
      theme === "system"
        ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "monochrome"
          : "classic"
        : theme;
    document.documentElement.setAttribute("data-theme", resolved);
    if (resolved === "monochrome") {
      document.documentElement.classList.add("theme-monochrome");
      document.documentElement.classList.remove("theme-classic");
    } else {
      document.documentElement.classList.add("theme-classic");
      document.documentElement.classList.remove("theme-monochrome");
    }
  } catch {}
}

// 模块加载时即刻同步 DOM 属性
if (typeof window !== "undefined") {
  applyThemeToDOM(getInitialTheme());
}

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

  // 常驻限额停机横幅：本地安全限额 / 平台限额提示命中后持续显示，直到下一轮运行
  limitNotice: { message: string } | null;
  setLimitNotice: (notice: { message: string } | null) => void;

  // 全局联动消息通知（统一定位在左侧边栏，支持 8s 自动消失、最多5条折叠堆叠与双击平铺）
  notifications: NotificationItem[];
  notification: NotificationItem | null;
  notify: (item: {
    type: "success" | "error" | "info" | "warning";
    text: string;
    source?: string;
    duration?: number;
    details?: string;
  }) => void;
  removeNotification: (id: string) => void;
  clearNotification: () => void;
  clearAllNotifications: () => void;

  // 主题外观系统：支持经典琥珀与黑白高级感（Monochrome Luxe）
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;

  // UI 语言：启动时按系统 locale 探测，仅保存在当前前端会话。
  lang: Lang;

  // ---------- agent 智能助手（里程碑 1） ----------
  agentMessages: AgentChatMessage[];
  agentPending: boolean;
  agentProfilePreview: Record<string, unknown> | null;
  llmConfig: LLMConfig | null;
  llmSettingsOpen: boolean;

  pendingResumePolish: { name: string; text?: string } | null;
  setPendingResumePolish: (item: { name: string; text?: string } | null) => void;

  pushAgentMessage: (message: AgentChatMessage) => void;
  setAgentPending: (pending: boolean) => void;
  setAgentProfilePreview: (profile: Record<string, unknown> | null) => void;
  setLLMConfig: (config: LLMConfig | null) => void;
  setLLMSettingsOpen: (open: boolean) => void;

  // ---------- 巡航工作台 AI 顾问意向对话持久状态 ----------
  heroChatting: boolean;
  chatStartTime: number | null;
  chatPhaseText: string;
  heroChatMessages: AgentChatMessage[];
  heroProfileResult: Record<string, unknown> | null;
  setHeroChatting: (chatting: boolean) => void;
  setChatStartTime: (time: number | null) => void;
  setChatPhaseText: (text: string) => void;
  setHeroChatMessages: (msgs: AgentChatMessage[] | ((prev: AgentChatMessage[]) => AgentChatMessage[])) => void;
  setHeroProfileResult: (res: Record<string, unknown> | null) => void;

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
  limitNotice: null,
  setLimitNotice: (limitNotice) => set({ limitNotice }),

  lang: detectLang(),

  pendingResumePolish: null,
  setPendingResumePolish: (pendingResumePolish) => set({ pendingResumePolish }),

  agentMessages: [],
  agentPending: false,
  agentProfilePreview: null,
  llmConfig: null,
  llmSettingsOpen: false,

  notifications: [],
  notification: null,
  notify: (item) => {
    const timestamp = Date.now();
    const id = `notif_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;
    const d = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const timeFormatted = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const duration = item.duration ?? 8000; // 默认 8 秒后自动消失

    // 同步持久化记录到本地审计数据库
    auditDb.addLog({
      type: item.type,
      text: item.text,
      source: item.source,
      details: item.details,
    });

    const newItem: NotificationItem = {
      id,
      type: item.type,
      text: item.text,
      source: item.source,
      duration,
      timestamp,
      timeFormatted,
    };

    set((s) => {
      // 保持最多 5 条活跃通知，新通知置于顶层
      const nextList = [newItem, ...s.notifications.filter((n) => n.id !== id)].slice(
        0,
        MAX_ACTIVE_NOTIFICATIONS
      );
      return {
        notifications: nextList,
        notification: nextList[0] || null,
      };
    });

    if (duration > 0) {
      setTimeout(() => {
        set((s) => {
          const nextList = s.notifications.filter((n) => n.id !== id);
          return {
            notifications: nextList,
            notification: nextList[0] || null,
          };
        });
      }, duration);
    }
  },
  removeNotification: (id) =>
    set((s) => {
      const nextList = s.notifications.filter((n) => n.id !== id);
      return {
        notifications: nextList,
        notification: nextList[0] || null,
      };
    }),
  clearNotification: () =>
    set((s) => {
      const nextList = s.notifications.slice(1);
      return {
        notifications: nextList,
        notification: nextList[0] || null,
      };
    }),
  clearAllNotifications: () => set({ notifications: [], notification: null }),

  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyThemeToDOM(theme);
    set({ theme });
  },

  pushAgentMessage: (message) =>
    set((s) => ({
      agentMessages: [...s.agentMessages, message].slice(-MAX_AGENT_MESSAGES),
    })),
  setAgentPending: (agentPending) => set({ agentPending }),
  setAgentProfilePreview: (agentProfilePreview) => set({ agentProfilePreview }),
  setLLMConfig: (llmConfig) => set({ llmConfig }),
  setLLMSettingsOpen: (llmSettingsOpen) => set({ llmSettingsOpen }),

  heroChatting: false,
  chatStartTime: null,
  chatPhaseText: "正在深度思考并提炼专属求职画像...",
  heroChatMessages: [],
  heroProfileResult: null,

  setHeroChatting: (heroChatting) => set({ heroChatting }),
  setChatStartTime: (chatStartTime) => set({ chatStartTime }),
  setChatPhaseText: (chatPhaseText) => set({ chatPhaseText }),
  setHeroChatMessages: (msgs) =>
    set((s) => ({
      heroChatMessages: typeof msgs === "function" ? msgs(s.heroChatMessages) : msgs,
    })),
  setHeroProfileResult: (heroProfileResult) => set({ heroProfileResult }),

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
