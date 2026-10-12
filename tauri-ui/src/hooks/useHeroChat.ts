import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { ipc, type AgentChatMessage, type ProfileData } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { extractFallbackProfile } from "../lib/dashboardHelpers";
import { normalizeCityInput } from "../lib/cityInput";
import type { RuleForm } from "../lib/profileForm";
import { useRunStore } from "../store";

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
  chatStartTime: number | null;
  chatPhaseText: string;
  heroChatMessages: AgentChatMessage[];
  setHeroChatMessages: (msgs: AgentChatMessage[] | ((prev: AgentChatMessage[]) => AgentChatMessage[])) => void;
  heroProfileResult: Record<string, unknown> | null;
  setHeroProfileResult: (res: Record<string, unknown> | null) => void;
  isChattingOrHasHistory: boolean;
  handleHeroChatSubmit: (text: string) => Promise<void>;
  resetHeroChat: () => void;
}

export function computePhaseText(startTime: number | null): string {
  if (!startTime) return "正在深度思考并提炼专属求职画像...";
  const sec = Math.floor((Date.now() - startTime) / 1000);
  if (sec < 3) {
    return "① 简历已就绪 · 正在解析专业技能结构与背景...";
  }
  if (sec < 8) {
    return "② 正在提炼核心技术栈与工作经验画像...";
  }
  if (sec < 14) {
    return "③ 正在匹配目标岗位、意向城市与排除项...";
  }
  return "④ 正在生成专属投递策略并同步至求职画像...";
}

export function useHeroChat({
  currentProfileData,
  setLabel,
  setCityValues,
  setRule,
  pushAgentMessage,
  setMessage,
}: UseHeroChatOptions): UseHeroChatReturn {
  const heroChatting = useRunStore((s) => s.heroChatting);
  const setHeroChatting = useRunStore((s) => s.setHeroChatting);
  const chatStartTime = useRunStore((s) => s.chatStartTime);
  const setChatStartTime = useRunStore((s) => s.setChatStartTime);
  const chatPhaseText = useRunStore((s) => s.chatPhaseText);
  const setChatPhaseText = useRunStore((s) => s.setChatPhaseText);
  const heroChatMessages = useRunStore((s) => s.heroChatMessages);
  const setHeroChatMessages = useRunStore((s) => s.setHeroChatMessages);
  const heroProfileResult = useRunStore((s) => s.heroProfileResult);
  const setHeroProfileResult = useRunStore((s) => s.setHeroProfileResult);

  // 定时刷新思考阶段文案，给用户清晰明确的进度预期
  useEffect(() => {
    if (!heroChatting || !chatStartTime) return;
    const interval = setInterval(() => {
      setChatPhaseText(computePhaseText(chatStartTime));
    }, 800);
    return () => clearInterval(interval);
  }, [heroChatting, chatStartTime, setChatPhaseText]);

  const isChattingOrHasHistory = heroChatMessages.length > 0 || heroChatting;

  const resetHeroChat = useCallback(() => {
    setHeroChatMessages([]);
    setHeroProfileResult(null);
    setChatStartTime(null);
    setHeroChatting(false);
    setChatPhaseText("正在深度思考并提炼专属求职画像...");
  }, [setHeroChatMessages, setHeroProfileResult, setChatStartTime, setHeroChatting, setChatPhaseText]);

  const handleHeroChatSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || heroChatting) return;

      const now = Date.now();
      setHeroChatting(true);
      setChatStartTime(now);
      setChatPhaseText(computePhaseText(now));
      setMessage(null);

      const userMsg: AgentChatMessage = { role: "user", content: trimmed };
      const newHistory: AgentChatMessage[] = [...heroChatMessages, userMsg];
      setHeroChatMessages(newHistory);
      pushAgentMessage(userMsg);

      try {
        const currentForm = currentProfileData();
        // 12 秒超时自动熔断保护：避免云端 LLM 排队挂起导致用户无限期卡在“工作中”
        const timeoutPromise = new Promise<{ status: "timeout" }>((resolve) =>
          setTimeout(() => resolve({ status: "timeout" }), 12000)
        );
        const resPromise = ipc.agentChat(trimmed, heroChatMessages.slice(-8), currentForm);

        // 至少给 1200ms 让用户看到优雅思考粒子，但绝不无限卡死
        const [res] = await Promise.all([
          Promise.race([resPromise, timeoutPromise]),
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);

        if (res.status === "ok") {
          const reply = res.reply || "收到！已根据你的背景情况完成求职意向诊断与画像提炼。";
          const assistantMsg: AgentChatMessage = { role: "assistant", content: reply };
          setHeroChatMessages([...newHistory, assistantMsg]);
          pushAgentMessage(assistantMsg);

          if (res.profile) {
            setHeroProfileResult(res.profile);
            const preview = summarizeAgentProfile(res.profile);
            if (preview?.query && preview.query !== "-") setLabel(preview.query);
            if (preview?.cities) setCityValues(normalizeCityInput(preview.cities));
            if (preview?.anyKeywords) setRule((prev) => ({ ...prev, anyKeywords: preview.anyKeywords }));
            if (preview?.excludeKeywords) setRule((prev) => ({ ...prev, excludeKeywords: preview.excludeKeywords }));
          }
        } else if (res.status === "timeout") {
          // 超时本地快速智能提炼兜底
          const extracted = extractFallbackProfile(trimmed);
          const reply = `已完成简历资料深度解析！由于云端模型网络响应排队较长（已为您自动启动极速本地画像引擎），已优先根据你的核心技术栈与专业方向定制专属求职画像。你可随时在【求职画像】中微调参数。`;
          const assistantMsg: AgentChatMessage = { role: "assistant", content: reply };
          setHeroChatMessages([...newHistory, assistantMsg]);
          pushAgentMessage(assistantMsg);

          setLabel(extracted.query);
          if (extracted.cities) setCityValues(normalizeCityInput(extracted.cities));
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
          if (extracted.cities) setCityValues(normalizeCityInput(extracted.cities));
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
        setChatStartTime(null);
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
    chatStartTime,
    chatPhaseText,
    heroChatMessages,
    setHeroChatMessages,
    heroProfileResult,
    setHeroProfileResult,
    isChattingOrHasHistory,
    handleHeroChatSubmit,
    resetHeroChat,
  };
}
