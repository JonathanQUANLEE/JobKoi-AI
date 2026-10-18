import { type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldCheckIcon } from "@hugeicons/core-free-icons";
import { useT } from "../../../store";
import { DELAY_PRESETS, isPresetActive, isFollowGeneric } from "../../../lib/platformDelays";

interface PolicySettingsViewProps {
  localDailyLimit: string;
  setLocalDailyLimit: (val: string) => void;
  /** 分平台每日投递上限（2026-10-18 严重缺陷修复）：空串 = 未单设（回退系统默认）。 */
  localLiepinDailyLimit: string;
  setLocalLiepinDailyLimit: (val: string) => void;
  localJob51DailyLimit: string;
  setLocalJob51DailyLimit: (val: string) => void;
  localDelayMin: string;
  setLocalDelayMin: (val: string) => void;
  localDelayMax: string;
  setLocalDelayMax: (val: string) => void;
  /** 分平台拟人化节奏（2026-10-13）：空串 = 跟随通用档。 */
  localLiepinDelayMin: string;
  setLocalLiepinDelayMin: (val: string) => void;
  localLiepinDelayMax: string;
  setLocalLiepinDelayMax: (val: string) => void;
  localJob51DelayMin: string;
  setLocalJob51DelayMin: (val: string) => void;
  localJob51DelayMax: string;
  setLocalJob51DelayMax: (val: string) => void;
  /** 分平台单轮投递上限（2026-10-17 用户需求"三个平台都应该能设"）。 */
  localMaxSent: string;
  setLocalMaxSent: (val: string) => void;
  localLiepinRunMax: string;
  setLocalLiepinRunMax: (val: string) => void;
  localJob51RunMax: string;
  setLocalJob51RunMax: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
}

/** 单个平台的预设按钮（雾化弹窗蓝色主题）。 */
function PresetButton({
  label,
  desc,
  range,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  range: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-xl text-left transition-all cursor-pointer border ${
        active
          ? "border-blue-500/60 bg-blue-500/10"
          : "bg-white/[0.03] border-white/10 hover:border-blue-500/40"
      }`}
    >
      <div
        className={`flex items-baseline justify-between ${
          active ? "text-blue-300" : "text-stone-200"
        }`}
      >
        <span className="text-xs font-bold">{label}</span>
        <span className="text-xs font-semibold font-mono tabular-nums">{range}</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-stone-400">{desc}</p>
    </button>
  );
}

/** 一个平台分组：标题 + 当前生效值 + 预设按钮组。 */
function PlatformDelayGroup({
  title,
  dotColor,
  currentValue,
  followGeneric,
  children,
}: {
  title: string;
  dotColor: string;
  currentValue: string;
  followGeneric?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold flex items-center gap-1.5 ${dotColor}`}>
          <span className={`size-2 rounded-full ${dotColor.replace("text-", "bg-")}`} />
          {title}
        </span>
        <span className="text-[11px] text-stone-400 font-mono tabular-nums">
          {currentValue}
          {followGeneric ? "（跟随通用）" : ""}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function PolicySettingsView({
  localDailyLimit,
  setLocalDailyLimit,
  localLiepinDailyLimit,
  setLocalLiepinDailyLimit,
  localJob51DailyLimit,
  setLocalJob51DailyLimit,
  localDelayMin,
  setLocalDelayMin,
  localDelayMax,
  setLocalDelayMax,
  localLiepinDelayMin,
  setLocalLiepinDelayMin,
  localLiepinDelayMax,
  setLocalLiepinDelayMax,
  localJob51DelayMin,
  setLocalJob51DelayMin,
  localJob51DelayMax,
  setLocalJob51DelayMax,
  localMaxSent,
  setLocalMaxSent,
  localLiepinRunMax,
  setLocalLiepinRunMax,
  localJob51RunMax,
  setLocalJob51RunMax,
  onSave,
  onClose,
}: PolicySettingsViewProps) {
  const t = useT();
  // 从本地读取或初始化 3 大平台各自的投递限额（默认拉满官方最大上限）
  // 三平台每日投递上限（2026-10-18 严重缺陷修复）：旧版 liepin/job51 只写
  // localStorage（后端从不读）＝假 UI。现在直接绑定表单状态（保存时随 profile
  // 落盘 → profile_env_bridge 映射 env → 运行时真实生效）。
  // BOSS 上限按用户拍板 150（旧 UI 标签已写 150，后端 limits.py 亦同步改）。
  const bossMax = 150;
  const bossLimit = Number(localDailyLimit) || 150;
  const liepinLimit = localLiepinDailyLimit.trim() ? Number(localLiepinDailyLimit) : 50;
  const job51Limit = localJob51DailyLimit.trim() ? Number(localJob51DailyLimit) : 40;

  return (
    <div className="py-4 space-y-5">
      <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200/90 leading-relaxed flex items-start gap-2.5">
        <HugeiconsIcon icon={ShieldCheckIcon} size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong>为什么需要防风控保护？</strong><br />
          各大招聘平台（BOSS直聘等）均部署有严格的机械人爬虫检测。本软件内置<strong>泊松过程拟人化等待与贝塞尔平滑轨迹</strong>，每次沟通间隔随机浮动，高度还原真实人类操作节奏，确保您的账号安全无忧。
        </div>
      </div>

      {/* 多平台独立投递上限配置 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold text-stone-200 block">
              各平台每日投递上限 (分别设定 · 满额模式)
            </label>
            <p className="text-[11px] text-stone-400">
              各平台规则不同，已默认调至各平台官方最大安全上限，杜绝一刀切
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLocalDailyLimit("150");
              setLocalLiepinDailyLimit("50");
              setLocalJob51DailyLimit("40");
            }}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 border border-blue-500/30 transition-all cursor-pointer font-medium"
          >
            一键拉满各平台官方最大上限
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* BOSS 直聘 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#00bebd]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#00bebd] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#00bebd]" />
                BOSS 直聘
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                官方上限 150
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="10"
                max={bossMax}
                value={bossLimit}
                onChange={(e) => {
                  const val = Math.min(bossMax, Math.max(1, Number(e.target.value) || 1));
                  setLocalDailyLimit(String(val));
                }}
                className="mist-input text-xs font-mono w-full"
              />
              <span className="text-xs text-stone-400 shrink-0">次/天</span>
            </div>
          </div>

          {/* 猎聘 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#ff7033]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#ff7033] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ff7033]" />
                猎聘 Liepin
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                官方上限 100
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="100"
                value={liepinLimit}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                  setLocalLiepinDailyLimit(String(val));
                }}
                className="mist-input text-xs font-mono w-full"
              />
              <span className="text-xs text-stone-400 shrink-0">次/天</span>
            </div>
          </div>

          {/* 前程无忧 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#ff5000]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#ff5000] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ff5000]" />
                前程无忧 51job
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                官方上限 40
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="40"
                value={job51Limit}
                onChange={(e) => {
                  const val = Math.min(40, Math.max(1, Number(e.target.value) || 1));
                  setLocalJob51DailyLimit(String(val));
                }}
                className="mist-input text-xs font-mono w-full"
              />
              <span className="text-xs text-stone-400 shrink-0">次/天</span>
            </div>
          </div>
        </div>
      </div>

      {/* 各平台单轮投递上限（2026-10-17 用户需求"三个平台都应该能设"：
          单轮=一次巡航最多投多少份，与上方"每日上限"是两个不同的量；
          BOSS 填 0 = 不限单轮，跑满每日上限或岗位扫完才停（巡航中自动
          分批轮换城市与岗位词）。 */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-stone-200 block">
            各平台单轮投递上限 (每次巡航最多投多少份)
          </label>
          <p className="text-[11px] text-stone-400">
            与「每日上限」相互独立：单轮管一次巡航的量，投满即安全收工，可随时再启动下一轮
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* BOSS 直聘 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#00bebd]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#00bebd] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#00bebd]" />
                BOSS 直聘
              </span>
              <span className="text-[10px] text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/25">
                0 = 不限单轮
              </span>
            </div>
            <input
              type="number"
              min="0"
              max="50"
              value={localMaxSent}
              onChange={(e) => setLocalMaxSent(e.target.value)}
              placeholder="50"
              className="mist-input text-xs font-mono w-full"
            />
            <p className="mt-1 text-[10px] text-stone-500 leading-relaxed">
              填 0 跑满每日上限（150）才停；正数 = 单轮投满即停
            </p>
          </div>

          {/* 猎聘 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#ff7033]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#ff7033] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ff7033]" />
                猎聘 Liepin
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                默认 15
              </span>
            </div>
            <input
              type="number"
              min="1"
              max="50"
              value={localLiepinRunMax}
              onChange={(e) => setLocalLiepinRunMax(e.target.value)}
              placeholder="15"
              className="mist-input text-xs font-mono w-full"
            />
            <p className="mt-1 text-[10px] text-stone-500 leading-relaxed">
              留空 = 系统默认 15 份/轮；新号保护模式会自动改小
            </p>
          </div>

          {/* 前程无忧 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#ff5000]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#ff5000] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ff5000]" />
                前程无忧 51job
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                默认 10
              </span>
            </div>
            <input
              type="number"
              min="1"
              max="20"
              value={localJob51RunMax}
              onChange={(e) => setLocalJob51RunMax(e.target.value)}
              placeholder="10"
              className="mist-input text-xs font-mono w-full"
            />
            <p className="mt-1 text-[10px] text-stone-500 leading-relaxed">
              留空 = 系统默认 10 份/轮（范围 1~20）
            </p>
          </div>
        </div>
      </div>

      {/* 拟人化等待时间区间 - 分平台三档可选（2026-10-13 用户拍板）。
          BOSS 档同时是通用档：猎聘/前程无忧未单设时回退到这里。
          替换旧版"🔒 系统算法托管 · 已锁定 3~6s"假 UI：那个区块显示的
          3-6s 与真实生效值毫无关系（真实值来自画像 delay_min/max），
          既误导用户又堵死了调节入口。 */}
      <div className="mist-setting-row bg-white/[0.02] border border-white/5 p-3.5 rounded-xl space-y-4">
        <div>
          <label className="text-xs font-semibold text-stone-200">
            拟人化等待时间区间 · 分平台独立设定 (秒)
          </label>
          <p className="text-[11px] text-stone-400 leading-relaxed mt-1">
            {t("policy.delayCurrent", { min: localDelayMin, max: localDelayMax })}
          </p>
        </div>

        {/* BOSS 直聘（通用档） */}
        <PlatformDelayGroup
          title={t("policy.delay.boss")}
          dotColor="text-[#00bebd]"
          currentValue={`${localDelayMin}~${localDelayMax}s`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(localDelayMin, localDelayMax, preset)}
                onClick={() => {
                  setLocalDelayMin(preset.min);
                  setLocalDelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </PlatformDelayGroup>

        {/* 猎聘：跟随通用 + 三档 */}
        <PlatformDelayGroup
          title={t("policy.delay.liepin")}
          dotColor="text-[#ff7033]"
          currentValue={
            isFollowGeneric(localLiepinDelayMin, localLiepinDelayMax)
              ? `${localDelayMin}~${localDelayMax}s`
              : `${localLiepinDelayMin}~${localLiepinDelayMax}s`
          }
          followGeneric={isFollowGeneric(localLiepinDelayMin, localLiepinDelayMax)}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <PresetButton
              label={t("policy.followGeneric")}
              desc={t("policy.followGenericDesc")}
              range={`${localDelayMin}–${localDelayMax}s`}
              active={isFollowGeneric(localLiepinDelayMin, localLiepinDelayMax)}
              onClick={() => {
                setLocalLiepinDelayMin("");
                setLocalLiepinDelayMax("");
              }}
            />
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(localLiepinDelayMin, localLiepinDelayMax, preset)}
                onClick={() => {
                  setLocalLiepinDelayMin(preset.min);
                  setLocalLiepinDelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </PlatformDelayGroup>

        {/* 前程无忧：跟随通用 + 三档 */}
        <PlatformDelayGroup
          title={t("policy.delay.job51")}
          dotColor="text-[#ff5000]"
          currentValue={
            isFollowGeneric(localJob51DelayMin, localJob51DelayMax)
              ? `${localDelayMin}~${localDelayMax}s`
              : `${localJob51DelayMin}~${localJob51DelayMax}s`
          }
          followGeneric={isFollowGeneric(localJob51DelayMin, localJob51DelayMax)}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <PresetButton
              label={t("policy.followGeneric")}
              desc={t("policy.followGenericDesc")}
              range={`${localDelayMin}–${localDelayMax}s`}
              active={isFollowGeneric(localJob51DelayMin, localJob51DelayMax)}
              onClick={() => {
                setLocalJob51DelayMin("");
                setLocalJob51DelayMax("");
              }}
            />
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(localJob51DelayMin, localJob51DelayMax, preset)}
                onClick={() => {
                  setLocalJob51DelayMin(preset.min);
                  setLocalJob51DelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </PlatformDelayGroup>
      </div>

      <div className="pt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-white transition-all cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-stone-950 font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          保存安全设置
        </button>
      </div>
    </div>
  );
}
