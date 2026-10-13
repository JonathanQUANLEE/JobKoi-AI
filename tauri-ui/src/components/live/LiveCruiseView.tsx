import { useEffect, useMemo, useState } from "react";
import { Activity, MapPin, Banknote, Rocket, Square, Radio, Compass, Clock3, Search, FlagTriangleRight, Check, Columns3, List } from "lucide-react";
import { useRunStore } from "../../store";
import { summarizeEvents, summarizeEventsByPlatform } from "../../lib/dashboardHelpers";
import { buildLiveFeed, currentProcessingJob, lastCruiseSummary, PLATFORM_META } from "../../lib/liveFeed";
import { ipc } from "../../lib/ipc";
import { AnimatedNumber } from "../core/animated-number";
import LiveActivityFeed from "./LiveActivityFeed";

interface LiveCruiseViewProps {
  onStartRun: () => void;
  onStopRun: () => Promise<void>;
  busy?: boolean;
}

/** 四平台实时通道：BOSS/猎聘/51job 已接入事件流，智联留位（2026-10-12 打通三平台）。 */
const PLATFORM_CHANNELS = [
  { id: "boss", name: "BOSS 直聘", live: true, desc: "点击「立即沟通」链路，动态实时直播" },
  { id: "liepin", name: "猎聘", live: true, desc: "「聊一聊 + 固定招呼语」链路，动态实时直播" },
  { id: "job51", name: "前程无忧", live: true, desc: "「一键投递简历」链路，动态实时直播" },
  { id: "zhaopin", name: "智联招聘", live: false, desc: "平台适配筹备中——上线后与其他平台共享同一块实时动态时间轴" },
] as const;

/** 平台日限额兜底（list_platforms 拉取失败时用；与后端 DEFAULT_DAILY_LIMITS 一致）。 */
const FALLBACK_DAILY_LIMITS: Record<string, number> = {
  boss: 150,
  liepin: 100,
  job51: 40,
};

/** 实时通道勾选持久化 key（勾选的平台在时间轴里并列直播）。 */
const LIVE_CHANNELS_KEY = "jobhunter_live_channels";
const DEFAULT_CHANNELS = ["boss", "liepin", "job51"];

function loadChannels(): string[] {
  try {
    const raw = localStorage.getItem(LIVE_CHANNELS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((c) => typeof c === "string" && DEFAULT_CHANNELS.includes(c));
        if (valid.length > 0) return valid;
      }
    }
  } catch {}
  return [...DEFAULT_CHANNELS];
}

/** 运行时长格式化：秒级跳动（mm:ss / hh:mm:ss）。 */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function LiveCruiseView({ onStartRun, onStopRun, busy = false }: LiveCruiseViewProps) {
  const running = useRunStore((s) => s.running);
  const events = useRunStore((s) => s.events);
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");
  const cruiseStartedAt = useRunStore((s) => s.cruiseStartedAt);
  // 勾选的平台通道（并列直播）：localStorage 持久化，默认三平台全开
  const [channels, setChannels] = useState<string[]>(loadChannels);
  // 平台日限额（后端 list_platforms 的 daily_limit；失败用兜底常量）。
  // 2026-10-13 修正：旧版顶部写死画像表单的 dailyLimit（BOSS 的 150）当
  // 全局上限——跑猎聘/51job 时口径错误；限额是平台属性，分平台显示。
  const [platformLimits, setPlatformLimits] = useState<Record<string, number>>({});
  const [, forceTick] = useState(0);

  // 拉一次各平台日限额（BOSS 150 / 猎聘 100 / 51job 40 的单一来源在后端）
  useEffect(() => {
    ipc
      .listPlatforms()
      .then((res) => {
        const m: Record<string, number> = {};
        for (const p of res.platforms ?? []) {
          if (p.daily_limit) m[p.id] = p.daily_limit;
        }
        setPlatformLimits(m);
      })
      .catch(() => {});
  }, []);

  // 运行中每秒跳动（时长计时器）
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const toggleChannel = (id: string) => {
    // 至少保留一个通道（全取消会把时间轴清空）
    const next = channels.includes(id)
      ? channels.filter((c) => c !== id)
      : [...channels, id];
    if (next.length === 0) return;
    setChannels(next);
    try {
      localStorage.setItem(LIVE_CHANNELS_KEY, JSON.stringify(next));
    } catch {}
  };

  // 视图模式：默认三列分列并排（BOSS/猎聘/51job 三平台独立并排）；可切换为混合流
  const [viewMode, setViewMode] = useState<"columns" | "combined">("columns");

  const feed = useMemo(() => buildLiveFeed(events, 200, channels), [events, channels]);

  // 针对三平台分别构建专属活动流
  const feedByPlatform = useMemo(() => {
    return {
      boss: buildLiveFeed(events, 200, ["boss"]),
      liepin: buildLiveFeed(events, 200, ["liepin"]),
      job51: buildLiveFeed(events, 200, ["job51"]),
    };
  }, [events]);

  // 分列展示的平台列表（默认三平台并列；联动右侧通道勾选）
  const displayPlatforms = useMemo(() => {
    const list = PLATFORM_CHANNELS.filter((c) => c.live && channels.includes(c.id));
    return list.length > 0 ? list : PLATFORM_CHANNELS.filter((c) => c.live);
  }, [channels]);

  const spotlight = useMemo(() => currentProcessingJob(events), [events]);
  const cruiseSummary = useMemo(() => lastCruiseSummary(events), [events]);
  const stats = useMemo(() => summarizeEvents(events), [events]);
  const perPlatform = useMemo(() => summarizeEventsByPlatform(events), [events]);
  const elapsed = cruiseStartedAt ? Date.now() - cruiseStartedAt : null;
  /** 平台日限额（分平台显示在通道卡上；list_platforms 失败时用兜底常量） */
  const limitOf = (id: string) => platformLimits[id] ?? FALLBACK_DAILY_LIMITS[id] ?? 0;

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col gap-3.5 animate-in fade-in duration-200">
      {/* ===== 顶部状态带：LIVE 徽章（呼吸脉冲）+ 开始时间 + 运行时长 + 停止按钮 ===== */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 rounded-2xl border backdrop-blur-xl ${
          isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
        }`}
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* LIVE 徽章：运行中=绿脉冲信号灯（行业通用的"活着"信号色）；空闲=灰 */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="relative grid place-items-center size-9 rounded-xl border border-white/15 bg-white/[0.04]">
              {running && (
                <span className="absolute inset-0 rounded-xl bg-emerald-400/20 animate-ping" />
              )}
              <Radio
                className={`size-4.5 ${running ? "text-emerald-300" : "text-stone-500"}`}
              />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-black tracking-widest ${running ? "text-emerald-300" : "text-stone-400"}`}>
                  {running ? "LIVE" : "IDLE"}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${running ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-stone-500"}`}>
                  {running ? "巡航进行中 · 全程直播" : "等待启动"}
                </span>
              </div>
              <p className="text-[10px] text-stone-500 mt-0.5">
                {cruiseStartedAt
                  ? `开始于 ${new Date(cruiseStartedAt).toLocaleTimeString("zh-CN", { hour12: false })}`
                  : "尚未启动过巡航"}
              </p>
            </div>
          </div>

          {/* 运行时长：秒级跳动 */}
          <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-white/10">
            <Clock3 className={`size-4 ${running ? "text-amber-300" : "text-stone-600"}`} />
            <span className={`font-mono text-lg font-bold tabular-nums ${running ? "text-white" : "text-stone-500"}`}>
              {elapsed !== null ? formatElapsed(elapsed) : "--:--"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {running ? (
            <button
              type="button"
              onClick={() => onStopRun().catch(() => {})}
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Square className="size-3.5 fill-current" />
              <span>停止巡航</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartRun}
              disabled={busy}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50 ${
                isMonochrome
                  ? "bg-white hover:bg-zinc-200 text-black shadow-white/10"
                  : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-500/20"
              }`}
            >
              <Rocket className="size-3.5" />
              <span>启动自动巡航</span>
            </button>
          )}
        </div>
      </div>

      {/* ===== 巡航结束横幅：结束原因醒目呈现（不埋在时间轴里一闪而过） ===== */}
      {!running && cruiseSummary && (
        <div className="flex items-start gap-3 px-5 py-3.5 rounded-2xl border border-amber-500/35 bg-amber-500/[0.07]">
          <span className="grid place-items-center size-8 rounded-xl border border-amber-500/30 bg-amber-500/10 shrink-0 mt-0.5">
            <FlagTriangleRight className="size-4 text-amber-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-200">
              {cruiseSummary.reason}
              <span className="ml-2 text-[10px] font-mono font-normal text-stone-500">{cruiseSummary.time}</span>
            </p>
            {cruiseSummary.message && (
              <p className="text-xs text-stone-300 leading-relaxed mt-1">{cruiseSummary.message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onStartRun}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <Rocket className="size-3.5" />
            <span>再来一轮</span>
          </button>
        </div>
      )}

      {/* ===== 跳动计数带：扫描 / 已投递 / 跳过（数字实时跳动） ===== */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <div
          className={`p-4 rounded-2xl border backdrop-blur-xl ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between text-stone-400 text-xs mb-1">
            <span>已扫描岗位</span>
            <Activity className="size-4 text-sky-300" />
          </div>
          <AnimatedNumber value={stats.scanned} className="text-3xl font-black text-white font-mono" />
        </div>
        <div
          className={`p-4 rounded-2xl border backdrop-blur-xl relative overflow-hidden ${
            isMonochrome ? "bg-zinc-950/70 border-amber-500/25" : "bg-stone-900/40 border-amber-500/30"
          }`}
        >
          {/* 已投递卡的呼吸光晕（运行中"冒光"反馈——用户需求的核心仪式感） */}
          {running && (
            <span className="absolute -right-6 -top-6 size-20 rounded-full bg-amber-500/15 blur-2xl animate-pulse" />
          )}
          <div className="flex items-center justify-between text-stone-400 text-xs mb-1">
            <span className="font-semibold text-amber-300">本轮已投递</span>
            <Rocket className="size-4 text-amber-300" />
          </div>
          <AnimatedNumber
            value={stats.sent}
            className="text-3xl font-black text-amber-300 font-mono"
          />
        </div>
        <div
          className={`p-4 rounded-2xl border backdrop-blur-xl ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between text-stone-400 text-xs mb-1">
            <span>已跳过</span>
            <Compass className="size-4 text-stone-400" />
          </div>
          <AnimatedNumber value={stats.skipped} className="text-3xl font-black text-stone-300 font-mono" />
        </div>
      </div>

      {/* ===== 主体：左活动流时间轴 + 右聚光卡与平台通道（撑满剩余高度） ===== */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* 左：实时活动流（三平台分列并排实时直播，亦可切为混合流） */}
        <div
          className={`flex flex-col rounded-2xl border backdrop-blur-xl p-4 min-h-0 ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/8 shrink-0">
            <div className="flex items-center gap-2">
              <Activity className={`size-4 ${running ? "text-emerald-300" : "text-stone-500"}`} />
              <h3 className="text-sm font-bold text-white">实时动态</h3>
              {running && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono animate-pulse">
                  STREAMING
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {/* 布局切换：默认分三列并排，满足用户多平台独立监控诉求 */}
              <div className="flex items-center p-0.5 rounded-lg border border-white/10 bg-white/5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setViewMode("columns")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                    viewMode === "columns"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                      : "text-stone-400 hover:text-stone-200 border border-transparent"
                  }`}
                  title="多平台分列并排实时监控"
                >
                  <Columns3 className="size-3" />
                  <span>分列并排 ({displayPlatforms.length}列)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("combined")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                    viewMode === "combined"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                      : "text-stone-400 hover:text-stone-200 border border-transparent"
                  }`}
                  title="单时间轴合并信息流"
                >
                  <List className="size-3" />
                  <span>混合流</span>
                </button>
              </div>
              <span className="text-[10px] text-stone-500 hidden xl:inline">新动态自动置顶</span>
            </div>
          </div>

          {viewMode === "columns" ? (
            <div
              className={`grid gap-3 flex-1 min-h-0 pt-3 ${
                displayPlatforms.length === 1
                  ? "grid-cols-1"
                  : displayPlatforms.length === 2
                    ? "grid-cols-1 md:grid-cols-2"
                    : "grid-cols-1 md:grid-cols-3"
              }`}
            >
              {displayPlatforms.map((c) => {
                const meta = PLATFORM_META[c.id];
                const p = perPlatform[c.id] ?? { scanned: 0, sent: 0, skipped: 0 };
                const pFeed = feedByPlatform[c.id as keyof typeof feedByPlatform] ?? [];
                const color = meta?.color ?? "#00bebd";
                const isPlatformActive = running && p.scanned > 0;
                return (
                  <div
                    key={c.id}
                    className="flex flex-col min-h-0 rounded-xl border border-white/8 bg-black/20 overflow-hidden shadow-inner"
                    style={{ borderTop: `2px solid ${color}` }}
                  >
                    {/* 平台专属列头 */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-white/[0.02] shrink-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`size-2 rounded-full shrink-0 ${isPlatformActive ? "animate-pulse" : ""}`}
                          style={{
                            backgroundColor: color,
                            boxShadow: isPlatformActive ? `0 0 8px ${color}` : "none",
                          }}
                        />
                        <span className="text-xs font-bold text-stone-100 truncate">{c.name}</span>
                        {isPlatformActive && (
                          <span
                            className="text-[8px] font-mono font-bold px-1 py-px rounded uppercase shrink-0"
                            style={{
                              color,
                              backgroundColor: `${color}18`,
                            }}
                          >
                            LIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-stone-400 shrink-0">
                        投 <span style={{ color }} className="font-bold">{p.sent}</span>/{limitOf(c.id)} · 扫 {p.scanned} · 跳 {p.skipped}
                      </div>
                    </div>

                    {/* 平台专属独立滚动时间轴 */}
                    <div className="flex-1 min-h-0 flex flex-col p-2">
                      <LiveActivityFeed
                        items={pFeed}
                        running={running}
                        isMonochrome={isMonochrome}
                        hidePlatformBadge={true}
                        emptyText={running ? `正在监听 ${c.name} 动态…` : `暂无 ${c.name} 动态`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col pt-3">
              <LiveActivityFeed items={feed} running={running} isMonochrome={isMonochrome} />
            </div>
          )}
        </div>

        {/* 右：当前岗位聚光卡 + 平台通道选择（撑满高度） */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* 当前岗位聚光卡 */}
          <div
            className={`rounded-2xl border backdrop-blur-xl p-4 ${
              isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
            }`}
          >
            <div className="flex items-center gap-2 pb-2.5 border-b border-white/8">
              <Search className={`size-3.5 ${running ? "text-emerald-300" : "text-stone-500"}`} />
              <h4 className="text-xs font-bold text-white">当前正在处理</h4>
              {running && spotlight && (
                <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 animate-pulse">
                  扫描中
                </span>
              )}
            </div>
            {spotlight ? (
              <div className="pt-3 space-y-2">
                <span
                  className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full border font-bold"
                  style={{
                    color: PLATFORM_META[spotlight.platform]?.color ?? "#00bebd",
                    borderColor: `${PLATFORM_META[spotlight.platform]?.color ?? "#00bebd"}55`,
                    backgroundColor: `${PLATFORM_META[spotlight.platform]?.color ?? "#00bebd"}14`,
                  }}
                >
                  {PLATFORM_META[spotlight.platform]?.name ?? spotlight.platform} 正在处理
                </span>
                <p className="text-sm font-bold text-white leading-5 line-clamp-2">{spotlight.title || "（岗位名解析中）"}</p>
                <div className="space-y-1.5 text-[11px] text-stone-400">
                  {spotlight.company && (
                    <p className="flex items-center gap-1.5">
                      <Banknote className="size-3 shrink-0" />
                      <span className="truncate">{spotlight.company}</span>
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{[spotlight.location, spotlight.salary].filter(Boolean).join(" · ") || "-"}</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="pt-3 text-[11px] text-stone-500 leading-relaxed">
                {running ? "正在启动浏览器、确认登录与页面筛选…" : "启动巡航后，这里会实时显示脚本正在筛选的岗位"}
              </p>
            )}
          </div>

          {/* 平台实时通道（多选勾选：勾上的平台在左侧时间轴并列直播），撑满右栏 */}
          <div
            className={`flex-1 min-h-0 flex flex-col rounded-2xl border backdrop-blur-xl p-4 ${
              isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
            }`}
          >
            <div className="flex items-center gap-2 pb-2.5 border-b border-white/8">
              <Radio className="size-3.5 text-amber-300" />
              <h4 className="text-xs font-bold text-white">平台实时通道</h4>
              <span className="ml-auto text-[9px] text-stone-500">点击卡片勾选/取消，勾选平台并列直播</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-3">
              {PLATFORM_CHANNELS.map((c) => {
                const meta = PLATFORM_META[c.id];
                const checked = channels.includes(c.id) && c.live;
                const p = perPlatform[c.id] ?? { scanned: 0, sent: 0, skipped: 0 };
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => c.live && toggleChannel(c.id)}
                    className={`relative px-3 py-2 rounded-xl border text-left transition-all ${
                      c.live ? "cursor-pointer" : "cursor-default opacity-60"
                    } ${
                      checked
                        ? "bg-white/[0.06]"
                        : "bg-white/[0.02] hover:bg-white/[0.04] border-white/8"
                    }`}
                    style={checked && meta ? { borderColor: `${meta.color}88`, boxShadow: `0 0 14px ${meta.color}22` } : undefined}
                    title={c.desc}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.live && (
                        <span
                          className={`grid place-items-center size-3.5 rounded border shrink-0 transition-colors ${
                            checked ? "border-transparent" : "border-white/25"
                          }`}
                          style={checked && meta ? { backgroundColor: meta.color } : undefined}
                        >
                          {checked && <Check className="size-2.5 text-stone-950" strokeWidth={4} />}
                        </span>
                      )}
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          c.live && running && p.scanned > 0
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"
                            : c.live
                              ? "bg-emerald-400/70"
                              : "bg-stone-600"
                        }`}
                      />
                      <span className="text-[11px] font-bold text-stone-100 truncate">{c.name}</span>
                      {!c.live && <span className="text-[8px] text-stone-500">预留</span>}
                    </div>
                    {c.live && (
                      <div className="mt-1 text-[9px] font-mono text-stone-500">
                        已投{" "}
                        <span style={{ color: meta?.color ?? "#00bebd" }} className="font-bold">
                          {p.sent}
                        </span>{" "}
                        / 限额 {limitOf(c.id)} · 扫{" "}
                        <span className="text-stone-300">{p.scanned}</span> · 跳 {p.skipped}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="pt-3 text-[10px] text-stone-500 leading-relaxed">
              三平台链路已打通：启动巡航时在「招聘平台中心」勾选要跑的平台（可多选），
              各平台的每个动作都会并列出现在左侧实时动态里。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
