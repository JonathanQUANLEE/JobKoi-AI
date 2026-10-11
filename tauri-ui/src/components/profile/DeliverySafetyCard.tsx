import { ShieldCheck } from "lucide-react";
import { translate, type Lang } from "../../lib/i18n";
import { MagicCard } from "../core/MagicBento";

interface DeliverySafetyCardProps {
  dailyLimit: string;
  setDailyLimit: (val: string) => void;
  lang: Lang;
}

export default function DeliverySafetyCard({
  dailyLimit,
  setDailyLimit,
  lang,
}: DeliverySafetyCardProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return (
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
          {t("dsafe.title")}
        </h2>
      </div>

      <div className="space-y-4 text-xs">
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
          <div>
            <div className="text-xs font-medium text-stone-200">
              {t("dsafe.dailyLimit")}
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">
              {t("dsafe.dailyLimitHint")}
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
            <span className="text-stone-500">{t("dsafe.perDay")}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-950/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-emerald-300">
                {t("dsafe.antiBan")}
              </div>
              <div className="text-[10px] text-stone-400 mt-0.5">
                {t("dsafe.antiBanDesc")}
              </div>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-md bg-emerald-900/60 border border-emerald-500/30">
            {t("dsafe.protected")}
          </span>
        </div>
      </div>
    </MagicCard>
  );
}
