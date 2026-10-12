import { useEffect, useMemo, useState } from "react";
import { Activity, MapPin, Banknote, Rocket, Square, Radio, Compass, Clock3, Search } from "lucide-react";
import { useRunStore } from "../../store";
import { summarizeEvents } from "../../lib/dashboardHelpers";
import { buildLiveFeed, currentProcessingJob } from "../../lib/liveFeed";
import { AnimatedNumber } from "../core/animated-number";
import LiveActivityFeed from "./LiveActivityFeed";

interface LiveCruiseViewProps {
  onStartRun: () => void;
  onStopRun: () => Promise<void>;
  busy?: boolean;
  /** 每日投递上限（进度条口径，来自画像表单） */
  dailyLimit: string;
}

/** 四平台实时通道：BOSS 已打通，其余三个预留（用户 2026-10-12 拍板：必须留位）。 */
const PLATFORM_CHANNELS = [
  { id: "boss", name: "BOSS 直聘", live: true, desc: "点击「立即沟通」链路已打通，实时动态如下" },
  { id: "liepin", name: "猎聘", live: false, desc: "「聊一聊 + 固定招呼语」链路即将接入——接入后这里将实时展示每个岗位的沟通动态" },
  { id: "job51", name: "前程无忧", live: false, desc: "「一键投递简历」链路即将接入——接入后这里将实时展示每个岗位的投递动态" },
  { id: "zhaopin", name: "智联招聘", live: false, desc: "平台适配筹备中——上线后与其他平台共享同一块实时动态时间轴" },
] as const;

/** 运行时长格式化：秒级跳动（mm:ss / hh:mm:ss）。 */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function LiveCruiseView({ onStartRun, onStopRun, busy = false, dailyLimit }: LiveCruiseViewProps) {
  const running = useRunStore((s) => s.running);
  const events = useRunStore((s) => s.events);
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");
  const cruiseStartedAt = useRunStore((s) => s.cruiseStartedAt);
  const [channel, setChannel] = useState<(typeof PLATFORM_CHANNELS)[number]["id"]>("boss");
  const [, forceTick] = useState(0);

  // 运行中每秒跳动（时长计时器）
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const feed = useMemo(() => buildLiveFeed(events), [events]);
  const spotlight = useMemo(() => currentProcessingJob(events), [events]);
  const stats = useMemo(() => summarizeEvents(events), [events]);
  const limitNum = Number(dailyLimit) || 80;
  const elapsed = cruiseStartedAt ? Date.now() - cruiseStartedAt : null;
  const activeChannel = PLATFORM_CHANNELS.find((c) => c.id === channel)!;

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-10 animate-in fade-in duration-200">
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
          {/* 本轮进度：已投 X / 上限 */}
          <div className="hidden md:flex flex-col items-end mr-1">
            <span className="text-[10px] text-stone-500">本轮已投 / 上限</span>
            <span className="font-mono text-sm font-bold text-white">
              {stats.sent}
              <span className="text-stone-500 font-normal"> / {limitNum}</span>
            </span>
          </div>
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

      {/* ===== 跳动计数带：扫描 / 已投递 / 跳过（数字实时跳动） ===== */}
      <div className="grid grid-cols-3 gap-3">
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

      {/* ===== 主体：左活动流时间轴 + 右聚光卡与平台通道 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* 左：实时活动流（feed 通道即 BOSS——当前唯一打通的平台） */}
        <div
          className={`flex flex-col rounded-2xl border backdrop-blur-xl p-4 min-h-[420px] max-h-[62vh] ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Activity className={`size-4 ${running ? "text-emerald-300" : "text-stone-500"}`} />
              <h3 className="text-sm font-bold text-white">实时动态</h3>
              {running && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono animate-pulse">
                  STREAMING
                </span>
              )}
            </div>
            <span className="text-[10px] text-stone-500">滚动查看历史 · 新动态自动置顶</span>
          </div>
          <LiveActivityFeed items={feed} running={running} isMonochrome={isMonochrome} />
        </div>

        {/* 右：当前岗位聚光卡 + 平台通道选择 */}
        <div className="space-y-4">
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

          {/* 平台通道（四平台 Tab：BOSS 实时 + 三平台预留） */}
          <div
            className={`rounded-2xl border backdrop-blur-xl p-4 ${
              isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
            }`}
          >
            <div className="flex items-center gap-2 pb-2.5 border-b border-white/8">
              <Radio className="size-3.5 text-amber-300" />
              <h4 className="text-xs font-bold text-white">平台实时通道</h4>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-3">
              {PLATFORM_CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                    channel === c.id
                      ? "border-amber-500/50 bg-amber-500/10"
                      : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                  } ${c.live ? "" : "opacity-70"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`size-1.5 rounded-full ${
                        c.live ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-stone-600"
                      }`}
                    />
                    <span className="text-[11px] font-bold text-stone-100">{c.name}</span>
                    {!c.live && <span className="text-[8px] text-stone-500">预留</span>}
                  </div>
                </button>
              ))}
            </div>
            <p className="pt-3 text-[10px] text-stone-500 leading-relaxed">{activeChannel.desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
