/** 提示域：中心 toast、FaceID 式登录浮层、全局消息通知队列。
 * 注：notification 单数字段为死字段已删（2026-10 P3-3，零消费者）。 */
import type { StateCreator } from "zustand";
import { auditDb } from "../lib/auditDb";
import type { RunStore } from "./types";

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

export type NoticeSlice = {
  // 软件中心浮现提示（登录成功等关键反馈：背景虚化 + 大字 + 自动渐隐）
  centerToast: { id: string; text: string; tone?: "success" | "error"; duration?: number } | null;
  showCenterToast: (text: string, opts?: { tone?: "success" | "error"; duration?: number }) => void;
  clearCenterToast: () => void;

  // FaceID 式登录引导浮层：点「换号」后全屏模糊 + 中央圆圈扫描动画，
  // 扫码成功 → 圆圈变绿色对勾 + "叮"一声（苹果解锁质感）
  loginOverlay: {
    platform: string;
    status: "waiting" | "success" | "error";
    message?: string;
  } | null;
  showLoginOverlay: (platform: string) => void;
  updateLoginOverlay: (patch: { status?: "waiting" | "success" | "error"; message?: string }) => void;
  hideLoginOverlay: () => void;

  // 全局联动消息通知（统一定位在左侧边栏，支持 8s 自动消失、最多5条折叠堆叠与双击平铺）
  notifications: NotificationItem[];
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
};

export const createNoticeSlice: StateCreator<RunStore, [], [], NoticeSlice> = (set) => ({
  centerToast: null,
  showCenterToast: (text, opts) =>
    set({
      centerToast: {
        id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        tone: opts?.tone ?? "success",
        duration: opts?.duration ?? 2000,
      },
    }),
  clearCenterToast: () => set({ centerToast: null }),
  loginOverlay: null,
  showLoginOverlay: (platform) => set({ loginOverlay: { platform, status: "waiting" } }),
  updateLoginOverlay: (patch) =>
    set((s) =>
      s.loginOverlay ? { loginOverlay: { ...s.loginOverlay, ...patch } } : {},
    ),
  hideLoginOverlay: () => set({ loginOverlay: null }),

  notifications: [],
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
      };
    });

    if (duration > 0) {
      setTimeout(() => {
        set((s) => {
          const nextList = s.notifications.filter((n) => n.id !== id);
          return {
            notifications: nextList,
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
      };
    }),
  clearNotification: () =>
    set((s) => {
      const nextList = s.notifications.slice(1);
      return {
        notifications: nextList,
      };
    }),
  clearAllNotifications: () => set({ notifications: [] }),
});
