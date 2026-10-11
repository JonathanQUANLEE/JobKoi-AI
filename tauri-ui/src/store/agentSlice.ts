import type { StateCreator } from "zustand";
import type { AgentChatMessage, LLMConfig } from "../lib/ipc";
import type { RunStore } from "./types";

const MAX_AGENT_MESSAGES = 200;

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
  setAgentPending: (pending: boolean) => void;
  setAgentProfilePreview: (profile: Record<string, unknown> | null) => void;
  setLLMConfig: (config: LLMConfig | null) => void;
  setLLMSettingsOpen: (open: boolean) => void;
};

export const createAgentSlice: StateCreator<RunStore, [], [], AgentSlice> = (set) => ({
  pendingResumePolish: null,
  setPendingResumePolish: (pendingResumePolish) => set({ pendingResumePolish }),

  agentMessages: [],
  agentPending: false,
  agentProfilePreview: null,
  llmConfig: null,
  llmSettingsOpen: false,

  pushAgentMessage: (message) =>
    set((s) => ({
      agentMessages: [...s.agentMessages, message].slice(-MAX_AGENT_MESSAGES),
    })),
  setAgentPending: (agentPending) => set({ agentPending }),
  setAgentProfilePreview: (agentProfilePreview) => set({ agentProfilePreview }),
  setLLMConfig: (llmConfig) => set({ llmConfig }),
  setLLMSettingsOpen: (llmSettingsOpen) => set({ llmSettingsOpen }),
});
