import { Briefcase } from "lucide-react";
import { translate, type Lang } from "../../lib/i18n";
import { MagicCard } from "../core/MagicBento";

interface TargetRolesCardProps {
  label: string;
  setLabel: (val: string) => void;
  cityValues: string;
  setCityValues: (val: string) => void;
  educationValues: string;
  setEducationValues: (val: string) => void;
  lang: Lang;
  commonRoles: string[];
  commonCities: string[];
  toggleCity: (city: string) => void;
}

export default function TargetRolesCard({
  label,
  setLabel,
  cityValues,
  setCityValues,
  educationValues,
  setEducationValues,
  lang,
  commonRoles,
  commonCities,
  toggleCity,
}: TargetRolesCardProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const count = cityValues ? cityValues.split(",").map((c) => c.trim()).filter(Boolean).length : 0;

  return (
    <MagicCard
      className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4"
      glowColor="245, 158, 11"
      enableTilt={false}
      enableStars={true}
      particleCount={6}
      clickEffect={true}
    >
      <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--grid)]">
        <Briefcase className="size-4 text-amber-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
          {t("trole.title")}
        </h2>
      </div>

      <div className="space-y-4 text-xs">
        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {t("trole.jobTitle")}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("trole.jobTitlePlaceholder")}
            className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3.5 py-2.5 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {commonRoles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setLabel(r)}
                className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                  label === r
                    ? "border-amber-500/60 bg-amber-500/15 text-amber-300 font-medium"
                    : "border-[var(--grid)] bg-[#1c1917] text-stone-400 hover:text-stone-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium flex items-center justify-between">
            <span>{t("trole.cities")}</span>
            <span className="text-stone-500 text-[10px] font-normal">
              {t("trole.citiesHint")}
            </span>
          </label>
          <input
            type="text"
            value={cityValues}
            onChange={(e) => setCityValues(e.target.value)}
            placeholder={t("trole.citiesPlaceholder")}
            className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3.5 py-2.5 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {commonCities.map((c) => {
              const isChecked = c === "全国" ? !cityValues : cityValues.split(",").includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCity(c)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    isChecked
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-300 font-medium"
                      : "border-[var(--grid)] bg-[#1c1917] text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {count > 4 && (
            <div className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300">
              <span className="font-bold">⚡</span>
              <span>
                {t("trole.citiesRotation", { count })}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {t("trole.education")}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {["不限", "大专", "本科", "硕士及以上"].map((edu) => (
              <button
                key={edu}
                type="button"
                onClick={() => setEducationValues(edu === "不限" ? "" : edu)}
                className={`py-2 text-center rounded-xl border text-xs transition-all cursor-pointer ${
                  (edu === "不限" && !educationValues) || educationValues === edu
                    ? "border-amber-500/60 bg-amber-500/15 text-amber-300 font-bold"
                    : "border-[var(--grid)] bg-[var(--panel-2)] text-stone-400 hover:text-stone-200"
                }`}
              >
                {edu}
              </button>
            ))}
          </div>
        </div>
      </div>
    </MagicCard>
  );
}
