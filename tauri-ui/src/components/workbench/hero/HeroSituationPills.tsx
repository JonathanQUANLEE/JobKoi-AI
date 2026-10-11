import { ArrowUpRight, RotateCw } from "lucide-react";
import { JOBSEEKER_SITUATION_BATCHES } from "../../../lib/dashboardHelpers";
import { translate, type Lang } from "../../../lib/i18n";

interface HeroSituationPillsProps {
  isSunkMode: boolean;
  recBatchIndex: number;
  isRotatingRec: boolean;
  onSelectSituation: (text: string) => void;
  onNextBatch: () => void;
  lang: Lang;
}

export default function HeroSituationPills({
  isSunkMode,
  recBatchIndex,
  isRotatingRec,
  onSelectSituation,
  onNextBatch,
  lang,
}: HeroSituationPillsProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return (
    <div
      className={`flex items-center justify-center gap-2.5 text-xs sm:text-[13px] flex-nowrap overflow-x-auto [scrollbar-width:none] w-full px-2 transition-all duration-500 ${
        isSunkMode ? "mt-2 opacity-80 scale-[0.98]" : "mt-5 opacity-100"
      }`}
    >
      {JOBSEEKER_SITUATION_BATCHES[recBatchIndex].map((item) => (
        <button
          key={item.role}
          type="button"
          onClick={() => onSelectSituation(item.userText)}
          className="group shrink-0 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1917]/80 hover:bg-[#25201d] hover:border-[#ff5722]/50 px-3 py-1.5 text-stone-300 hover:text-white backdrop-blur transition-all shadow-sm cursor-pointer whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-[#ff5722] group-hover:scale-125 transition-transform shadow-[0_0_6px_rgba(255,87,34,0.6)]" />
          <span className="font-medium">{item.role}</span>
          <span className="text-[11px] sm:text-xs text-stone-400 group-hover:text-stone-300">· {item.tag}</span>
          <ArrowUpRight className="size-3 text-stone-500 transition-colors group-hover:text-[#ff5722]" />
        </button>
      ))}

      <button
        type="button"
        onClick={onNextBatch}
        className="group shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1c1917]/60 hover:bg-[#25201d] hover:border-white/20 px-3 py-1.5 text-stone-400 hover:text-white transition-all shadow-sm cursor-pointer whitespace-nowrap"
        title={t("hero.shuffleTitle")}
      >
        <RotateCw className={`size-3.5 transition-transform duration-300 ${isRotatingRec ? "rotate-180" : ""}`} />
        <span className="text-xs sm:text-[13px]">{t("hero.shuffle")}</span>
      </button>
    </div>
  );
}
