import React from "react";
import { Image as ImageIcon, FileText, FileSpreadsheet } from "lucide-react";
import type { ResumeItem } from "../../lib/ipc";
import { isImageExt, formatSize } from "../../lib/resumeUtils";

interface ResumeFlatViewProps {
  resumes: ResumeItem[];
  selectedName: string | null;
  setSelectedName: (name: string) => void;
  flatSpreadAll: boolean;
  cardHeight: number;
  isMonochrome: boolean;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  renderViewer: (item: ResumeItem, isFlat: boolean) => React.ReactNode;
}

export default function ResumeFlatView({
  resumes,
  selectedName,
  setSelectedName,
  flatSpreadAll,
  cardHeight,
  isMonochrome,
  onWheel,
  renderViewer,
}: ResumeFlatViewProps) {
  return (
    <div
      onWheel={onWheel}
      className="w-full space-y-4 pt-1 pb-4 animate-in fade-in duration-150"
    >
      {/* 横向快捷切换标签栏 */}
      {!flatSpreadAll && resumes.length > 1 && (
        <div className="w-full flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {resumes.map((item) => {
            const isSelected = item.name === selectedName;
            const isImg = isImageExt(item.name);
            const isPdf = item.name.endsWith(".pdf");
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => setSelectedName(item.name)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer border ${
                  isSelected
                    ? isMonochrome
                      ? "bg-white text-black border-white shadow-md font-bold"
                      : "bg-amber-500/20 text-amber-200 border-amber-500/60 shadow-sm shadow-amber-500/10 font-bold"
                    : "bg-stone-900/80 text-stone-400 border-stone-800 hover:text-stone-200 hover:border-stone-700"
                }`}
              >
                {isImg ? (
                  <ImageIcon className="size-3.5 text-purple-400 shrink-0" />
                ) : isPdf ? (
                  <FileText className="size-3.5 text-red-400 shrink-0" />
                ) : (
                  <FileSpreadsheet className="size-3.5 text-blue-400 shrink-0" />
                )}
                <span className="truncate max-w-[160px]">{item.name}</span>
                <span className="text-[10px] opacity-60 font-mono">
                  {formatSize(item.size)}
                </span>
                {item.is_default && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                      isSelected
                        ? isMonochrome
                          ? "bg-black text-white"
                          : "bg-amber-500 text-stone-950"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    默认
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 平铺主体区 */}
      {flatSpreadAll ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 w-full">
          {resumes.map((item) => (
            <div
              key={item.name}
              className={`w-full rounded-3xl border shadow-xl flex flex-col overflow-hidden transition-all ${
                item.name === selectedName
                  ? isMonochrome
                    ? "border-white/40 ring-1 ring-white/20 bg-[#141416]"
                    : "border-amber-500/50 ring-1 ring-amber-500/20 bg-[#161414]"
                  : "border-stone-800/80 bg-[#151312]"
              }`}
              style={{ height: `${cardHeight}px` }}
              onClick={() => setSelectedName(item.name)}
            >
              {renderViewer(item, true)}
            </div>
          ))}
        </div>
      ) : (
        (() => {
          const activeItem = resumes.find((r) => r.name === selectedName) || resumes[0];
          if (!activeItem) return null;
          return (
            <div
              className="w-full rounded-3xl border border-stone-800/80 bg-[#151312] shadow-2xl flex flex-col overflow-hidden"
              style={{ height: `${cardHeight}px` }}
            >
              {renderViewer(activeItem, true)}
            </div>
          );
        })()
      )}
    </div>
  );
}
