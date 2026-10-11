import { type Dispatch, type SetStateAction } from "react";
import { Filter } from "lucide-react";
import type { RuleForm } from "../../lib/profileForm";
import { translate, type Lang } from "../../lib/i18n";
import { MagicCard } from "../core/MagicBento";

interface SkillsExclusionCardProps {
  rule: RuleForm;
  setRule: Dispatch<SetStateAction<RuleForm>>;
  lang: Lang;
  commonExcludes: string[];
  toggleExclude: (word: string) => void;
}

export default function SkillsExclusionCard({
  rule,
  setRule,
  lang,
  commonExcludes,
  toggleExclude,
}: SkillsExclusionCardProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
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
          {t("skillex.title")}
        </h2>
      </div>

      <div className="space-y-4 text-xs">
        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {t("skillex.skills")}
          </label>
          <input
            type="text"
            value={rule.anyKeywords}
            onChange={(e) => setRule((prev) => ({ ...prev, anyKeywords: e.target.value }))}
            placeholder={t("skillex.skillsPlaceholder")}
            className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3.5 py-2.5 text-xs text-emerald-300 placeholder-stone-600 focus:border-emerald-500/60 focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {t("skillex.exclusions")}
          </label>
          <input
            type="text"
            value={rule.excludeKeywords}
            onChange={(e) => setRule((prev) => ({ ...prev, excludeKeywords: e.target.value }))}
            placeholder={t("skillex.exclusionsPlaceholder")}
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
          {t("skillex.hint")}
        </div>
      </div>
    </MagicCard>
  );
}
