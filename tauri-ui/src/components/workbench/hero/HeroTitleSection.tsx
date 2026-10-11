import { useState, useEffect } from "react";
import { TextEffect } from "../../core/text-effect";
import { translate, type Lang } from "../../../lib/i18n";

interface HeroTitleSectionProps {
  isSunkMode: boolean;
  lang: Lang;
}

export default function HeroTitleSection({ isSunkMode, lang }: HeroTitleSectionProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [heroAnimCycle, setHeroAnimCycle] = useState(0);
  const [heroAnimFading, setHeroAnimFading] = useState(false);

  useEffect(() => {
    const STAY_MS = 10000;
    const ANIM_TOTAL_MS = 5300;
    const FADE_OUT_MS = 450;
    const CYCLE_MS = ANIM_TOTAL_MS + STAY_MS + FADE_OUT_MS;

    const fadeTimer = setTimeout(() => {
      setHeroAnimFading(true);
    }, CYCLE_MS - FADE_OUT_MS);

    const resetTimer = setTimeout(() => {
      setHeroAnimFading(false);
      setHeroAnimCycle((c) => c + 1);
    }, CYCLE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(resetTimer);
    };
  }, [heroAnimCycle]);

  return (
    <div
      className={`w-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
        isSunkMode
          ? "max-h-0 opacity-0 -translate-y-8 scale-95 pointer-events-none mb-0"
          : "max-h-80 opacity-100 translate-y-0 scale-100 mb-6"
      }`}
    >
      <div
        className={`w-full transition-opacity duration-500 ease-out ${
          heroAnimFading ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* 第 1 行: 主标题 */}
        <h1 className="text-balance text-[2.2rem] font-bold leading-tight tracking-tight text-stone-100 sm:text-[2.9rem] lg:text-[3.25rem] sm:leading-[1.15]">
          <TextEffect
            key={`hero-l1-${heroAnimCycle}`}
            preset="fade-in-blur"
            speedReveal={1.1}
            speedSegment={0.3}
            delay={0}
            as="span"
            className="inline-block"
          >
            {t("hero.titleLine1")}
          </TextEffect>
        </h1>

        {/* 第 2 行 & 第 3 行: 副标题 */}
        <div className="mt-4 max-w-3xl mx-auto text-balance text-[14.5px] leading-relaxed text-stone-400 sm:text-[16px] space-y-1">
          <TextEffect
            key={`hero-l2-${heroAnimCycle}`}
            preset="fade-in-blur"
            speedReveal={1.1}
            speedSegment={0.3}
            delay={1.7}
            as="p"
            className="m-0"
          >
            {t("hero.titleLine2")}
          </TextEffect>
          <TextEffect
            key={`hero-l3-${heroAnimCycle}`}
            preset="fade-in-blur"
            speedReveal={1.1}
            speedSegment={0.3}
            delay={3.5}
            as="p"
            className="m-0"
          >
            {t("hero.titleLine3")}
          </TextEffect>
        </div>
      </div>
    </div>
  );
}
