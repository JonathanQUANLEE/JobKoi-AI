import type { StateCreator } from "zustand";
import { type Lang, detectLang } from "../lib/i18n";
import type { RunStore } from "./types";

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

export type UiSlice = {
  // 主题外观系统：支持经典琥珀与黑白高级感（Monochrome Luxe）
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;

  // UI 语言：启动时按系统 locale 探测，仅保存在当前前端会话。
  lang: Lang;
  setLang: (lang: Lang) => void;
};

export const createUiSlice: StateCreator<RunStore, [], [], UiSlice> = (set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyThemeToDOM(theme);
    set({ theme });
  },

  lang: detectLang(),
  setLang: (lang) => set({ lang }),
});
