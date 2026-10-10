import { Briefcase } from "lucide-react";
import { MagicCard } from "../core/MagicBento";

interface TargetRolesCardProps {
  label: string;
  setLabel: (val: string) => void;
  cityValues: string;
  setCityValues: (val: string) => void;
  educationValues: string;
  setEducationValues: (val: string) => void;
  isEn: boolean;
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
  isEn,
  commonRoles,
  commonCities,
  toggleCity,
}: TargetRolesCardProps) {
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
          {isEn ? "Target Roles & Cities" : "目标岗位与城市"}
        </h2>
      </div>

      <div className="space-y-4 text-xs">
        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {isEn ? "Target Job Title" : "目标职位名称"}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isEn ? "e.g. Backend Developer" : "例如：后端开发工程师 / 硬件研发"}
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
            <span>{isEn ? "Preferred Cities" : "意向城市"}</span>
            <span className="text-stone-500 text-[10px] font-normal">
              {isEn ? "Empty = Any city" : "留空代表全国/不限"}
            </span>
          </label>
          <input
            type="text"
            value={cityValues}
            onChange={(e) => setCityValues(e.target.value)}
            placeholder={isEn ? "e.g. Shenzhen, Guangzhou" : "例如：深圳,广州,东莞"}
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
                {isEn
                  ? `Configured ${count} cities: Platforms like BOSS limit selection to 4 at once. Smart rotation enabled (swapping in batches of 4).`
                  : `已选 ${count} 个城市：BOSS 直聘等平台单次最多勾选 4 个，系统已自动启用智能切批轮询（每轮 4 个轮流替换投递）。`}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-stone-300 text-xs mb-1.5 font-medium">
            {isEn ? "Minimum Education" : "期望学历"}
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
