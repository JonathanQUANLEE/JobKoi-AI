import { type FilterPolicy, type MatchMode, type Scope, type RuleForm } from "../../../lib/profileForm";
import { optionLabel, type Lang } from "../../../lib/i18n";
import { useT } from "../../../store";

const CITY_OPTIONS = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京"];
const EDUCATION_OPTIONS = ["不限", "大专", "本科", "硕士"];
const BOSS_ACTIVE_OPTIONS = ["刚刚活跃", "今日活跃", "3日内活跃", "本周活跃"];

interface DrawerRulesTabProps {
  lang: Lang;
  rule: RuleForm;
  setRule: (r: RuleForm) => void;
  cityValues: string;
  setCityValues: (v: string) => void;
  educationValues: string;
  setEducationValues: (v: string) => void;
  bossActiveValues: string;
  setBossActiveValues: (v: string) => void;
  filterPolicy: FilterPolicy;
  setFilterPolicy: (p: FilterPolicy) => void;
}

export default function DrawerRulesTab({
  lang,
  rule,
  setRule,
  cityValues,
  setCityValues,
  educationValues,
  setEducationValues,
  bossActiveValues,
  setBossActiveValues,
  filterPolicy,
  setFilterPolicy,
}: DrawerRulesTabProps) {
  const t = useT();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">岗位关键词精准过滤</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("field.requiredKeywords")}（必须包含）</label>
            <input
              className="field-input"
              value={rule.requiredKeywords}
              onChange={(e) => setRule({ ...rule, requiredKeywords: e.target.value })}
              placeholder="如：后端开发,AI"
            />
          </div>
          <div>
            <label className="field-label">{t("field.anyKeywords")}（包含任意之一）</label>
            <input
              className="field-input"
              value={rule.anyKeywords}
              onChange={(e) => setRule({ ...rule, anyKeywords: e.target.value })}
              placeholder="如：Python,Golang,LLM"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">{t("field.excludeKeywords")}（黑名单/绝对排除）</label>
            <input
              className="field-input"
              value={rule.excludeKeywords}
              onChange={(e) => setRule({ ...rule, excludeKeywords: e.target.value })}
              placeholder="如：销售,客服,培训,无底薪"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          <div>
            <label className="field-label">{t("field.scope")}</label>
            <select
              className="field-select"
              value={rule.scope}
              onChange={(e) => setRule({ ...rule, scope: e.target.value as Scope })}
            >
              <option value="title">{optionLabel(lang, "scope.title")}</option>
              <option value="description">{optionLabel(lang, "scope.description")}</option>
              <option value="title_description">{optionLabel(lang, "scope.title_description")}</option>
              <option value="location">{optionLabel(lang, "scope.location")}</option>
              <option value="all">{optionLabel(lang, "scope.all")}</option>
            </select>
          </div>
          <div>
            <label className="field-label">{t("field.match")}</label>
            <select
              className="field-select"
              value={rule.match}
              onChange={(e) => setRule({ ...rule, match: e.target.value as MatchMode })}
            >
              <option value="contains">{optionLabel(lang, "match.contains")}</option>
              <option value="regex">{optionLabel(lang, "match.regex")}</option>
              <option value="exact">{optionLabel(lang, "match.exact")}</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={rule.caseSensitive}
                onChange={(e) => setRule({ ...rule, caseSensitive: e.target.checked })}
              />
              <span>{t("field.caseSensitive")}</span>
            </label>
          </div>
        </div>
      </div>

      {/* 页面过滤器 */}
      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">页面维度匹配（城市与学历）</h3>
        <div>
          <label className="field-label">{t("field.city")}</label>
          <div className="option-picker">
            {CITY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={`option-chip ${cityValues.includes(c) ? "active" : ""}`}
                onClick={() => {
                  const list = cityValues ? cityValues.split(",").map((s) => s.trim()) : [];
                  const next = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
                  setCityValues(next.join(","));
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            className="field-input"
            value={cityValues}
            onChange={(e) => setCityValues(e.target.value)}
            placeholder="选填或手动逗号分隔，如：深圳,广州"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("field.education")}</label>
            <div className="option-picker">
              {EDUCATION_OPTIONS.map((ed) => (
                <button
                  key={ed}
                  type="button"
                  className={`option-chip ${educationValues.includes(ed) ? "active" : ""}`}
                  onClick={() => setEducationValues(ed === "不限" ? "" : ed)}
                >
                  {ed}
                </button>
              ))}
            </div>
            <input
              className="field-input"
              value={educationValues}
              onChange={(e) => setEducationValues(e.target.value)}
              placeholder="支持选填多个"
            />
          </div>

          <div>
            <label className="field-label">BOSS直聘活跃度限定</label>
            <div className="option-picker">
              {BOSS_ACTIVE_OPTIONS.map((act) => (
                <button
                  key={act}
                  type="button"
                  className={`option-chip ${bossActiveValues.includes(act) ? "active" : ""}`}
                  onClick={() => setBossActiveValues(act)}
                >
                  {act}
                </button>
              ))}
            </div>
            <input
              className="field-input"
              value={bossActiveValues}
              onChange={(e) => setBossActiveValues(e.target.value)}
              placeholder="如：刚刚活跃,今日活跃"
            />
          </div>
        </div>

        <div className="border-t border-[var(--grid)] pt-3">
          <label className="field-label">{t("field.filterPolicy")}</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["strict", "warning", "off"] as FilterPolicy[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                  filterPolicy === p
                    ? "border-amber-500 bg-amber-500/10 font-bold text-amber-400"
                    : "border-[var(--grid)] bg-stone-900/40 text-stone-400 hover:text-stone-200"
                }`}
                onClick={() => setFilterPolicy(p)}
              >
                <div className="capitalize">{p}</div>
                <div className="text-[10px] text-[var(--muted-fg)] mt-0.5">
                  {p === "strict" ? "严格拦截不匹配" : p === "warning" ? "提示放行" : "关闭拦截"}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
