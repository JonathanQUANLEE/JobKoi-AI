import { useState, useMemo } from "react";
import { TrendingUp, MessageSquare, Award, Calendar, Play, Download, RotateCcw } from "lucide-react";
import { deliveryHistoryDb, type DayDeliveryRecord, type MorningBrief } from "../../lib/deliveryHistory";
import { useRunStore } from "../../store";
import { AnimatedNumber } from "../core/animated-number";
import PlatformTrendChart from "./PlatformTrendChart";
import MorningBriefCard from "./MorningBriefCard";

interface DeliveryAnalyticsViewProps {
  onStartCruise?: () => void;
}

export default function DeliveryAnalyticsView({ onStartCruise }: DeliveryAnalyticsViewProps) {
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");
  const [records, setRecords] = useState<DayDeliveryRecord[]>(() => deliveryHistoryDb.getRecords());
  const [brief, setBrief] = useState<MorningBrief>(() => deliveryHistoryDb.getMorningBrief());

  // 计算全局历史累计指标
  const totals = useMemo(() => {
    let sentSum = 0;
    let replySum = 0;
    records.forEach((r) => {
      sentSum += r.totalSent;
      replySum += r.totalReplies;
    });
    const avgRate = sentSum > 0 ? Number(((replySum / sentSum) * 100).toFixed(1)) : 0;
    return {
      sentSum,
      replySum,
      avgRate,
      activeDays: records.length,
    };
  }, [records]);

  const handleRefresh = () => {
    const updatedRecords = deliveryHistoryDb.getRecords();
    setRecords(updatedRecords);
    setBrief(deliveryHistoryDb.getMorningBrief());
  };

  const handleToggleCleanData = () => {
    if (totals.sentSum > 0) {
      const empty = deliveryHistoryDb.resetToZero();
      setRecords(empty);
      setBrief(deliveryHistoryDb.getMorningBrief());
    } else {
      const demo = deliveryHistoryDb.restoreDemoData();
      setRecords(demo);
      setBrief(deliveryHistoryDb.getMorningBrief());
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
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
            <AnimatedNumber
              value={totals.replySum}
              className={`text-2xl font-black font-mono ${isMonochrome ? "text-white" : "text-emerald-400"}`}
            />
            <span className={`text-xs ${isMonochrome ? "text-zinc-400" : "text-emerald-500/80"}`}>人次</span>
          </div>
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
            <AnimatedNumber
              value={totals.avgRate}
              decimalPlaces={1}
              className={`text-2xl font-black font-mono ${isMonochrome ? "text-white" : "text-purple-300"}`}
            />
            <span className={`text-sm font-bold ${isMonochrome ? "text-zinc-400" : "text-purple-300"}`}>%</span>
          </div>
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
          <span>数据 100% 留存在本地设备 · 每次巡航将实时累加</span>
          <button
            type="button"
            onClick={handleToggleCleanData}
            className="text-[11px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-stone-300 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RotateCcw className="size-3" />
            <span>{totals.sentSum > 0 ? "重置为 0 开始统计" : "载入参考示例数据"}</span>
          </button>
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
