/** 全局状态：当前是否在运行、最近事件、最近日志。Zustand。
 * 单页 GUI 内多个区域会同时读写这些状态，用全局 store 可以避免层层传参。 */
import { create } from "zustand";
import { useCallback } from "react";
import { translate } from "../lib/i18n";
import { createAgentSlice } from "./agentSlice";
import { createHeroSlice } from "./heroSlice";
import { createNoticeSlice } from "./noticeSlice";
import { createRunSlice } from "./runSlice";
import { createUiSlice } from "./ui";
import { createUpdateSlice } from "./updateSlice";
import type { RunStore } from "./types";

export const useRunStore = create<RunStore>()((...a) => ({
  ...createRunSlice(...a),
  ...createNoticeSlice(...a),
  ...createAgentSlice(...a),
  ...createHeroSlice(...a),
  ...createUiSlice(...a),
  ...createUpdateSlice(...a),
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
