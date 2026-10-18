import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, ShieldAlert, Sparkles, SkipForward, Wrench } from "lucide-react";
import { useRunStore } from "../../store";
import type { ProgressEvent } from "../../lib/ipc";

/** 单条守护 Agent 介入记录（agent_intervene 事件的视图模型）。 */
type InterventionItem = {
  id: string;
  level: string;
  title: string;
  action: string;
  detail: string;
  time: string;
  ts: number;
};

/** 介入态灯光的持续时间：最新一条介入事件 45s 内亮琥珀"介入处置中"。 */
const INTERVENING_WINDOW_MS = 45_000;
const MAX_ITEMS = 20;

function toInterventionItem(ev: ProgressEvent, seq: number): InterventionItem | null {
  if (ev.kind !== "agent_intervene") return null;
  const p = ev.payload;
  const time = ev.ts_local || "";
  const ts = time ? new Date(time.replace(" ", "T")).getTime() : 0;
  return {
    id: `${time || seq}-${seq}`,
    level: typeof p.level === "string" ? p.level : "info",
    title: typeof p.title === "string" ? p.title : "",
    action: typeof p.action === "string" ? p.action : "介入处理",
    detail: typeof p.detail === "string" ? p.detail : "",
    time,
    ts,
  };
}

/** level → 图标与配色（info=蓝绿信息 / warn=琥珀警示 / recovered=绿色自愈成功）。 */
const LEVEL_STYLE: Record<string, { icon: typeof Sparkles; color: string; dot: string }> = {
  info: { icon: SkipForward, color: "text-sky-300", dot: "bg-sky-400/80" },
  warn: { icon: ShieldAlert, color: "text-orange-300", dot: "bg-orange-400/80" },
  recovered: { icon: Wrench, color: "text-emerald-300", dot: "bg-emerald-400/90" },
};

/**
 * AI 巡航守护记录面板（2026-10-17 用户需求）：
 * 挂载在实时巡航页「平台实时通道」正下方，直播后台守护 Agent 的每一次
 * 异常研判与自愈动作（网申跳过 / 弹窗自愈 / 频控退避）。
 *
 * 价值：巡航遇到意外时，用户一眼看清是 AI Agent 在后台有条不紊地化解
 * 险情（绿色常态灯 + 时间轴介入动态），而不是软件死机了。
 */
export default function AgentInterventionFeed() {
  const running = useRunStore((s) => s.running);
  const events = useRunStore((s) => s.events);
  // 灯光从"介入处置中"回落到常态需要时间驱动（事件不再变化时也要翻转）
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [running]);

  // 只取守护 Agent 事件（最新在前，最多 20 条）
  const interventions = useMemo(() => {
    const items: InterventionItem[] = [];
    for (let i = events.length - 1; i >= 0 && items.length < MAX_ITEMS; i -= 1) {
      const item = toInterventionItem(events[i], i);
      if (item) items.push(item);
    }
    return items;
  }, [events]);

  const latest = interventions[0] ?? null;
  const intervening =
    running && latest !== null && Date.now() - latest.ts < INTERVENING_WINDOW_MS;
  const recoveredCount = interventions.filter((x) => x.level === "recovered").length;

  // 状态灯：巡航中绿色呼吸常态；最新介入 45s 内琥珀"介入处置中"；空闲灰
  const light = !running
    ? { dot: "bg-stone-600", glow: "", label: "待命", desc: "启动巡航后自动开启实时守护" }
    : intervening
      ? {
          dot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]",
          glow: "animate-ping",
          label: "Agent 介入处置中",
          desc: "正在化解巡航途中的异常，主流程未受阻",
        }
      : {
          dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]",
          glow: "animate-pulse",
          label: "实时巡航守护中",
          desc:
            interventions.length > 0
              ? `已化解 ${interventions.length} 次异态（自愈 ${recoveredCount} 次）`
              : "一切正常，暂无异常介入",
        };

  // 新条目到达时回到顶部（复用 LiveActivityFeed 的滚动跟随策略）
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [interventions]);

  return (
    <div className="rounded-2xl border border-white/10 bg-stone-900/40 backdrop-blur-xl p-4 flex flex-col min-h-0">
      {/* 头部：守护状态灯 */}
      <div className="flex items-center gap-2 pb-2.5 border-b border-white/8 shrink-0">
        <span className="relative grid place-items-center size-6 shrink-0">
          {running && (
            <span className={`absolute inset-0 rounded-full ${light.dot.includes("emerald") || light.dot.includes("amber") ? light.dot.replace(/bg-(emerald|amber)-400/, "bg-$1-400/30") : ""} ${light.glow}`} />
          )}
          <span className={`size-2 rounded-full ${light.dot}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className={`size-3.5 ${running ? "text-emerald-300" : "text-stone-500"}`} />
            <h4 className="text-xs font-bold text-white">AI 容错看门狗</h4>
            <span
              className={`text-[9px] font-mono px-1.5 py-px rounded-full border font-medium ${
                intervening
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : running
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/5 text-stone-500"
              }`}
            >
              {light.label}
            </span>
          </div>
          <p className="text-[10px] text-stone-500 mt-0.5 truncate">{light.desc}</p>
        </div>
      </div>

      {/* 介入时间轴 */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto pr-1 max-h-[240px]"
        onWheel={(e) => {
          if (e.deltaY > 0) stickRef.current = false;
          else if (e.currentTarget.scrollTop <= 40) stickRef.current = true;
        }}
      >
        {interventions.length === 0 ? (
          <p className="pt-3 text-[11px] text-stone-500 leading-relaxed">
            {running
              ? "巡航顺畅运行中。遇到网申岗位、弹窗阻塞等意外时，Agent 的研判与处置动作会实时出现在这里。"
              : "守护 Agent 待命：启动巡航后，这里会直播每一次异常研判与自愈动作。"}
          </p>
        ) : (
          <div className="relative pl-1 pt-2.5">
            <div className="absolute left-[13px] top-4 bottom-2 w-px bg-white/8" aria-hidden />
            {interventions.map((item) => {
              const style = LEVEL_STYLE[item.level] ?? LEVEL_STYLE.info;
              const Icon = style.icon;
              return (
                <div
                  key={item.id}
                  className="relative flex items-start gap-2.5 py-1.5 animate-in fade-in slide-in-from-top-1 duration-200"
                >
                  <div className="relative z-10 grid place-items-center size-6 shrink-0 rounded-full border border-white/10 bg-stone-950">
                    <span className={`size-1.5 rounded-full ${style.dot}`} />
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex items-start gap-1.5">
                        <Icon className={`size-3 mt-0.5 shrink-0 ${style.color}`} />
                        <div className="min-w-0">
                          {item.title && (
                            <p className="text-[11px] font-semibold text-stone-100 truncate leading-4">
                              {item.title}
                            </p>
                          )}
                          <p className="text-[10px] text-stone-400 leading-4 mt-0.5 break-words">
                            <span className={`font-medium ${style.color}`}>【{item.action}】</span>
                            {item.detail}
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-stone-600 shrink-0 mt-0.5">
                        {item.time.slice(11) || ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
