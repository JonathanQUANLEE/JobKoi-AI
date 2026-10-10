import React from "react";
import type { ResumeItem } from "../../lib/ipc";
import CardSwap, { Card, type CardSwapHandle } from "../core/CardSwap";

interface Resume3DViewProps {
  cardSwapRef: React.RefObject<CardSwapHandle | null>;
  cardHeight: number;
  resumes: ResumeItem[];
  isReadingMode: boolean;
  setIsReadingMode: (val: boolean) => void;
  setSelectedName: (name: string) => void;
  renderViewer: (item: ResumeItem, isFlat: boolean) => React.ReactNode;
}

export default function Resume3DView({
  cardSwapRef,
  cardHeight,
  resumes,
  isReadingMode,
  setIsReadingMode,
  setSelectedName,
  renderViewer,
}: Resume3DViewProps) {
  return (
    <div
      className="w-full flex justify-center items-center pt-8 pb-4 overflow-visible"
      style={{ minHeight: `${cardHeight + 20}px` }}
    >
      <CardSwap
        ref={cardSwapRef as any}
        width="100%"
        height={cardHeight}
        cardDistance={32}
        verticalDistance={26}
        skewAmount={1.8}
        autoPlay={false}
        pauseOnHover={true}
        isReadingMode={isReadingMode}
        onFrontChange={(frontIdx) => {
          setIsReadingMode(false);
          const frontItem = resumes[frontIdx];
          if (frontItem) {
            setSelectedName(frontItem.name);
          }
        }}
      >
        {resumes.map((item) => (
          <Card
            key={item.name}
            className="w-full rounded-3xl border border-stone-800/80 bg-[#171513] shadow-2xl flex flex-col overflow-hidden select-none"
            style={{ height: `${cardHeight}px` }}
          >
            {renderViewer(item, false)}
          </Card>
        ))}
      </CardSwap>
    </div>
  );
}
