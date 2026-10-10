import { useState, useMemo } from "react";
import type { DayDeliveryRecord } from "../../lib/deliveryHistory";

interface PlatformTrendChartProps {
  records: DayDeliveryRecord[];
  isMonochrome: boolean;
}

type PlatformFilter = "all" | "boss" | "liepin" | "job51";

export default function PlatformTrendChart({ records, isMonochrome }: PlatformTrendChartProps) {
  const [filter, setFilter] = useState<PlatformFilter>("all");
  const [range, setRange] = useState<"7d" | "14d">("14d");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // 经典黑金 vs 黑白高级感 专属色盘
  const seriesConfig = useMemo(() => {
    if (isMonochrome) {
      return [
        { key: "bossSent" as const, color: "#e4e4e7", id: "boss" as const, name: "BOSS" },
        { key: "liepinSent" as const, color: "#a1a1aa", id: "liepin" as const, name: "猎聘" },
        { key: "job51Sent" as const, color: "#71717a", id: "job51" as const, name: "51job" },
      ];
    }
    return [
      { key: "bossSent" as const, color: "#00bebd", id: "boss" as const, name: "BOSS" },
      { key: "liepinSent" as const, color: "#ff7033", id: "liepin" as const, name: "猎聘" },
      { key: "job51Sent" as const, color: "#ff5000", id: "job51" as const, name: "51job" },
    ];
  }, [isMonochrome]);

  const filteredData = useMemo(() => records.slice(range === "7d" ? -7 : -14), [records, range]);

  const maxY = useMemo(() => {
    let max = 10;
    filteredData.forEach((d) => {
      if (filter === "all") max = Math.max(max, d.totalSent);
      else if (filter === "boss") max = Math.max(max, d.bossSent);
      else if (filter === "liepin") max = Math.max(max, d.liepinSent);
      else if (filter === "job51") max = Math.max(max, d.job51Sent);
    });
    return Math.ceil(max * 1.15);
  }, [filteredData, filter]);

  const width = 800;
  const height = 230;
  const [padL, padR, padT, padB] = [40, 20, 20, 28];
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const pointsFor = (key: "bossSent" | "liepinSent" | "job51Sent" | "totalSent") => {
    if (!filteredData.length) return [];
    const step = chartW / Math.max(1, filteredData.length - 1);
    return filteredData.map((d, i) => ({
      x: padL + i * step,
      y: padT + chartH - (d[key] / maxY) * chartH,
      val: d[key],
    }));
  };

  const makeSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      d += ` C ${cx} ${pts[i].y}, ${cx} ${pts[i + 1].y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
    }
    return d;
  };

  const makeAreaPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    return `${makeSmoothPath(pts)} L ${pts[pts.length - 1].x} ${padT + chartH} L ${pts[0].x} ${padT + chartH} Z`;
  };

  const activeRecord = hoverIndex !== null ? filteredData[hoverIndex] : filteredData[filteredData.length - 1];

  return (
    <div
      className={`p-5 rounded-2xl border backdrop-blur-xl space-y-4 ${
        isMonochrome ? "bg-zinc-950/70 border-white/10" : "bg-stone-900/40 border-amber-500/15"
      }`}
    >
      {/* 头部筛选器与统计概览 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>各平台历史投递走势折线图</span>
            <span className={`text-[11px] font-normal ${isMonochrome ? "text-zinc-400" : "text-amber-400/80"}`}>
              (BOSS直聘 · 猎聘 · 前程无忧)
            </span>
          </h3>
          <p className="text-xs text-stone-400 mt-0.5">每日投递走势与平台占比统计</p>
        </div>

        <div className="flex items-center gap-2">
          {/* 时间范围切换 */}
          <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
            {(["7d", "14d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  range === r
                    ? isMonochrome
                      ? "bg-white text-black font-bold shadow-sm"
                      : "bg-amber-500 text-stone-950 font-bold shadow-sm"
                    : "text-stone-400 hover:text-white"
                }`}
              >
                {r === "7d" ? "近 7 天" : "近 14 天"}
              </button>
            ))}
          </div>

          {/* 平台图例/切换按钮 */}
          <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                filter === "all"
                  ? isMonochrome
                    ? "bg-white text-black font-bold shadow-sm"
                    : "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              全部
            </button>
            {seriesConfig.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setFilter(s.id)}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  filter === s.id
                    ? isMonochrome
                      ? "bg-white/20 text-white font-bold"
                      : "bg-white/15 text-white font-bold"
                    : "text-stone-400 hover:text-white"
                }`}
                style={{ color: filter === s.id ? s.color : undefined }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG 折线图 */}
      <div className="relative w-full aspect-[800/230] select-none">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" onMouseLeave={() => setHoverIndex(null)}>
          <defs>
            {seriesConfig.map((s) => (
              <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={isMonochrome ? 0.25 : 0.3} />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
            <linearGradient id="grad-total-line" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isMonochrome ? "#ffffff" : "#f59e0b"} stopOpacity={isMonochrome ? 0.2 : 0.25} />
              <stop offset="100%" stopColor={isMonochrome ? "#ffffff" : "#f59e0b"} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* 网格参考线 */}
          {[0, 0.33, 0.66, 1].map((r) => {
            const y = padT + chartH * (1 - r);
            return (
              <g key={r}>
                <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="monospace">
                  {Math.round(maxY * r)}
                </text>
              </g>
            );
          })}

          {/* 各平台曲线 */}
          {seriesConfig.map((s) => {
            if (filter !== "all" && filter !== s.id) return null;
            const pts = pointsFor(s.key);
            return (
              <g key={s.id}>
                <path d={makeAreaPath(pts)} fill={`url(#grad-${s.id})`} />
                <path d={makeSmoothPath(pts)} fill="none" stroke={s.color} strokeWidth={filter === s.id ? "3" : "2"} />
              </g>
            );
          })}

          {/* 综合总计折线 */}
          {filter === "all" && (
            <>
              <path d={makeAreaPath(pointsFor("totalSent"))} fill="url(#grad-total-line)" />
              <path
                d={makeSmoothPath(pointsFor("totalSent"))}
                fill="none"
                stroke={isMonochrome ? "#ffffff" : "#f59e0b"}
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            </>
          )}

          {/* X 轴日期 */}
          {filteredData.map((d, i) => {
            const step = chartW / Math.max(1, filteredData.length - 1);
            return (
              <text key={d.date} x={padL + i * step} y={height - 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
                {d.label}
              </text>
            );
          })}

          {/* 交互热区 */}
          {filteredData.map((d, i) => {
            const step = chartW / Math.max(1, filteredData.length - 1);
            const x = padL + i * step;
            return (
              <g key={`hit-${d.date}`}>
                <rect x={x - step / 2} y={padT} width={step} height={chartH} fill="transparent" className="cursor-pointer" onMouseEnter={() => setHoverIndex(i)} />
                {hoverIndex === i && (
                  <>
                    <line
                      x1={x}
                      y1={padT}
                      x2={x}
                      y2={padT + chartH}
                      stroke={isMonochrome ? "rgba(255,255,255,0.6)" : "rgba(245,158,11,0.6)"}
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={x}
                      cy={padT + chartH - (d.totalSent / maxY) * chartH}
                      r="4.5"
                      fill={isMonochrome ? "#ffffff" : "#f59e0b"}
                      stroke="#000"
                      strokeWidth="1.5"
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {activeRecord && (
          <div className="absolute top-2 right-3 bg-stone-950/90 border border-white/15 px-3 py-1.5 rounded-xl text-xs backdrop-blur-md flex items-center gap-3 shadow-lg pointer-events-none">
            <span className={`font-mono font-bold ${isMonochrome ? "text-white" : "text-amber-400"}`}>
              {activeRecord.date}
            </span>
            <span style={{ color: seriesConfig[0].color }}>BOSS: {activeRecord.bossSent}</span>
            <span style={{ color: seriesConfig[1].color }}>猎聘: {activeRecord.liepinSent}</span>
            <span style={{ color: seriesConfig[2].color }}>51job: {activeRecord.job51Sent}</span>
            <span className="text-white font-bold pl-1 border-l border-white/20">总计: {activeRecord.totalSent}</span>
          </div>
        )}
      </div>
    </div>
  );
}
