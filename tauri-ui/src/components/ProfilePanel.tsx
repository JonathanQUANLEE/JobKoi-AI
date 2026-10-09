import { useState, type Dispatch, type SetStateAction } from "react";
import {
  UserCheck,
  Briefcase,
  MapPin,
  Filter,
  ShieldCheck,
  FileText,
  ArrowLeft,
  Save,
  Check,
  RotateCcw,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type { RuleForm } from "../lib/profileForm";
import type { Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import { MagicCard } from "./core/MagicBento";

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
  dryRun: boolean;
  setDryRun: (val: boolean) => void;
  defaultResumeName: string;
  onGoToResumes: () => void;
  onBackToWorkbench: () => void;
  onSaveConfig: () => Promise<void>;
  lang?: Lang;
  busy?: boolean;
}

const COMMON_CITIES = ["全国", "深圳", "广州", "北京", "上海", "杭州", "成都", "武汉", "南京", "苏州", "东莞"];
const COMMON_ROLES = ["后端开发工程师", "前端开发工程师", "硬件研发工程师", "电气工程师", "算法工程师", "AI应用工程师", "产品经理", "测试开发工程师"];
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
  dryRun,
  setDryRun,
  defaultResumeName,
  onGoToResumes,
  onBackToWorkbench,
  onSaveConfig,
  lang = "zh",
  busy = false,
}: ProfilePanelProps) {
  const [savedSuccess, setSavedSuccess] = useState(false);
  const isEn = lang === "en";
  const notify = useRunStore((s) => s.notify);

  const handleSave = async () => {
    await onSaveConfig();
    setSavedSuccess(true);
    notify({
      type: "success",
      text: isEn ? "Job profile successfully saved!" : "求职画像与配置已成功保存！",
      source: isEn ? "Profile" : "求职画像"
    });
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const toggleCity = (city: string) => {
    if (city === "全国") {
      setCityValues("");
      return;
    }
    const list = cityValues ? cityValues.split(",").map((c) => c.trim()).filter(Boolean) : [];
    if (list.includes(city)) {
      setCityValues(list.filter((c) => c !== city).join(","));
    } else {
      setCityValues([...list, city].join(","));
    }
  };

  const toggleExclude = (word: string) => {
    const list = rule.excludeKeywords ? rule.excludeKeywords.split(",").map((w) => w.trim()).filter(Boolean) : [];
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
              <span>{isEn ? "Job Profile" : "求职画像"}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-medium">
                {isEn ? "Synced with AI" : "已自动同步 AI 对话"}
              </span>
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">
              {isEn
                ? "Your target role, cities, and preferences summarized by the AI advisor. You can freely edit them below."
                : "目标岗位、城市与投递偏好已由 AI 顾问整理就绪，支持直接修改"}
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
            <span>{isEn ? "Back to Job Profile" : "返回求职画像"}</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/10 transition-all cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
            <span>{savedSuccess ? (isEn ? "Saved!" : "已保存画像") : (isEn ? "Save Profile" : "保存画像")}</span>
          </button>
        </div>
      </div>

      {/* 提示便签：极简友好说明 */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5 text-xs text-amber-200/95">
        <Sparkles className="size-4 text-amber-400 shrink-0" />
        <span>
          {isEn
            ? "Values below are auto-extracted from your conversation with the AI advisor. You can freely fine-tune them here."
            : "以下画像信息已根据与 AI 顾问的对话自动提炼生成，您可在此随时手动修改与微调。"}
        </span>
      </div>

      {/* 主配置网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 卡片 1: 目标岗位与求职城市 */}
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
                {COMMON_ROLES.map((r) => (
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
                <span className="text-stone-500 text-[10px] font-normal">{isEn ? "Empty = Any city" : "留空代表全国/不限"}</span>
              </label>
              <input
                type="text"
                value={cityValues}
                onChange={(e) => setCityValues(e.target.value)}
                placeholder={isEn ? "e.g. Shenzhen, Guangzhou" : "例如：深圳,广州,东莞"}
                className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3.5 py-2.5 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {COMMON_CITIES.map((c) => {
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

        {/* 卡片 2: 技能偏好与不考虑的方向 */}
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
                {COMMON_EXCLUDES.map((word) => {
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
              💡 {isEn ? "Matches jobs containing your skills and automatically skips jobs containing unwanted terms." : "系统将优先匹配包含您技能词的职位，并自动滤除包含不想考虑词汇的岗位。"}
            </div>
          </div>
        </MagicCard>

        {/* 卡片 3: 投递设置与账号保护 */}
        <MagicCard
          className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4"
          glowColor="6, 182, 212"
          enableTilt={false}
          enableStars={true}
          particleCount={6}
          clickEffect={true}
        >
          <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--grid)]">
            <ShieldCheck className="size-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
              {isEn ? "Delivery Settings & Safety" : "投递设置与安全保护"}
            </h2>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
              <div>
                <div className="text-xs font-medium text-stone-200">
                  {isEn ? "Daily Application Limit" : "每日投递上限"}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  {isEn ? "Automatically pauses after reaching limit" : "达到上限后自动停止，防止账号被平台限制"}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="10"
                  max="200"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="w-20 rounded-xl border border-[var(--grid)] bg-[#1c1917] px-2.5 py-1.5 text-xs text-stone-100 font-mono text-center focus:border-cyan-500/60 focus:outline-none"
                />
                <span className="text-stone-500">{isEn ? "/day" : "次/日"}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-emerald-300">
                    {isEn ? "Smart Anti-Ban Protection" : "智能防封保护"}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">
                    {isEn ? "Human-like natural delays applied automatically" : "系统已默认配置最佳拟人随机浏览间隔，保障账号稳定安全"}
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-md bg-emerald-900/60 border border-emerald-500/30">
                {isEn ? "Active" : "已保护"}
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
              <div>
                <div className="text-xs font-medium text-stone-200">
                  {isEn ? "Dry-Run Simulation" : "安全演练模式 (不真实投递)"}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  {isEn ? "Scan and match without sending messages" : "仅抓取和比对岗位，不会真实点击打招呼按钮"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDryRun(!dryRun)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  dryRun ? "bg-cyan-500" : "bg-stone-800"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-stone-950 shadow ring-0 transition duration-200 ease-in-out ${
                    dryRun ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </MagicCard>

        {/* 卡片 4: 默认投递简历关联 */}
        <MagicCard
          className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4"
          glowColor="245, 158, 11"
          enableTilt={false}
          enableStars={true}
          particleCount={6}
          clickEffect={true}
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--grid)]">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                {isEn ? "Attached Resume" : "当前使用简历"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onGoToResumes}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer hover:underline"
            >
              <span>{isEn ? "Manage Resumes" : "管理简历库"}</span>
              <ExternalLink className="size-3" />
            </button>
          </div>

          <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-100 truncate" title={defaultResumeName}>
                  {defaultResumeName || "李象泉-后端-AI-Agent开发-2027届.docx"}
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5">
                  {isEn ? "Default attachment ready for recruiters" : "默认简历附件 · 沟通后自动发送"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToResumes}
              className="px-3 py-1.5 rounded-lg border border-[var(--grid)] hover:border-stone-700 bg-[#1c1917] text-xs text-stone-300 hover:text-white shrink-0 cursor-pointer"
            >
              {isEn ? "Change" : "更换"}
            </button>
          </div>
        </MagicCard>
      </div>

      {/* 底部确认行动栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-[var(--grid)] bg-[#141210] shadow-md">
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span>
            {isEn
              ? "All preferences are saved securely on your device for job matching"
              : "所有微调设置将实时加密存储在本地，作为自动巡航与打招呼依据"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--grid)] hover:border-stone-700 bg-[#1c1917] hover:bg-[#25201d] text-xs font-medium text-stone-300 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="size-3.5 text-stone-400" />
            <span>{isEn ? "Back to Job Profile" : "返回求职画像"}</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? <Check className="size-4" /> : <Save className="size-4" />}
            <span>{savedSuccess ? (isEn ? "Saved!" : "已保存全部设置！") : (isEn ? "Save Profile" : "保存画像配置")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
