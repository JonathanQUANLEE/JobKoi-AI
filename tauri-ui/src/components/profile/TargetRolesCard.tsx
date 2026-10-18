import { useMemo, useState } from "react";
import { Briefcase, Sparkles, X } from "lucide-react";
import { translate, type Lang } from "../../lib/i18n";
import { appendCity, normalizeCityInput, parseCityList, suggestCities } from "../../lib/cityInput";
import { joinRoleTags, splitRoleInput } from "../../lib/roleTokenizer";
import { MagicCard } from "../core/MagicBento";

/** 提交标签的按键：回车 + 与后端一致的显式分隔符。 */
const ROLE_COMMIT_KEYS = new Set(["Enter", ",", "，", "、", ";", "；"]);

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
  const count = parseCityList(cityValues).length;
  // 输入中最后一段的前缀建议（输入"深"提示"深圳"），点击即追加
  const citySuggestions = suggestCities(cityValues);

  // ---- 目标职位 Tag 化（2026-10-17）：标签列表由 label 单一真源派生 ----
  // label 仍是对外契约（逗号串存表单），标签只是它的可视化形态。
  const roleTags = useMemo(() => splitRoleInput(label), [label]);
  const [roleInput, setRoleInput] = useState("");
  const [splitHint, setSplitHint] = useState("");

  const commitRoleInput = () => {
    const value = roleInput.trim();
    if (!value) return;
    const next = roleTags.some((tag) => tag === value) ? roleTags : [...roleTags, value];
    setLabel(joinRoleTags(next));
    setRoleInput("");
  };

  const removeRoleTag = (tag: string) => {
    setLabel(joinRoleTags(roleTags.filter((x) => x !== tag)));
    setSplitHint("");
  };

  const editRoleTag = (tag: string) => {
    setRoleInput(tag);
    setLabel(joinRoleTags(roleTags.filter((x) => x !== tag)));
  };

  const runSmartSplit = () => {
    // 待输入文本也算进切分范围（blur 提交与点击的时序差由并集兜底）
    const pending = roleInput.trim();
    const full = pending ? joinRoleTags([...roleTags, pending]) : label;
    const split = splitRoleInput(full);
    if (split.length >= 2) {
      setLabel(joinRoleTags(split));
      setRoleInput("");
      setSplitHint(`已智能切分为 ${split.length} 个岗位`);
    } else {
      setSplitHint("未识别出多个岗位（已按单个岗位保留）");
    }
  };

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
          <label className="block text-stone-300 text-xs mb-1.5 font-medium flex items-center justify-between">
            <span>{t("trole.jobTitle")}</span>
            <span className="text-stone-500 text-[10px] font-normal">
              {t("trole.rolesHint")}
            </span>
          </label>
          {/* Tag 标签容器（2026-10-17）：回车/逗号提交标签，× 删除，点击编辑；
              空格粘贴的长串用「智能切词」一键拆分 */}
          <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-2.5 py-2 flex flex-wrap gap-1.5 items-center focus-within:border-amber-500/60 transition-colors">
            {roleTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 max-w-full rounded-lg border border-amber-500/40 bg-amber-500/10 pl-2 pr-1 py-1 text-[11px] text-amber-200"
              >
                <button
                  type="button"
                  onClick={() => editRoleTag(tag)}
                  className="truncate max-w-[180px] cursor-pointer hover:text-white transition-colors"
                  title="点击编辑该岗位"
                >
                  {tag}
                </button>
                <button
                  type="button"
                  onClick={() => removeRoleTag(tag)}
                  className="grid place-items-center size-4 rounded text-stone-500 hover:text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer"
                  title="删除该岗位"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (ROLE_COMMIT_KEYS.has(e.key)) {
                  e.preventDefault();
                  commitRoleInput();
                } else if (e.key === "Backspace" && !roleInput && roleTags.length > 0) {
                  setLabel(joinRoleTags(roleTags.slice(0, -1)));
                }
              }}
              onBlur={commitRoleInput}
              placeholder={roleTags.length ? "" : t("trole.rolesPlaceholder")}
              className="flex-1 min-w-[140px] bg-transparent px-1 py-1 text-xs text-stone-100 placeholder-stone-600 outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={runSmartSplit}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 text-[10px] font-medium hover:bg-sky-500/20 transition-all cursor-pointer"
              title="空格分隔的长串（如「AI Agent 实习 AI 应用工程师」）一键拆成多个岗位标签"
            >
              <Sparkles className="size-3" />
              {t("trole.smartSplit")}
            </button>
            {splitHint && <span className="text-[10px] text-sky-300/80">{splitHint}</span>}
            {roleTags.length >= 2 && (
              <span className="ml-auto text-[10px] text-amber-300">
                {t("trole.rolesCount", { count: roleTags.length })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {commonRoles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  // 常见岗位点击 = 追加标签（Tag 模式下不再整体覆盖）
                  if (!roleTags.some((tag) => tag === r)) {
                    setLabel(joinRoleTags([...roleTags, r]));
                  }
                }}
                className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                  roleTags.includes(r)
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
            onBlur={(e) => {
              // 离开输入框时宽容归一：空格/顿号/分号等分隔、去"市"后缀、垃圾拦截。
              // 不在 onChange 里做——打字途中归一会打断输入。
              const normalized = normalizeCityInput(e.target.value);
              if (normalized !== e.target.value) setCityValues(normalized);
            }}
            placeholder={t("trole.citiesPlaceholder")}
            className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3.5 py-2.5 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
          />
          {citySuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[10px] text-stone-500">按城市补全：</span>
              {citySuggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCityValues(appendCity(cityValues, c))}
                  className="text-[10px] px-2 py-0.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {commonCities.map((c) => {
              const isChecked = c === "全国" ? !cityValues : parseCityList(cityValues).includes(c);
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
          {count >= 2 && (
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
