import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import { ipc, type AgentChatMessage, type ProfileData } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { extractFallbackProfile } from "../lib/dashboardHelpers";
import type { RuleForm } from "../lib/profileForm";

interface UseHeroChatOptions {
  currentProfileData: () => ProfileData;
  setLabel: (label: string) => void;
  setCityValues: (cities: string) => void;
  setRule: Dispatch<SetStateAction<RuleForm>>;
  pushAgentMessage: (message: AgentChatMessage) => void;
  setMessage: (message: string | null) => void;
}

export interface UseHeroChatReturn {
  heroChatting: boolean;
  heroChatMessages: AgentChatMessage[];
  setHeroChatMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  heroProfileResult: Record<string, unknown> | null;
  setHeroProfileResult: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  isChattingOrHasHistory: boolean;
  handleHeroChatSubmit: (text: string) => Promise<void>;
  resetHeroChat: () => void;
}

export function useHeroChat({
  currentProfileData,
  setLabel,
  setCityValues,
  setRule,
  pushAgentMessage,
  setMessage,
}: UseHeroChatOptions): UseHeroChatReturn {
  const [heroChatting, setHeroChatting] = useState(false);
  const [heroChatMessages, setHeroChatMessages] = useState<AgentChatMessage[]>([]);
  const [heroProfileResult, setHeroProfileResult] = useState<Record<string, unknown> | null>(null);

  const isChattingOrHasHistory = heroChatMessages.length > 0 || heroChatting;

  const resetHeroChat = useCallback(() => {
    setHeroChatMessages([]);
    setHeroProfileResult(null);
  }, []);

  const handleHeroChatSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || heroChatting) return;

      setHeroChatting(true);
      setMessage(null);

      const userMsg: AgentChatMessage = { role: "user", content: trimmed };
      const newHistory: AgentChatMessage[] = [...heroChatMessages, userMsg];
      setHeroChatMessages(newHistory);
      pushAgentMessage(userMsg);

      try {
        const currentForm = currentProfileData();
        const res = await ipc.agentChat(trimmed, heroChatMessages.slice(-8), currentForm);
        if (res.status === "ok") {
          const reply = res.reply || "收到！已根据你的背景情况完成求职意向诊断与画像提炼。";
          const assistantMsg: AgentChatMessage = { role: "assistant", content: reply };
          setHeroChatMessages([...newHistory, assistantMsg]);
          pushAgentMessage(assistantMsg);

          if (res.profile) {
            setHeroProfileResult(res.profile);
            const preview = summarizeAgentProfile(res.profile);
            if (preview?.query && preview.query !== "-") setLabel(preview.query);
            if (preview?.cities) setCityValues(preview.cities);
            if (preview?.anyKeywords) setRule((prev) => ({ ...prev, anyKeywords: preview.anyKeywords }));
            if (preview?.excludeKeywords) setRule((prev) => ({ ...prev, excludeKeywords: preview.excludeKeywords }));
          }
        } else {
          const extracted = extractFallbackProfile(trimmed);
          let reply = res.message || "已收到你的求职背景情况。";
          if (res.code === "not_configured") {
            reply = `已收到你的求职情况！由于尚未在【设置 → AI 模型】中绑定 API Key，已先根据你提到的专业背景（${extracted.query} · ${extracted.cities || "全国"}）为你完成基础求职画像定制。建议在设置中填入 API Key 体验深度职业诊断。`;
          }
          const assistantMsg: AgentChatMessage = { role: "assistant", content: reply };
          setHeroChatMessages([...newHistory, assistantMsg]);
          pushAgentMessage(assistantMsg);

          setLabel(extracted.query);
          if (extracted.cities) setCityValues(extracted.cities);
          if (extracted.anyKeywords) setRule((prev) => ({ ...prev, anyKeywords: extracted.anyKeywords }));
          if (extracted.excludeKeywords) setRule((prev) => ({ ...prev, excludeKeywords: extracted.excludeKeywords }));

          setHeroProfileResult({
            search: { query: extracted.query },
            page_filters: { city: { values: extracted.cities ? extracted.cities.split(",") : [] } },
            filters: {
              title: {
                any: { keywords: extracted.anyKeywords ? extracted.anyKeywords.split(",") : [extracted.query] },
                exclude: { keywords: extracted.excludeKeywords ? extracted.excludeKeywords.split(",") : [] },
              },
            },
          });
        }
      } catch (err) {
        const errMsg = `顾问连线异常：${String(err)}`;
        const assistantMsg: AgentChatMessage = { role: "assistant", content: errMsg };
        setHeroChatMessages([...newHistory, assistantMsg]);
        pushAgentMessage(assistantMsg);
      } finally {
        setHeroChatting(false);
      }
    },
    [
      heroChatting,
      heroChatMessages,
      currentProfileData,
      pushAgentMessage,
      setMessage,
      setLabel,
      setCityValues,
      setRule,
    ],
  );

  return {
    heroChatting,
    heroChatMessages,
    setHeroChatMessages,
    heroProfileResult,
    setHeroProfileResult,
    isChattingOrHasHistory,
    handleHeroChatSubmit,
    resetHeroChat,
  };
}
