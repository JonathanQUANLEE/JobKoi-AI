import { useT } from "../../../store";

interface DrawerPolicyTabProps {
  delayMin: string;
  setDelayMin: (v: string) => void;
  delayMax: string;
  setDelayMax: (v: string) => void;
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

/** 拟人化节流三档预设（2026-10-12 用户拍板；区间 [15,45]s 依据风控调研，
 *  与后端 platforms/limits.py 的 BOSS_DELAY_RANGE_SECONDS 单一来源一致）。 */
const DELAY_PRESETS: { key: string; descKey: string; min: string; max: string }[] = [
  { key: "policy.preset.fast", descKey: "policy.preset.fastDesc", min: "15", max: "30" },
  { key: "policy.preset.standard", descKey: "policy.preset.standardDesc", min: "20", max: "40" },
  { key: "policy.preset.safe", descKey: "policy.preset.safeDesc", min: "30", max: "45" },
];

export default function DrawerPolicyTab({
  delayMin,
  setDelayMin,
  delayMax,
  setDelayMax,
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
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">防封禁拟人延时设定</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {DELAY_PRESETS.map((preset) => {
            const active = delayMin === preset.min && delayMax === preset.max;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setDelayMin(preset.min);
                  setDelayMax(preset.max);
                }}
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
                  <span className="text-sm font-bold">{t(preset.key)}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {preset.min}–{preset.max}s
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-stone-400">{t(preset.descKey)}</p>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-500">
          {t("policy.delayCurrent", { min: delayMin, max: delayMax })}
        </p>

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
