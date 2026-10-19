import type { StateCreator } from "zustand";
import type { AgentChatMessage, LLMConfig } from "../lib/ipc";
import type { RunStore } from "./types";

const MAX_AGENT_MESSAGES = 200;
const AGENT_MESSAGES_STORAGE_KEY = "jobhunter_copilot_chat_history_v1";

function loadSavedAgentMessages(): AgentChatMessage[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(AGENT_MESSAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // 过滤掉所有超时、模型响应失败、JSON解析失败等历史崩溃废弃消息
      const cleaned = parsed.filter((m: AgentChatMessage) => {
        if (!m || typeof m.content !== "string") return false;
        const c = m.content;
        return (
          !c.includes("timeout") &&
          !c.includes("模型响应失败") &&
          !c.includes("出错了：") &&
          !c.includes("出错了:") &&
          !c.includes("不是合法 JSON")
        );
      });
      return cleaned.slice(-MAX_AGENT_MESSAGES);
    }
  } catch (err) {
    console.warn("Failed to load saved agent messages:", err);
  }
  return [];
}

function saveAgentMessages(messages: AgentChatMessage[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(AGENT_MESSAGES_STORAGE_KEY, JSON.stringify(messages));
  } catch (err) {
    console.warn("Failed to save agent messages:", err);
  }
}

export type AgentSlice = {
  // ---------- agent 智能助手（里程碑 1） ----------
  agentMessages: AgentChatMessage[];
  agentPending: boolean;
  agentProfilePreview: Record<string, unknown> | null;
  llmConfig: LLMConfig | null;
  llmSettingsOpen: boolean;

  pendingResumePolish: { name: string; text?: string } | null;
  setPendingResumePolish: (item: { name: string; text?: string } | null) => void;

  pushAgentMessage: (message: AgentChatMessage) => void;
  clearAgentMessages: () => void;
  setAgentPending: (pending: boolean) => void;
  setAgentProfilePreview: (profile: Record<string, unknown> | null) => void;
  setLLMConfig: (config: LLMConfig | null) => void;
  setLLMSettingsOpen: (open: boolean) => void;
};

export const createAgentSlice: StateCreator<RunStore, [], [], AgentSlice> = (set) => ({
  pendingResumePolish: null,
  setPendingResumePolish: (pendingResumePolish) => set({ pendingResumePolish }),

  agentMessages: loadSavedAgentMessages(),
  agentPending: false,
  agentProfilePreview: null,
  llmConfig: null,
  llmSettingsOpen: false,

  pushAgentMessage: (message) =>
    set((s) => {
      const next = [...s.agentMessages, message].slice(-MAX_AGENT_MESSAGES);
      saveAgentMessages(next);
      return { agentMessages: next };
    }),
  clearAgentMessages: () => {
    saveAgentMessages([]);
    set({ agentMessages: [], agentProfilePreview: null });
  },
  setAgentPending: (agentPending) => set({ agentPending }),
  setAgentProfilePreview: (agentProfilePreview) => set({ agentProfilePreview }),
  setLLMConfig: (llmConfig) => set({ llmConfig }),
  setLLMSettingsOpen: (llmSettingsOpen) => set({ llmSettingsOpen }),
});
