import { useT } from "../../../store";
import { DELAY_PRESETS, isPresetActive, isFollowGeneric } from "../../../lib/platformDelays";

interface DrawerPolicyTabProps {
  delayMin: string;
  setDelayMin: (v: string) => void;
  delayMax: string;
  setDelayMax: (v: string) => void;
  /** 分平台拟人化节奏（2026-10-13）：空串 = 跟随通用档（delayMin/Max）。 */
  liepinDelayMin: string;
  setLiepinDelayMin: (v: string) => void;
  liepinDelayMax: string;
  setLiepinDelayMax: (v: string) => void;
  job51DelayMin: string;
  setJob51DelayMin: (v: string) => void;
  job51DelayMax: string;
  setJob51DelayMax: (v: string) => void;
  maxSent: string;
  setMaxSent: (v: string) => void;
  dailyLimit: string;
  setDailyLimit: (v: string) => void;
  stopOnCaptcha: boolean;
  setStopOnCaptcha: (v: boolean) => void;
  sendResumeAfterGreeting: boolean;
  setSendResumeAfterGreeting: (v: boolean) => void;
  autoResumeOnReply: boolean;
  setAutoResumeOnReply: (v: boolean) => void;
}

/** 单个平台的预设按钮（抽屉琥珀主题）。 */
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
      className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
        active
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-[var(--grid)] bg-[var(--paper)] hover:border-amber-500/40"
      }`}
    >
      <div
        className={`flex items-baseline justify-between ${
          active ? "text-amber-300" : "text-stone-200"
        }`}
      >
        <span className="text-sm font-bold">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{range}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-stone-400">{desc}</p>
    </button>
  );
}

export default function DrawerPolicyTab({
  delayMin,
  setDelayMin,
  delayMax,
  setDelayMax,
  liepinDelayMin,
  setLiepinDelayMin,
  liepinDelayMax,
  setLiepinDelayMax,
  job51DelayMin,
  setJob51DelayMin,
  job51DelayMax,
  setJob51DelayMax,
  maxSent,
  setMaxSent,
  dailyLimit,
  setDailyLimit,
  stopOnCaptcha,
  setStopOnCaptcha,
  sendResumeAfterGreeting,
  setSendResumeAfterGreeting,
  autoResumeOnReply,
  setAutoResumeOnReply,
}: DrawerPolicyTabProps) {
  const t = useT();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            防封禁拟人延时设定 · 分平台独立三档
          </h3>
          <p className="mt-1 text-[11px] text-stone-500">
            {t("policy.delayCurrent", { min: delayMin, max: delayMax })}
          </p>
        </div>

        {/* BOSS 直聘（通用档：猎聘/前程无忧未单设时也回退到这里） */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#00bebd] flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#00bebd]" />
              {t("policy.delay.boss")}
            </span>
            <span className="text-[11px] text-stone-400 font-mono tabular-nums">
              {delayMin}~{delayMax}s
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(delayMin, delayMax, preset)}
                onClick={() => {
                  setDelayMin(preset.min);
                  setDelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </div>

        {/* 猎聘：跟随通用 + 三档 */}
        <div className="space-y-2 pt-3 border-t border-[var(--grid)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#ff7033] flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#ff7033]" />
              {t("policy.delay.liepin")}
            </span>
            <span className="text-[11px] text-stone-400 font-mono tabular-nums">
              {isFollowGeneric(liepinDelayMin, liepinDelayMax)
                ? `${delayMin}~${delayMax}s（跟随通用）`
                : `${liepinDelayMin}~${liepinDelayMax}s`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <PresetButton
              label={t("policy.followGeneric")}
              desc={t("policy.followGenericDesc")}
              range={`${delayMin}–${delayMax}s`}
              active={isFollowGeneric(liepinDelayMin, liepinDelayMax)}
              onClick={() => {
                setLiepinDelayMin("");
                setLiepinDelayMax("");
              }}
            />
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(liepinDelayMin, liepinDelayMax, preset)}
                onClick={() => {
                  setLiepinDelayMin(preset.min);
                  setLiepinDelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </div>

        {/* 前程无忧：跟随通用 + 三档 */}
        <div className="space-y-2 pt-3 border-t border-[var(--grid)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#ff5000] flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#ff5000]" />
              {t("policy.delay.job51")}
            </span>
            <span className="text-[11px] text-stone-400 font-mono tabular-nums">
              {isFollowGeneric(job51DelayMin, job51DelayMax)
                ? `${delayMin}~${delayMax}s（跟随通用）`
                : `${job51DelayMin}~${job51DelayMax}s`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <PresetButton
              label={t("policy.followGeneric")}
              desc={t("policy.followGenericDesc")}
              range={`${delayMin}–${delayMax}s`}
              active={isFollowGeneric(job51DelayMin, job51DelayMax)}
              onClick={() => {
                setJob51DelayMin("");
                setJob51DelayMax("");
              }}
            />
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(job51DelayMin, job51DelayMax, preset)}
                onClick={() => {
                  setJob51DelayMin(preset.min);
                  setJob51DelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[var(--grid)]">
          <div>
            <label className="field-label">{t("field.maxSent")} (本次上限)</label>
            <input
              className="field-input"
              type="number"
              value={maxSent}
              onChange={(e) => setMaxSent(e.target.value)}
              placeholder="50"
            />
          </div>
          <div>
            <label className="field-label">{t("field.dailyLimit")} (每日保护限额)</label>
            <input
              className="field-input"
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              placeholder="80"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">投递动作安全开关</h3>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={stopOnCaptcha}
            onChange={(e) => setStopOnCaptcha(e.target.checked)}
          />
          <span>{t("toggle.stopOnCaptcha")}（遇到安全验证码自动停机报警）</span>
        </label>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={sendResumeAfterGreeting}
            onChange={(e) => setSendResumeAfterGreeting(e.target.checked)}
          />
          <span>打招呼后立即投递简历附件</span>
        </label>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={autoResumeOnReply}
            onChange={(e) => setAutoResumeOnReply(e.target.checked)}
          />
          <span>HR 回复消息后自动发送在线简历</span>
        </label>
      </div>
    </div>
  );
}
