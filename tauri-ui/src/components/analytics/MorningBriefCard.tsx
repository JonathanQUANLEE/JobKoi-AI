import { useState } from "react";
import { Sparkles, Sun, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import type { MorningBrief } from "../../lib/deliveryHistory";
import { AnimatedNumber } from "../core/animated-number";

interface MorningBriefCardProps {
  brief: MorningBrief;
  isMonochrome: boolean;
  onRefreshBrief?: () => void;
  onStartCruise?: () => void;
}

export default function MorningBriefCard({
  brief,
  isMonochrome,
  onRefreshBrief,
}: MorningBriefCardProps) {
  const [copied, setCopied] = useState(false);
  // hasReplyData=false（真实模式）：三平台无回复检测能力，回复区域显示「建设中」，绝不编造数字
  const showReply = brief.hasReplyData !== false;

  const handleCopySummary = () => {
    const replyLine = showReply
      ? `HR 回复: ${brief.repliedCount} 家 | 暂无回复: ${brief.unrepliedCount} 家\n综合回复率: ${brief.replyRate}%\n各平台回复: BOSS直聘 ${brief.platformBreakdown[0].replied}家 (${brief.platformBreakdown[0].rate}%) | 猎聘 ${brief.platformBreakdown[1].replied}家 (${brief.platformBreakdown[1].rate}%) | 51job ${brief.platformBreakdown[2].replied}家 (${brief.platformBreakdown[2].rate}%)`
      : `HR 回复: 回复统计暂未开放（平台未提供回复数据）`;
    const text = `【JobHunter 投递早报 · 昨日战报】\n日期: ${brief.yesterdayDate}\n昨日总投: ${brief.totalSent} 家\n${replyLine}\n今日建议: ${brief.actionAdvice}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`p-5 rounded-2xl border backdrop-blur-xl relative overflow-hidden space-y-4 ${
        isMonochrome
          ? "bg-zinc-950/70 border-white/10"
          : "bg-gradient-to-br from-amber-500/10 via-stone-900/60 to-purple-500/10 border-amber-500/20"
      }`}
    >
      {/* 头部标题与时点 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div
            className={`size-8 rounded-xl flex items-center justify-center border ${
              isMonochrome
                ? "bg-white/10 text-white border-white/20"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            }`}
          >
            <Sun className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">投递早报 · 昨日反馈归纳复盘</h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                  isMonochrome
                    ? "bg-white/10 text-zinc-200 border-white/20"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                }`}
              >
                每日 09:00 定时结算
              </span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              统计周期: {brief.yesterdayDate} 昨日全天投递成效
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefreshBrief}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 text-xs transition-colors cursor-pointer flex items-center gap-1 border border-white/10"
            title="刷新昨日统计"
          >
            <RefreshCw className="size-3.5" />
            <span>刷新</span>
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border flex items-center gap-1 ${
              isMonochrome
                ? "bg-white hover:bg-zinc-200 text-black border-transparent font-bold shadow-sm"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30"
            }`}
          >
            {copied ? "已复制早报" : "复制早报摘要"}
          </button>
        </div>
      </div>

      {/* 核心指标统计带：昨日投递数、回复数、未回复数、昨日回复率 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
          <span className="text-[11px] text-stone-400 block mb-1">昨日投递总量</span>
          <div className="flex items-baseline gap-1.5">
            <AnimatedNumber
              value={brief.totalSent}
              className="text-2xl font-black text-white font-mono"
            />
            <span className="text-xs text-stone-500">家</span>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isMonochrome
              ? "bg-white/[0.06] border-white/15"
              : "bg-emerald-500/10 border-emerald-500/20"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[11px] ${isMonochrome ? "text-zinc-300" : "text-emerald-300"}`}>
              HR 已回复
            </span>
            <CheckCircle2 className={`size-3.5 ${isMonochrome ? "text-white" : "text-emerald-400"}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            {showReply ? (
              <>
                <AnimatedNumber
                  value={brief.repliedCount}
                  className={`text-2xl font-black font-mono ${isMonochrome ? "text-white" : "text-emerald-400"}`}
                />
                <span className={`text-xs ${isMonochrome ? "text-zinc-400" : "text-emerald-500/80"}`}>家</span>
              </>
            ) : (
              <span className="text-2xl font-black font-mono text-stone-500">—</span>
            )}
          </div>
          {!showReply && <p className="text-[10px] text-stone-500 mt-0.5">回复统计 · 建设中</p>}
        </div>

        <div className="p-3.5 rounded-xl bg-stone-800/40 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-stone-400">{showReply ? "暂无回复" : "待回复岗位"}</span>
            <XCircle className="size-3.5 text-stone-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            {showReply ? (
              <>
                <AnimatedNumber
                  value={brief.unrepliedCount}
                  className="text-2xl font-black text-stone-300 font-mono"
                />
                <span className="text-xs text-stone-500">家</span>
              </>
            ) : (
              <span className="text-2xl font-black font-mono text-stone-500">—</span>
            )}
          </div>
        </div>

        {/* 回复率卡片 - 黑白高级感呈现高反差纯白卡片，黑金呈现金琥珀渐变 */}
        <div
          className={`p-3.5 rounded-xl border ${
            isMonochrome
              ? "bg-white text-black border-transparent shadow-xl shadow-white/10"
              : "bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/30"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[11px] font-semibold ${isMonochrome ? "text-zinc-800" : "text-amber-300"}`}>
              昨日综合回复率
            </span>
            {showReply && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                  isMonochrome ? "bg-black/10 text-black font-bold" : "text-amber-400/90 font-mono"
                }`}
              >
                {brief.replyRate >= 20 ? "良好" : "平稳"}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            {showReply ? (
              <>
                <AnimatedNumber
                  value={brief.replyRate}
                  decimalPlaces={1}
                  className={`text-2xl font-black font-mono ${isMonochrome ? "text-black" : "text-amber-400"}`}
                />
                <span className={`text-sm font-bold ${isMonochrome ? "text-black" : "text-amber-400"}`}>%</span>
              </>
            ) : (
              <span className={`text-2xl font-black font-mono ${isMonochrome ? "text-black/70" : "text-amber-400/50"}`}>—</span>
            )}
          </div>
          {!showReply && <p className={`text-[10px] mt-0.5 ${isMonochrome ? "text-black/60" : "text-amber-400/60"}`}>回复统计 · 建设中</p>}
        </div>
      </div>

      {/* 各平台昨日投递与回复细分 */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-stone-300 block">各平台反馈情况拆解</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {brief.platformBreakdown.map((p) => {
            const platformColor = isMonochrome
              ? p.id === "boss"
                ? "#e4e4e7"
                : p.id === "liepin"
                ? "#a1a1aa"
                : "#71717a"
              : p.color;
            return (
              <div key={p.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: platformColor }}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: platformColor }} />
                    {p.name}
                  </span>
                  <span className="text-xs font-mono font-bold text-white">
                    {showReply ? (
                      <><AnimatedNumber value={p.rate} decimalPlaces={1} className="font-mono text-white" />% 回复率</>
                    ) : (
                      <span className="text-stone-500 font-normal">回复统计 · 建设中</span>
                    )}
                  </span>
                </div>
                <div className="text-[11px] text-stone-400 flex items-center justify-between">
                  <span>
                    已投 <AnimatedNumber value={p.sent} className="font-mono text-stone-300" /> 家
                  </span>
                  <span className={isMonochrome ? "text-zinc-200" : "text-emerald-400"}>
                    {showReply ? (
                      <>已回 <AnimatedNumber value={p.replied} className={`font-mono ${isMonochrome ? "text-zinc-200" : "text-emerald-400"}`} /> 家</>
                    ) : (
                      <span className="text-stone-500">已回 —</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 早报复盘洞察与今日行动建议 */}
      <div className="p-3.5 rounded-xl bg-stone-900/60 border border-white/10 space-y-2 text-xs">
        <div className="flex items-start gap-2 text-stone-300">
          <Sparkles className={`size-4 shrink-0 mt-0.5 ${isMonochrome ? "text-white" : "text-amber-400"}`} />
          <p className="leading-relaxed">
            <strong className={isMonochrome ? "text-white" : "text-amber-300"}>战报洞察：</strong>
            {brief.insight}
          </p>
        </div>
        <div className="flex items-start gap-2 text-stone-400 pl-6 border-t border-white/5 pt-2">
          <p className="leading-relaxed">
            <strong className="text-white">晨间建议：</strong>
            {brief.actionAdvice}
          </p>
        </div>
      </div>
    </div>
  );
}
