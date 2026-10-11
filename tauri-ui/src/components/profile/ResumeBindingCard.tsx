import { FileText, ExternalLink } from "lucide-react";
import { translate, type Lang } from "../../lib/i18n";
import { MagicCard } from "../core/MagicBento";

interface ResumeBindingCardProps {
  defaultResumeName: string;
  onGoToResumes: () => void;
  lang: Lang;
}

export default function ResumeBindingCard({
  defaultResumeName,
  onGoToResumes,
  lang,
}: ResumeBindingCardProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return (
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
            {t("rbind.title")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onGoToResumes}
          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer hover:underline"
        >
          <span>{t("rbind.manage")}</span>
          <ExternalLink className="size-3" />
        </button>
      </div>

      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <div
              className="text-xs font-semibold text-stone-100 truncate"
              title={defaultResumeName}
            >
              {defaultResumeName || "李象泉-后端-AI-Agent开发-2027届.docx"}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {t("rbind.attachmentHint")}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoToResumes}
          className="px-3 py-1.5 rounded-lg border border-[var(--grid)] hover:border-stone-700 bg-[#1c1917] text-xs text-stone-300 hover:text-white shrink-0 cursor-pointer"
        >
          {t("rbind.change")}
        </button>
      </div>
    </MagicCard>
  );
}
