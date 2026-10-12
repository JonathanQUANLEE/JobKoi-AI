import { useState, type Dispatch, type SetStateAction } from "react";
import { UserCheck, ArrowLeft, Save, Check, Sparkles, ShieldCheck } from "lucide-react";
import type { RuleForm } from "../lib/profileForm";
import { toggleCityInList } from "../lib/cityInput";
import { translate, type Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import TargetRolesCard from "./profile/TargetRolesCard";
import SkillsExclusionCard from "./profile/SkillsExclusionCard";
import DeliverySafetyCard from "./profile/DeliverySafetyCard";
import ResumeBindingCard from "./profile/ResumeBindingCard";

interface ProfilePanelProps {
  label: string;
  setLabel: (val: string) => void;
  cityValues: string;
  setCityValues: (val: string) => void;
  educationValues: string;
  setEducationValues: (val: string) => void;
  rule: RuleForm;
  setRule: Dispatch<SetStateAction<RuleForm>>;
  dailyLimit: string;
  setDailyLimit: (val: string) => void;
  defaultResumeName: string;
  onGoToResumes: () => void;
  onBackToWorkbench: () => void;
  onSaveConfig: () => Promise<void>;
  lang?: Lang;
  busy?: boolean;
}

const COMMON_CITIES = [
  "全国",
  "深圳",
  "广州",
  "北京",
  "上海",
  "杭州",
  "成都",
  "武汉",
  "南京",
  "苏州",
  "东莞",
];
const COMMON_ROLES = [
  "后端开发工程师",
  "前端开发工程师",
  "硬件研发工程师",
  "电气工程师",
  "算法工程师",
  "AI应用工程师",
  "产品经理",
  "测试开发工程师",
];
const COMMON_EXCLUDES = ["销售", "客服", "劳务外包", "培训机构", "招生", "电话销售"];

export default function ProfilePanel({
  label,
  setLabel,
  cityValues,
  setCityValues,
  educationValues,
  setEducationValues,
  rule,
  setRule,
  dailyLimit,
  setDailyLimit,
  defaultResumeName,
  onGoToResumes,
  onBackToWorkbench,
  onSaveConfig,
  lang = "zh",
  busy = false,
}: ProfilePanelProps) {
  const [savedSuccess, setSavedSuccess] = useState(false);
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const notify = useRunStore((s) => s.notify);

  const handleSave = async () => {
    await onSaveConfig();
    setSavedSuccess(true);
    notify({
      type: "success",
      text: t("ppanel.notifySaved"),
      source: t("ppanel.notifySource"),
    });
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const toggleCity = (city: string) => {
    // 宽容解析版城市切换：兼容用户手输的任意分隔格式，去"市"后缀归一
    setCityValues(toggleCityInList(cityValues, city));
  };

  const toggleExclude = (word: string) => {
    const list = rule.excludeKeywords
      ? rule.excludeKeywords.split(",").map((w) => w.trim()).filter(Boolean)
      : [];
    if (list.includes(word)) {
      setRule((prev) => ({ ...prev, excludeKeywords: list.filter((w) => w !== word).join(",") }));
    } else {
      setRule((prev) => ({ ...prev, excludeKeywords: [...list, word].join(",") }));
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* 顶部标题栏与快捷导航 */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--grid)]">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-sm">
            <UserCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-stone-100 flex items-center gap-2">
              <span>{t("bento.title")}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-medium">
                {t("ppanel.syncedBadge")}
              </span>
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">
              {t("ppanel.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[var(--grid)] hover:border-stone-700 bg-[#1c1917] hover:bg-[#25201d] text-xs font-medium text-stone-300 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="size-3.5 text-stone-400" />
            <span>{t("ppanel.back")}</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/10 transition-all cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
            <span>
              {savedSuccess ? t("ppanel.saved") : t("ppanel.save")}
            </span>
          </button>
        </div>
      </div>

      {/* 提示便签：极简友好说明 */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5 text-xs text-amber-200/95">
        <Sparkles className="size-4 text-amber-400 shrink-0" />
        <span>
          {t("ppanel.hint")}
        </span>
      </div>

      {/* 主配置网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TargetRolesCard
          label={label}
          setLabel={setLabel}
          cityValues={cityValues}
          setCityValues={setCityValues}
          educationValues={educationValues}
          setEducationValues={setEducationValues}
          lang={lang}
          commonRoles={COMMON_ROLES}
          commonCities={COMMON_CITIES}
          toggleCity={toggleCity}
        />

        <SkillsExclusionCard
          rule={rule}
          setRule={setRule}
          lang={lang}
          commonExcludes={COMMON_EXCLUDES}
          toggleExclude={toggleExclude}
        />

        <DeliverySafetyCard
          dailyLimit={dailyLimit}
          setDailyLimit={setDailyLimit}
          lang={lang}
        />

        <ResumeBindingCard
          defaultResumeName={defaultResumeName}
          onGoToResumes={onGoToResumes}
          lang={lang}
        />
      </div>

      {/* 底部确认行动栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-[var(--grid)] bg-[#141210] shadow-md">
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span>
            {t("ppanel.secureNote")}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--grid)] hover:border-stone-700 bg-[#1c1917] hover:bg-[#25201d] text-xs font-medium text-stone-300 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="size-3.5 text-stone-400" />
            <span>{t("ppanel.back")}</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? <Check className="size-4" /> : <Save className="size-4" />}
            <span>
              {savedSuccess ? t("ppanel.savedFull") : t("ppanel.saveFull")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
