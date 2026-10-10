import { type FC } from "react";
import { Sparkles } from "lucide-react";

interface PetSpeechBubbleProps {
  message: string;
  visible: boolean;
  isSleeping?: boolean;
  isMonochrome?: boolean;
  onClick?: () => void;
}

export const PetSpeechBubble: FC<PetSpeechBubbleProps> = ({
  message,
  visible,
  isSleeping = false,
  isMonochrome = false,
  onClick,
}) => {
  if (!visible || !message) return null;

  return (
    <div
      onClick={onClick}
      className={`absolute -top-12 left-1/2 -translate-x-1/2 z-20 max-w-[200px] w-max px-3 py-1.5 rounded-xl text-[11px] leading-tight font-medium shadow-xl backdrop-blur-md cursor-pointer transition-all duration-300 animate-in fade-in zoom-in-95 ${
        isSleeping
          ? "bg-indigo-950/85 text-indigo-200 border border-indigo-500/30 shadow-indigo-950/50"
          : isMonochrome
          ? "bg-zinc-900/90 text-zinc-100 border border-zinc-700/80 shadow-black/60"
          : "bg-stone-900/90 text-amber-200 border border-amber-500/35 shadow-amber-950/40"
      }`}
    >
      <div className="flex items-center gap-1.5 justify-center text-center">
        {!isSleeping && (
          <Sparkles
            className={`h-3 w-3 shrink-0 animate-spin ${
              isMonochrome ? "text-zinc-400" : "text-amber-400"
            }`}
            style={{ animationDuration: "6s" }}
          />
        )}
        <span className="truncate">{message}</span>
      </div>

      {/* 对话气泡向下尖角 (Tail) */}
      <div
        className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border-r border-b ${
          isSleeping
            ? "bg-indigo-950/85 border-indigo-500/30"
            : isMonochrome
            ? "bg-zinc-900/90 border-zinc-700/80"
            : "bg-stone-900/90 border-amber-500/35"
        }`}
      />
    </div>
  );
};

export default PetSpeechBubble;
