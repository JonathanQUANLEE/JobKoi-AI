import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { TrendingUp, MessageSquare, Award, Calendar, Play, Download, RotateCcw, Database, FlaskConical, RefreshCw, Inbox } from "lucide-react";
import {
  deliveryHistoryDb,
  buildRealMorningBrief,
  type DayDeliveryRecord,
  type MorningBrief,
} from "../../lib/deliveryHistory";
import { ipc, type DeliveryDailyStatsResult } from "../../lib/ipc";
import { useRunStore } from "../../store";
import { AnimatedNumber } from "../core/animated-number";
import PlatformTrendChart from "./PlatformTrendChart";
import MorningBriefCard from "./MorningBriefCard";

interface DeliveryAnalyticsViewProps {
  onStartCruise?: () => void;
}

type StatsMode = "demo" | "real";

const MODE_STORAGE_KEY = "jobhunter_stats_mode";

function loadInitialMode(): StatsMode {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "real") return "real";
  } catch {}
  return "demo";
}

export default function DeliveryAnalyticsView({ onStartCruise }: DeliveryAnalyticsViewProps) {
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");
  const running = useRunStore((s) => s.running);

  const [mode, setMode] = useState<StatsMode>(loadInitialMode);
  const [demoRecords, setDemoRecords] = useState<DayDeliveryRecord[]>(() => deliveryHistoryDb.getRecords());
  const [demoBrief, setDemoBrief] = useState<MorningBrief>(() => deliveryHistoryDb.getMorningBrief());
  const [realStats, setRealStats] = useState<DeliveryDailyStatsResult | null>(null);
  const [realLoading, setRealLoading] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);

  const fetchRealStats = useCallback(async () => {
    setRealLoading(true);
    setRealError(null);
    try {
      const stats = await ipc.getDeliveryDailyStats(30);
      setRealStats(stats);
    } catch (err) {
      setRealError(String(err));
    } finally {
      setRealLoading(false);
    }
  }, []);

  // 真实模式：进入页面即拉取 + 巡航结束（running true→false）自动刷新，保证数据实时
  useEffect(() => {
    if (mode === "real") fetchRealStats();
  }, [mode, fetchRealStats]);
  const prevRunningRef = useRef(running);
  useEffect(() => {
    if (mode === "real" && prevRunningRef.current && !running) fetchRealStats();
    prevRunningRef.current = running;
  }, [running, mode, fetchRealStats]);

  const switchToReal = useCallback(async () => {
    setMode("real");
    try {
      localStorage.setItem(MODE_STORAGE_KEY, "real");
    } catch {}
  }, []);

  const switchToDemo = useCallback(() => {
    setMode("demo");
    setDemoRecords(deliveryHistoryDb.getRecords());
    setDemoBrief(deliveryHistoryDb.getMorningBrief());
    try {
      localStorage.setItem(MODE_STORAGE_KEY, "demo");
    } catch {}
  }, []);

  // 真实数据映射成折线图/早报需要的形状（回复字段补 0：真实模式不展示回复）
  const realRecords: DayDeliveryRecord[] = useMemo(
    () =>
      (realStats?.days || []).map((d) => ({
        date: d.date,
        label: d.label,
        weekday: d.weekday,
        bossSent: d.bossSent,
        liepinSent: d.liepinSent,
        job51Sent: d.job51Sent,
        totalSent: d.totalSent,
        bossReplies: 0,
        liepinReplies: 0,
        job51Replies: 0,
        totalReplies: 0,
      })),
    [realStats],
  );
  const realBrief = useMemo(() => buildRealMorningBrief(realStats?.days || []), [realStats]);

  const isReal = mode === "real";
  const records = isReal ? realRecords : demoRecords;
  const brief = isReal ? realBrief : demoBrief;
  const hasReplyData = isReal ? false : true;

  // 计算全局历史累计指标
  const totals = useMemo(() => {
    if (isReal && realStats) {
      return {
        sentSum: realStats.totals.sentSum,
        replySum: 0,
        avgRate: 0,
        activeDays: realStats.totals.activeDays,
      };
    }
    let sentSum = 0;
    let replySum = 0;
    records.forEach((r) => {
      sentSum += r.totalSent;
      replySum += r.totalReplies;
    });
    const avgRate = sentSum > 0 ? Number(((replySum / sentSum) * 100).toFixed(1)) : 0;
    return { sentSum, replySum, avgRate, activeDays: records.length };
  }, [records, isReal, realStats]);

  const handleRefresh = () => {
    if (isReal) {
      fetchRealStats();
    } else {
      setDemoRecords(deliveryHistoryDb.getRecords());
      setDemoBrief(deliveryHistoryDb.getMorningBrief());
    }
  };

  const handleToggleCleanData = () => {
    if (isReal) return; // 真实模式无演示数据操作
    if (totals.sentSum > 0) {
      const empty = deliveryHistoryDb.resetToZero();
      setDemoRecords(empty);
      setDemoBrief(deliveryHistoryDb.getMorningBrief());
    } else {
      const demo = deliveryHistoryDb.restoreDemoData();
      setDemoRecords(demo);
      setDemoBrief(deliveryHistoryDb.getMorningBrief());
    }
  };

  const handleExportCsv = () => {
    const header = "日期,BOSS直聘投递,猎聘投递,前程无忧投递,总投递,BOSS回复,猎聘回复,51job回复,总回复\n";
    const rows = records
      .map(
        (r) =>
          `${r.date},${r.bossSent},${r.liepinSent},${r.job51Sent},${r.totalSent},${r.bossReplies},${r.liepinReplies},${r.job51Replies},${r.totalReplies}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `jobhunter_delivery_stats_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ---------- 真实模式空态：从未投递过 ----------
  if (isReal && realStats && realStats.totals.sentSum === 0 && !realLoading) {
    return (
      <div className="max-w-3xl mx-auto pb-12 animate-in fade-in duration-200">
        <div
          className={`p-10 rounded-2xl border backdrop-blur-xl text-center space-y-5 ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div
            className={`mx-auto size-16 rounded-2xl flex items-center justify-center border ${
              isMonochrome ? "bg-white/5 border-white/15" : "bg-amber-500/10 border-amber-500/25"
            }`}
          >
            <Inbox className={`size-7 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white">您还未有投递记录</h3>
            <p className="text-sm text-stone-400 leading-relaxed">
              完成第一次自动巡航后，这里将实时展示您的真实投递数据——
              <br />
              每日投递趋势、平台分布与投递早报，数据 100% 来自本地投递账本。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {onStartCruise && (
              <button
                type="button"
                onClick={onStartCruise}
                className={`px-5 py-2.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 shadow-md ${
                  isMonochrome
                    ? "bg-white hover:bg-zinc-200 text-black shadow-white/10"
                    : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-500/20"
                }`}
              >
                <Play className="size-4 fill-current" />
                <span className="text-sm">启动今日巡航</span>
              </button>
            )}
            <button
              type="button"
              onClick={switchToDemo}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 text-sm transition-colors cursor-pointer flex items-center gap-1.5 border border-white/10"
            >
              <FlaskConical className="size-4" />
              <span>查看演示数据</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* 数据源提醒条：演示模式（琥珀，提示可更新）/ 真实模式（绿色，确认数据来源） */}
      {isReal ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <div className="flex items-center gap-2.5 text-xs text-emerald-300 min-w-0">
            <Database className="size-4 shrink-0 text-emerald-400" />
            <span className="min-w-0">
              正在展示你的<strong className="text-emerald-200"> 真实投递数据 </strong>
              （来自本地投递账本{realStats ? ` · 累计 ${realStats.totals.sentSum} 份 / ${realStats.totals.activeDays} 天` : ""}）
              {realLoading && <span className="text-emerald-400/70"> · 正在刷新…</span>}
              {realError && <span className="text-red-400"> · 加载失败：{realError}</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchRealStats}
              disabled={realLoading}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-emerald-300 text-xs transition-colors cursor-pointer flex items-center gap-1.5 border border-emerald-500/25 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${realLoading ? "animate-spin" : ""}`} />
              <span>刷新数据</span>
            </button>
            <button
              type="button"
              onClick={switchToDemo}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-400 text-xs transition-colors cursor-pointer border border-white/10"
            >
              返回演示预览
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-amber-500/40 bg-amber-500/10">
          <div className="flex items-center gap-2.5 text-xs text-amber-200 min-w-0">
            <FlaskConical className="size-4 shrink-0 text-amber-400" />
            <span>
              当前展示的是<strong className="text-amber-100"> 演示数据 </strong>
              （模拟的示例记录，仅用于预览界面效果）
            </span>
          </div>
          <button
            type="button"
            onClick={switchToReal}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-500/20 shrink-0"
          >
            <Database className="size-3.5" />
            <span>更新为我的真实投递数据</span>
          </button>
        </div>
      )}

      {/* 顶部全局 KPI 卡片带 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
          className={`p-4 rounded-2xl border backdrop-blur-xl ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between text-stone-400 text-xs mb-1">
            <span>自使用以来累计投递</span>
            <TrendingUp className={`size-4 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <AnimatedNumber
              value={totals.sentSum}
              className="text-2xl font-black text-white font-mono"
            />
            <span className="text-xs text-stone-500">家企业</span>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border backdrop-blur-xl ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between text-stone-400 text-xs mb-1">
            <span>收到 HR 回复总数</span>
            <MessageSquare className={`size-4 ${isMonochrome ? "text-zinc-300" : "text-emerald-400"}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            {hasReplyData ? (
              <>
                <AnimatedNumber
                  value={totals.replySum}
                  className={`text-2xl font-black font-mono ${isMonochrome ? "text-white" : "text-emerald-400"}`}
                />
                <span className={`text-xs ${isMonochrome ? "text-zinc-400" : "text-emerald-500/80"}`}>人次</span>
              </>
            ) : (
              <span className="text-2xl font-black font-mono text-stone-500">—</span>
            )}
          </div>
          {!hasReplyData && <p className="text-[10px] text-stone-500 mt-0.5">回复统计 · 建设中</p>}
        </div>

        <div
          className={`p-4 rounded-2xl border backdrop-blur-xl ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between text-stone-400 text-xs mb-1">
            <span>历史综合平均回复率</span>
            <Award className={`size-4 ${isMonochrome ? "text-zinc-300" : "text-purple-400"}`} />
          </div>
          <div className="flex items-baseline gap-1">
            {hasReplyData ? (
              <>
                <AnimatedNumber
                  value={totals.avgRate}
                  decimalPlaces={1}
                  className={`text-2xl font-black font-mono ${isMonochrome ? "text-white" : "text-purple-300"}`}
                />
                <span className={`text-sm font-bold ${isMonochrome ? "text-zinc-400" : "text-purple-300"}`}>%</span>
              </>
            ) : (
              <span className="text-2xl font-black font-mono text-stone-500">—</span>
            )}
          </div>
          {!hasReplyData && <p className="text-[10px] text-stone-500 mt-0.5">回复统计 · 建设中</p>}
        </div>

        <div
          className={`p-4 rounded-2xl border backdrop-blur-xl ${
            isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between text-stone-400 text-xs mb-1">
            <span>持续自动巡航天数</span>
            <Calendar className={`size-4 ${isMonochrome ? "text-zinc-300" : "text-blue-400"}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <AnimatedNumber
              value={totals.activeDays}
              className="text-2xl font-black text-white font-mono"
            />
            <span className="text-xs text-stone-500">天</span>
          </div>
        </div>
      </div>

      {/* 模块 1: 投递早报功能 (包含昨日回复情况与回复率) */}
      <MorningBriefCard
        brief={brief}
        isMonochrome={isMonochrome}
        onRefreshBrief={handleRefresh}
        onStartCruise={onStartCruise}
      />

      {/* 模块 2: 历史投递折线图 (针对支持的三个平台分别统计展示) */}
      <PlatformTrendChart records={records} isMonochrome={isMonochrome} />

      {/* 底部操作与导出栏 */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border text-xs text-stone-400 ${
          isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/30 border-white/5"
        }`}
      >
        <div className="flex items-center gap-2">
          {isReal ? (
            <span>数据 100% 来自本地投递账本 · 巡航结束后自动更新</span>
          ) : (
            <>
              <span>数据 100% 留存在本地设备 · 每次巡航将实时累加</span>
              <button
                type="button"
                onClick={handleToggleCleanData}
                className="text-[11px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-stone-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="size-3" />
                <span>{totals.sentSum > 0 ? "重置为 0 开始统计" : "载入参考示例数据"}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 transition-colors cursor-pointer flex items-center gap-1.5 border border-white/10"
          >
            <Download className="size-3.5" />
            <span>导出 CSV 统计报表</span>
          </button>
          {onStartCruise && (
            <button
              type="button"
              onClick={onStartCruise}
              className={`px-4 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md ${
                isMonochrome
                  ? "bg-white hover:bg-zinc-200 text-black shadow-white/10"
                  : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-500/20"
              }`}
            >
              <Play className="size-3.5 fill-current" />
              <span>启动今日巡航</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
