import { useEffect, useRef } from "react";
import {
  Search,
  Send,
  SkipForward,
  Info,
  AlertTriangle,
  XCircle,
  Play,
  Square,
  LogIn,
  Filter,
} from "lucide-react";
import type { LiveFeedItem, LiveFeedTone } from "../../lib/liveFeed";

/** tone → 图标/颜色的映射（黑白玻璃主调，live=绿脉冲信号色，success=琥珀） */
const TONE_STYLE: Record<LiveFeedTone, { icon: typeof Search; color: string; dot: string }> = {
  live: { icon: Search, color: "text-emerald-300", dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" },
  success: { icon: Send, color: "text-amber-300", dot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]" },
  skip: { icon: SkipForward, color: "text-stone-400", dot: "bg-stone-500" },
  info: { icon: Info, color: "text-sky-300", dot: "bg-sky-400/80" },
  warning: { icon: AlertTriangle, color: "text-orange-300", dot: "bg-orange-400/80" },
  error: { icon: XCircle, color: "text-red-400", dot: "bg-red-500/90" },
};

const KIND_ICON_OVERRIDE: Partial<Record<LiveFeedItem["kind"], typeof Search>> = {
  browser_started: Play,
  api_flow_started: Play,
  loop_ended: Square,
  login_ok: LogIn,
  login_required: LogIn,
  page_filter: Filter,
};

function itemIcon(item: LiveFeedItem) {
  return KIND_ICON_OVERRIDE[item.kind] ?? TONE_STYLE[item.tone].icon;
}

interface LiveActivityFeedProps {
  items: LiveFeedItem[];
  running: boolean;
  isMonochrome: boolean;
}

/**
 * 实时活动流时间轴（Trigger.dev 式日志流 + automatisch 式步骤时间轴的融合）：
 * 最新在顶部自动置顶，条目 zoom-in 淡入；live 事件带呼吸脉冲点（"脚本活着"信号）。
 */
export default function LiveActivityFeed({ items, running, isMonochrome }: LiveActivityFeedProps) {
  const topRef = useRef<HTMLDivElement>(null);

  // 新条目到达时把视口带回顶部（用户手动往下翻阅时暂停跟随）
  const stickRef = useRef(true);
  useEffect(() => {
    if (stickRef.current && topRef.current) {
      topRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [items]);

  if (items.length === 0) {
    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center ${
          isMonochrome ? "text-zinc-500" : "text-stone-500"
        }`}
      >
        <div
          className={`size-12 rounded-2xl border flex items-center justify-center ${
            isMonochrome ? "border-white/10 bg-white/5" : "border-amber-500/20 bg-amber-500/5"
          }`}
        >
          <Play className="size-5 opacity-60" />
        </div>
        <p className="text-sm">
          {running ? "巡航已启动，正在唤起浏览器…第一条动态马上出现" : "启动自动巡航后，这里的每个动作都会实时呈现"}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto min-h-0 pr-1"
      onWheel={() => {
        stickRef.current = false;
      }}
      onTouchMove={() => {
        stickRef.current = false;
      }}
    >
      <div ref={topRef} />
      {/* 时间轴主体：左侧节点连线 + 右侧条目卡 */}
      <div className="relative pl-1">
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-white/8" aria-hidden />
        {items.map((item) => {
          const style = TONE_STYLE[item.tone];
          const Icon = itemIcon(item);
          const isLive = item.tone === "live" && running;
          return (
            <div key={item.id} className="relative flex items-start gap-3 py-1.5 animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-200">
              {/* 节点圆点（live 态呼吸脉冲） */}
              <div className="relative z-10 grid place-items-center size-7 shrink-0 rounded-full border border-white/10 bg-stone-950">
                {isLive && (
                  <span className={`absolute inset-0 rounded-full ${style.dot} opacity-40 animate-ping`} />
                )}
                <span className={`size-1.5 rounded-full ${style.dot}`} />
              </div>
              {/* 条目卡 */}
              <div className="min-w-0 flex-1 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    <Icon className={`size-3.5 mt-0.5 shrink-0 ${style.color}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-100 truncate leading-5">{item.title}</p>
                      {item.detail && (
                        <p className="text-[11px] text-stone-400 leading-4 mt-0.5 break-words">{item.detail}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-stone-600 shrink-0 mt-1">{item.time.slice(11) || ""}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
