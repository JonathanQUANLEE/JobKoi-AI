import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useRunStore } from "../store";
import { MagicCard } from "./core/MagicBento";
import type { AgentPanelProps } from "./agent/types";
import ResumePolishView from "./agent/ResumePolishView";
import CareerCopilotView from "./agent/CareerCopilotView";

export default function AgentPanel({
  getCurrentForm,
  onApply,
  onRun,
  onExecuteAction,
}: AgentPanelProps) {
  const llmConfig = useRunStore((s) => s.llmConfig);
  const setLLMConfig = useRunStore((s) => s.setLLMConfig);
  const pendingResumePolish = useRunStore((s) => s.pendingResumePolish);

  // 主模式切换：默认主打简历精修，支持切换求职意向画像
  const [panelMode, setPanelMode] = useState<"polish" | "copilot">("polish");

  // 1. 初始化大模型配置
  useEffect(() => {
    if (llmConfig) return;
    ipc.getLLMConfig().then((cfg) => setLLMConfig(cfg)).catch(() => {});
  }, [llmConfig, setLLMConfig]);

  // 2. 响应从简历资料库一键跳转过来的待精修简历
  useEffect(() => {
    if (pendingResumePolish) {
      setPanelMode("polish");
    }
  }, [pendingResumePolish]);

  return (
    <MagicCard
      className="panel w-full flex-1 flex flex-col min-h-[calc(100vh-100px)] !p-5 sm:!p-6 !max-w-none shadow-2xl"
      glowColor="245, 158, 11"
      enableTilt={false}
    >
      {/* 顶部状态栏：可爱机器人头像 + 统一「简历精修」标题 + 模式切换 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-4 border-b border-stone-800/80">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0">
            <img
              src="/favicon.png"
              alt="AI 简历精修助手"
              className="size-10 rounded-2xl object-cover border border-amber-500/40 shadow-md shadow-amber-500/20"
            />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-stone-900" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-100 tracking-tight">
                {panelMode === "polish" ? "简历精修" : "求职意向画像"}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {panelMode === "polish" ? "AI 深度优化" : "意向提炼"}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mt-0.5">
              {panelMode === "polish"
                ? "结构梳理 · 成果量化 · 岗位关键词匹配 · 用词润色"
                : "对话提炼求职意向 · 自动生成过滤与投递画像"}
            </p>
          </div>
        </div>

        {/* 顶部右侧切换模式 */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-stone-900/90 p-0.5 border border-stone-800">
            <button
              type="button"
              onClick={() => setPanelMode("polish")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                panelMode === "polish"
                  ? "bg-amber-500 text-stone-950 shadow-sm"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>简历精修</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelMode("copilot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                panelMode === "copilot"
                  ? "bg-amber-500 text-stone-950 shadow-sm"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <span>意向管家</span>
            </button>
          </div>
        </div>
      </div>

      {/* 模式 A: 简历精修 Studio */}
      {panelMode === "polish" && (
        <ResumePolishView getCurrentForm={getCurrentForm} />
      )}

      {/* 模式 B: 求职意向画像 */}
      {panelMode === "copilot" && (
        <CareerCopilotView
          getCurrentForm={getCurrentForm}
          onApply={onApply}
          onRun={onRun}
          onExecuteAction={onExecuteAction}
        />
      )}
    </MagicCard>
  );
}
