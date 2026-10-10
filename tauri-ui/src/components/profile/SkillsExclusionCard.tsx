import { type Dispatch, type SetStateAction } from "react";
import { Filter } from "lucide-react";
import type { RuleForm } from "../../lib/profileForm";
import { MagicCard } from "../core/MagicBento";

interface SkillsExclusionCardProps {
  rule: RuleForm;
  setRule: Dispatch<SetStateAction<RuleForm>>;
  isEn: boolean;
  commonExcludes: string[];
  toggleExclude: (word: string) => void;
}

export default function SkillsExclusionCard({
  rule,
  setRule,
  isEn,
  commonExcludes,
  toggleExclude,
}: SkillsExclusionCardProps) {
  return (
    <MagicCard
      className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4"
      glowColor="16, 185, 129"
      enableTilt={false}
      enableStars={true}
      particleCount={6}
      clickEffect={true}
    >
      <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--grid)]">
        <Filter className="size-4 text-emerald-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
          {isEn ? "Skills & Exclusions" : "技能偏好与排除方向"}
        </h2>
      </div>

      <div className="space-y-4 text-xs">
        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {isEn ? "Key Skills / Technologies" : "想找的专业技能词 (包含任意即可)"}
          </label>
          <input
            type="text"
            value={rule.anyKeywords}
            onChange={(e) => setRule((prev) => ({ ...prev, anyKeywords: e.target.value }))}
            placeholder={isEn ? "e.g. Python, FastAPI, React" : "例如：Python, FastAPI, 模电数电, 算法"}
            className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3.5 py-2.5 text-xs text-emerald-300 placeholder-stone-600 focus:border-emerald-500/60 focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {isEn ? "Do Not Consider (Exclusions)" : "不想考虑的方向 (系统自动避开)"}
          </label>
          <input
            type="text"
            value={rule.excludeKeywords}
            onChange={(e) => setRule((prev) => ({ ...prev, excludeKeywords: e.target.value }))}
            placeholder={isEn ? "e.g. Sales, Customer Service" : "例如：销售, 客服, 劳务外包, 培训机构"}
            className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3.5 py-2.5 text-xs text-red-300 placeholder-stone-600 focus:border-red-500/60 focus:outline-none font-mono"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {commonExcludes.map((word) => {
              const isExcluded = rule.excludeKeywords?.split(",").includes(word);
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => toggleExclude(word)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    isExcluded
                      ? "border-red-500/60 bg-red-500/15 text-red-300 font-medium"
                      : "border-[var(--grid)] bg-[#1c1917] text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {word} {isExcluded ? "✓" : "+"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] text-stone-400 text-[11px] leading-relaxed">
          💡{" "}
          {isEn
            ? "Matches jobs containing your skills and automatically skips jobs containing unwanted terms."
            : "系统将优先匹配包含您技能词的职位，并自动滤除包含不想考虑词汇的岗位。"}
        </div>
      </div>
    </MagicCard>
  );
}
