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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("field.delayMin")} (秒)</label>
            <input
              className="field-input"
              type="number"
              value={delayMin}
              onChange={(e) => setDelayMin(e.target.value)}
              placeholder="10"
            />
          </div>
          <div>
            <label className="field-label">{t("field.delayMax")} (秒)</label>
            <input
              className="field-input"
              type="number"
              value={delayMax}
              onChange={(e) => setDelayMax(e.target.value)}
              placeholder="60"
            />
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
