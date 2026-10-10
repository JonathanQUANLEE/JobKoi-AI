import { Gauge, CheckCircle2, ShieldAlert } from "lucide-react";
import type { ATSScoreData } from "../../lib/ipc";

interface AtsScoreDashboardProps {
  atsScore: ATSScoreData;
}

export default function AtsScoreDashboard({ atsScore }: AtsScoreDashboardProps) {
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between pb-2.5 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-emerald-400" />
          <span className="text-xs font-bold text-stone-200">
            ATS 算法指标体检 (本地即时计算)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-stone-400">综合得分:</span>
          <span
            className={`text-base font-black font-mono ${
              atsScore.overall_score >= 80
                ? "text-emerald-400"
                : atsScore.overall_score >= 65
                ? "text-amber-400"
                : "text-rose-400"
            }`}
          >
            {atsScore.overall_score}
          </span>
          <span className="text-xs text-stone-500">/ 100</span>
        </div>
      </div>

      {/* 5 维度细分条形图 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-stone-400">量化密度</span>
            <span className="font-bold text-stone-200">{atsScore.dimensions.quantification}分</span>
          </div>
          <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${atsScore.dimensions.quantification}%` }} />
          </div>
        </div>

        <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-stone-400">动词力度</span>
            <span className="font-bold text-stone-200">{atsScore.dimensions.action_verbs}分</span>
          </div>
          <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${atsScore.dimensions.action_verbs}%` }} />
          </div>
        </div>

        <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-stone-400">STAR 闭环</span>
            <span className="font-bold text-stone-200">{atsScore.dimensions.star_logic}分</span>
          </div>
          <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${atsScore.dimensions.star_logic}%` }} />
          </div>
        </div>

        <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-stone-400">技术深度</span>
            <span className="font-bold text-stone-200">{atsScore.dimensions.technical_depth}分</span>
          </div>
          <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${atsScore.dimensions.technical_depth}%` }} />
          </div>
        </div>

        <div className="bg-stone-950/70 p-2 rounded-xl border border-stone-800/80 col-span-2 sm:col-span-1">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-stone-400">排版质量</span>
            <span className="font-bold text-stone-200">{atsScore.dimensions.readability}分</span>
          </div>
          <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${atsScore.dimensions.readability}%` }} />
          </div>
        </div>
      </div>

      {/* 统计指标与亮点徽章 */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
          ⚡ 强动词: {atsScore.strong_verbs_count} 个
        </span>
        <span className={`px-2 py-0.5 rounded-md border ${atsScore.weak_verbs_count > 0 ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-stone-800 border-stone-700 text-stone-400"}`}>
          ⚠️ 待优化词: {atsScore.weak_verbs_count} 个
        </span>
        <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300">
          📊 量化点: {atsScore.metrics_count} 处
        </span>
        <span className="px-2 py-0.5 rounded-md bg-stone-800 border border-stone-700 text-stone-400 font-mono">
          总词数: {atsScore.word_count} 字
        </span>
      </div>

      {/* 优势与改进建议标签 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
        {atsScore.highlights.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              <span>检测到的亮点</span>
            </span>
            <div className="flex flex-wrap gap-1">
              {atsScore.highlights.map((h, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {atsScore.issues.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
              <ShieldAlert className="size-3" />
              <span>待优化项</span>
            </span>
            <div className="flex flex-wrap gap-1">
              {atsScore.issues.map((issue, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/30 text-amber-300">
                  {issue}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
