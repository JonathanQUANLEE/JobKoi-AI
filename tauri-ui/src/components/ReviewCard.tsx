import type { ReactNode } from "react";
import { Check, SkipForward, Square } from "lucide-react";
import { asRecord, asString, formatJobLine } from "../lib/dashboardHelpers";
import { MagicCard } from "./core/MagicBento";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <MagicCard className="panel" glowColor="245, 158, 11" enableTilt={false} enableBorderGlow={true}>
      <div className="panel-title">{title}</div>
      {children}
    </MagicCard>
  );
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 border-b border-[var(--grid)] pb-2">
      <span className="text-xs text-[var(--muted-fg)]">{label}</span>
      <span className="break-words text-[var(--ink)]">{value}</span>
    </div>
  );
}

interface ReviewCardProps {
  pending: Record<string, unknown>;
  busy: boolean;
  onDecision: (decision: "send" | "skip" | "quit") => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function ReviewCard({
  pending,
  busy,
  onDecision,
  t,
}: ReviewCardProps) {
  const job = asRecord(pending.job);
  const details = asRecord(pending.details);
  return (
    <div className="space-y-3">
      <div className="review-title">{formatJobLine(job)}</div>
      <InfoLine label={t("review.matchInfo")} value={asString(details.reason, "-")} />
      <InfoLine label={t("review.jobDetail")} value={asString(pending.job_description, "-")} />
      <div>
        <span className="field-label">{t("review.greeting")}</span>
        <pre className="review-greeting">{asString(pending.greeting, "")}</pre>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          className="btn-primary flex items-center justify-center gap-1.5"
          onClick={() => onDecision("send")}
          disabled={busy}
        >
          <Check className="h-3.5 w-3.5" />
          <span>{t("button.send")}</span>
        </button>
        <button
          className="btn-secondary flex items-center justify-center gap-1.5"
          onClick={() => onDecision("skip")}
          disabled={busy}
        >
          <SkipForward className="h-3.5 w-3.5" />
          <span>{t("button.skip")}</span>
        </button>
        <button
          className="btn-ghost flex items-center justify-center gap-1.5"
          onClick={() => onDecision("quit")}
          disabled={busy}
        >
          <Square className="h-3.5 w-3.5" />
          <span>{t("button.stop")}</span>
        </button>
      </div>
    </div>
  );
}
