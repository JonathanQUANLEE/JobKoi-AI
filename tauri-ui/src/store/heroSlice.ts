import type { StateCreator } from "zustand";
import type { AgentChatMessage } from "../lib/ipc";
import type { RunStore } from "./types";

export type HeroSlice = {
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
};

export const createHeroSlice: StateCreator<RunStore, [], [], HeroSlice> = (set) => ({
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
});
