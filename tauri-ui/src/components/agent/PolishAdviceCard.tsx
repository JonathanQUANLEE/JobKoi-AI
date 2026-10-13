import { Sparkles, Check, Copy, Send } from "lucide-react";

interface PolishAdviceCardProps {
  polishAdvice: string;
  copied: boolean;
  onCopy: () => void;
  chatMessages: Array<{ role: "user" | "assistant"; content: string }>;
  followUpInput: string;
  onFollowUpInputChange: (val: string) => void;
  onFollowUpSend: () => void;
  followUpPending: boolean;
}

export default function PolishAdviceCard({
  polishAdvice,
  copied,
  onCopy,
  chatMessages,
  followUpInput,
  onFollowUpInputChange,
  onFollowUpSend,
  followUpPending,
}: PolishAdviceCardProps) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-stone-900/80 p-4 space-y-3 shadow-lg animate-in fade-in duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400" />
          <span className="text-xs font-bold text-stone-100">AI 深度精修报告与改写成果</span>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400 text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
        >
          {copied ? (
            <>
              <Check className="size-3.5" />
              <span>已复制到剪贴板</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>一键复制精修文本</span>
            </>
          )}
        </button>
      </div>

      {/* 成果正文展示 */}
      <div className="max-h-[360px] overflow-y-auto pr-1 text-xs text-stone-200 leading-relaxed font-sans whitespace-pre-wrap rounded-xl bg-stone-950/90 p-3.5 border border-stone-800/80">
        {polishAdvice}
      </div>

      {/* 持续追问对话区 */}
      <div className="pt-2 border-t border-stone-800/80 space-y-2">
        <span className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
          <span>继续追问微调</span>
        </span>

        {chatMessages.length > 1 && (
          <div className="max-h-36 overflow-y-auto space-y-2 pr-1 text-xs">
            {chatMessages.slice(1).map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-1.5 text-xs whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-amber-500 text-stone-950 font-medium"
                      : "bg-stone-950 border border-stone-800 text-stone-200"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={followUpInput}
            onChange={(e) => onFollowUpInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onFollowUpSend();
              }
            }}
            disabled={followUpPending}
            placeholder="继续提出要求，例如：帮我把第2段缩短一点 / 针对腾讯面试怎么介绍？"
            className="flex-1 rounded-xl bg-stone-950 border border-stone-800 px-3 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
          />
          <button
            type="button"
            onClick={onFollowUpSend}
            disabled={followUpPending || !followUpInput.trim()}
            className="size-7 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center hover:bg-amber-400 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Send className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
