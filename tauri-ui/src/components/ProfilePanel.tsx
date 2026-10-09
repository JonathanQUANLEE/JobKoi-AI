import { useState, type Dispatch, type SetStateAction } from "react";
import {
  UserCheck,
  Briefcase,
  MapPin,
  GraduationCap,
  Filter,
  ShieldAlert,
  FileText,
  ArrowLeft,
  Save,
  Check,
  RotateCcw,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type { RuleForm, FilterPolicy } from "../lib/profileForm";

interface ProfilePanelProps {
  label: string;
  setLabel: (val: string) => void;
  cityValues: string;
  setCityValues: (val: string) => void;
  educationValues: string;
  setEducationValues: (val: string) => void;
  rule: RuleForm;
  setRule: Dispatch<SetStateAction<RuleForm>>;
  delayMin: string;
  setDelayMin: (val: string) => void;
  delayMax: string;
  setDelayMax: (val: string) => void;
  dailyLimit: string;
  setDailyLimit: (val: string) => void;
  filterPolicy: FilterPolicy;
  setFilterPolicy: (val: FilterPolicy) => void;
  dryRun: boolean;
  setDryRun: (val: boolean) => void;
  defaultResumeName: string;
  onGoToResumes: () => void;
  onBackToWorkbench: () => void;
  onSaveConfig: () => Promise<void>;
  busy?: boolean;
}

const COMMON_CITIES = ["全国", "深圳", "广州", "北京", "上海", "杭州", "成都", "武汉", "南京", "苏州", "东莞"];
const COMMON_ROLES = ["后端开发工程师", "前端开发工程师", "硬件研发工程师", "电气工程师", "算法工程师", "AI应用工程师", "产品经理", "测试开发工程师"];
const COMMON_EXCLUDES = ["销售", "客服", "劳务派遣", "外包", "培训", "招生", "课程顾问", "电话销售"];

export default function ProfilePanel({
  label,
  setLabel,
  cityValues,
  setCityValues,
  educationValues,
  setEducationValues,
  rule,
  setRule,
  delayMin,
  setDelayMin,
  delayMax,
  setDelayMax,
  dailyLimit,
  setDailyLimit,
  filterPolicy,
  setFilterPolicy,
  dryRun,
  setDryRun,
  defaultResumeName,
  onGoToResumes,
  onBackToWorkbench,
  onSaveConfig,
  busy = false,
}: ProfilePanelProps) {
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    await onSaveConfig();
    setSavedSuccess(true);
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
              <span>求职画像</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-medium">
                ● 已自动同步 AI 诊断
              </span>
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">
              目标岗位、城市约束与投递策略已由 AI 顾问提炼就绪，支持随时手动微调
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
            <span>返回巡航工作台对话</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/10 transition-all cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
            <span>{savedSuccess ? "已保存画像！" : "保存画像更改"}</span>
          </button>
        </div>
      </div>

      {/* 提示便签：大模型对话与手动修改双轨机制 */}
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-amber-200/90 leading-relaxed">
        <div className="flex items-start gap-2.5">
          <Sparkles className="size-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">智能画像联动提示：</span>
            <span>
              下方参数已根据您在大模型对话框中的描述自动提取并填入。如果您觉得描述有偏差，可在此直接手动修改；也可以随时点击右上角返回工作台继续与大模型对话，让大模型进一步完善画像。
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onBackToWorkbench}
          className="shrink-0 text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer ml-2"
        >
          继续与 AI 对话 →
        </button>
      </div>

      {/* 主配置网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 卡片 1: 目标岗位与城市偏好 */}
        <section className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--grid)]">
            <Briefcase className="size-4 text-amber-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
              目标岗位与求职意向
            </h2>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                目标岗位名称 (必填)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：硬件研发工程师 / 后端开发"
                className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none"
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
              <label className="block text-stone-400 text-[11px] mb-1 font-medium flex items-center justify-between">
                <span>意向城市 (多个以英文逗号分隔)</span>
                <span className="text-stone-500 font-normal">留空代表全国/不限</span>
              </label>
              <input
                type="text"
                value={cityValues}
                onChange={(e) => setCityValues(e.target.value)}
                placeholder="例如：深圳,广州,东莞"
                className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
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
              <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                学历要求过滤
              </label>
              <div className="grid grid-cols-4 gap-2">
                {["不限", "大专", "本科", "硕士及以上"].map((edu) => (
                  <button
                    key={edu}
                    type="button"
                    onClick={() => setEducationValues(edu === "不限" ? "" : edu)}
                    className={`py-1.5 text-center rounded-xl border text-[11px] transition-all cursor-pointer ${
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
        </section>

        {/* 卡片 2: 关键词约束与黑名单排除 */}
        <section className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--grid)]">
            <Filter className="size-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
              岗位匹配词与风控排除
            </h2>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                必含专业技能词 (命中任意一个即匹配)
              </label>
              <input
                type="text"
                value={rule.anyKeywords}
                onChange={(e) => setRule((prev) => ({ ...prev, anyKeywords: e.target.value }))}
                placeholder="例如：Python,FastAPI,微服务,硬件调试"
                className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-emerald-300 placeholder-stone-600 focus:border-emerald-500/60 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-stone-500 mt-1">
                多个词用逗号分隔，职位标题或技能要求中出现任意一个即视为符合条件
              </p>
            </div>

            <div>
              <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                黑名单排除词 (绝对不投的关键词)
              </label>
              <input
                type="text"
                value={rule.excludeKeywords}
                onChange={(e) => setRule((prev) => ({ ...prev, excludeKeywords: e.target.value }))}
                placeholder="例如：销售,客服,外包,劳务派遣,培训"
                className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-red-300 placeholder-stone-600 focus:border-red-500/60 focus:outline-none font-mono"
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

            <div>
              <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                命中黑名单时的拦截策略
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFilterPolicy("warning")}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    filterPolicy === "warning"
                      ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                      : "border-[var(--grid)] bg-[var(--panel-2)] text-stone-400"
                  }`}
                >
                  <div className="font-semibold text-[11px]">安全跳过 (推荐)</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">命中间接触发排除并记录日志</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPolicy("strict")}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    filterPolicy === "strict"
                      ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                      : "border-[var(--grid)] bg-[var(--panel-2)] text-stone-400"
                  }`}
                >
                  <div className="font-semibold text-[11px]">极度严格拦截</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">任何字段模糊重叠一律不投</div>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 卡片 3: 拟人风控与投递节奏 */}
        <section className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--grid)]">
            <ShieldAlert className="size-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
              拟人风控与频次保护
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3.5 text-xs">
            <div>
              <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                拟人随机延时 (秒)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={delayMin}
                  onChange={(e) => setDelayMin(e.target.value)}
                  className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-stone-100 text-center font-mono focus:border-cyan-500/60 focus:outline-none"
                />
                <span className="text-stone-500">~</span>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={delayMax}
                  onChange={(e) => setDelayMax(e.target.value)}
                  className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-stone-100 text-center font-mono focus:border-cyan-500/60 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-stone-500 mt-1">推荐 10~30s 随机波动，模拟真实用户浏览操作</p>
            </div>

            <div>
              <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                单日投递保护上限 (次)
              </label>
              <input
                type="number"
                min="10"
                max="200"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-1.5 text-xs text-stone-100 font-mono focus:border-cyan-500/60 focus:outline-none"
              />
              <p className="text-[10px] text-stone-500 mt-1">达到上限后当天自动停机，防止账号触发限流</p>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--grid)] flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-stone-200">演练模式 (Dry-Run)</span>
              <p className="text-[10px] text-stone-400">只抓取与比对，不实际点击打招呼发送简历</p>
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
        </section>

        {/* 卡片 4: 默认投递简历关联 */}
        <section className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--grid)]">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                当前绑定简历附件
              </h2>
            </div>
            <button
              type="button"
              onClick={onGoToResumes}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer hover:underline"
            >
              <span>管理简历资料库</span>
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
                  已设为默认投递附件 · 巡航沟通时自动发送
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToResumes}
              className="px-3 py-1.5 rounded-lg border border-[var(--grid)] hover:border-stone-700 bg-[#1c1917] text-xs text-stone-300 hover:text-white shrink-0 cursor-pointer"
            >
              更换
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-stone-400 pt-2">
            <span>支持格式：PDF、Word (.docx)、图片</span>
            <span className="text-emerald-400 font-medium">● 附件状态良好</span>
          </div>
        </section>
      </div>

      {/* 底部确认行动栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-[var(--grid)] bg-[#141210] shadow-md">
        <button
          type="button"
          onClick={onBackToWorkbench}
          className="flex items-center gap-2 text-xs font-medium text-stone-400 hover:text-white transition-all cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          <span>如果不满意，可返回巡航工作台让大模型继续对话完善</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? <Check className="size-4" /> : <Save className="size-4" />}
            <span>{savedSuccess ? "已保存全部设置！" : "保存画像配置"}</span>
          </button>
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-300 transition-all cursor-pointer"
          >
            返回工作台启动巡航 →
          </button>
        </div>
      </div>
    </div>
  );
}
