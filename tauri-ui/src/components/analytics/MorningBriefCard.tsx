import { useState } from "react";
import { Sparkles, Sun, CheckCircle2, XCircle, ArrowUpRight, RefreshCw, Send } from "lucide-react";
import type { MorningBrief } from "../../lib/deliveryHistory";

interface MorningBriefCardProps {
  brief: MorningBrief;
  onRefreshBrief?: () => void;
  onStartCruise?: () => void;
}

export default function MorningBriefCard({ brief, onRefreshBrief, onStartCruise }: MorningBriefCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySummary = () => {
    const text = `【JobHunter 投递早报 · 昨日战报】\n日期: ${brief.yesterdayDate}\n昨日总投: ${brief.totalSent} 家\nHR 回复: ${brief.repliedCount} 家 | 暂无回复: ${brief.unrepliedCount} 家\n综合回复率: ${brief.replyRate}%\n各平台回复: BOSS直聘 ${brief.platformBreakdown[0].replied}家 (${brief.platformBreakdown[0].rate}%) | 猎聘 ${brief.platformBreakdown[1].replied}家 (${brief.platformBreakdown[1].rate}%) | 51job ${brief.platformBreakdown[2].replied}家 (${brief.platformBreakdown[2].rate}%)\n今日建议: ${brief.actionAdvice}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-stone-900/60 to-purple-500/10 border border-amber-500/20 backdrop-blur-xl relative overflow-hidden space-y-4">
      {/* 头部标题与时点 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Sun className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">投递早报 · 昨日反馈归纳复盘</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
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
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors cursor-pointer border border-amber-500/30 flex items-center gap-1"
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
            <span className="text-2xl font-black text-white font-mono">{brief.totalSent}</span>
            <span className="text-xs text-stone-500">家</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-emerald-300">HR 已回复</span>
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-400 font-mono">{brief.repliedCount}</span>
            <span className="text-xs text-emerald-500/80">家</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-stone-800/40 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-stone-400">暂无回复</span>
            <XCircle className="size-3.5 text-stone-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-stone-300 font-mono">{brief.unrepliedCount}</span>
            <span className="text-xs text-stone-500">家</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-amber-300 font-semibold">昨日综合回复率</span>
            <span className="text-[10px] text-amber-400/90 font-mono">
              {brief.replyRate >= 20 ? "良好" : "平稳"}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-400 font-mono">{brief.replyRate}</span>
            <span className="text-sm font-bold text-amber-400">%</span>
          </div>
        </div>
      </div>

      {/* 各平台昨日投递与回复细分 */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-stone-300 block">各平台反馈情况拆解</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {brief.platformBreakdown.map((p) => (
            <div key={p.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: p.color }}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
                <span className="text-xs font-mono font-bold text-white">{p.rate}% 回复率</span>
              </div>
              <div className="text-[11px] text-stone-400 flex items-center justify-between">
                <span>已投 {p.sent} 家</span>
                <span className="text-emerald-400">已回 {p.replied} 家</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 早报复盘洞察与今日行动建议 */}
      <div className="p-3.5 rounded-xl bg-stone-900/60 border border-white/10 space-y-2 text-xs">
        <div className="flex items-start gap-2 text-stone-300">
          <Sparkles className="size-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-amber-300">战报洞察：</strong>
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
