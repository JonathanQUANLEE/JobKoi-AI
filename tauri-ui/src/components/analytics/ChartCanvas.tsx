import type { DayDeliveryRecord } from "../../lib/deliveryHistory";

export interface SeriesItem {
  readonly key: "bossSent" | "liepieSent" | "job51Sent" | "bossSent" | "liepinSent";
  readonly color: string;
  readonly id: "boss" | "liepin" | "job51";
  readonly name: string;
  readonly delay: number;
}

interface ChartCanvasProps {
  filteredData: DayDeliveryRecord[];
  filter: "all" | "boss" | "liepin" | "job51";
  range: "7d" | "14d" | "all";
  series: readonly SeriesItem[];
  hoverIndex: number | null;
  setHoverIndex: (idx: number | null) => void;
  maxY: number;
  shouldReduceMotion: boolean | null;
  /** 点击某天的热区（早报历史回看联动）。 */
  onDayClick?: (date: string) => void;
}

const WIDTH = 800;
const HEIGHT = 230;
const PAD_L = 40;
const PAD_R = 20;
const PAD_T = 20;
const PAD_B = 28;
const CHART_W = WIDTH - PAD_L - PAD_R;
const CHART_H = HEIGHT - PAD_T - PAD_B;

export default function ChartCanvas({
  filteredData,
  filter,
  range,
  series,
  hoverIndex,
  setHoverIndex,
  maxY,
  shouldReduceMotion,
  onDayClick,
}: ChartCanvasProps) {
  const pointsFor = (key: "bossSent" | "liepinSent" | "job51Sent" | "totalSent") => {
    if (!filteredData.length) return [];
    const step = CHART_W / Math.max(1, filteredData.length - 1);
    return filteredData.map((d, i) => ({
      x: PAD_L + i * step,
      y: PAD_T + CHART_H - (d[key] / maxY) * CHART_H,
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
    return `${makeSmoothPath(pts)} L ${pts[pts.length - 1].x} ${PAD_T + CHART_H} L ${pts[0].x} ${PAD_T + CHART_H} Z`;
  };

  const totalPoints = pointsFor("totalSent");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full" onMouseLeave={() => setHoverIndex(null)}>
      <defs>
        {series.map((s) => (
          <linearGradient key={s.id} id={`trend-grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
          </linearGradient>
        ))}
        <linearGradient id="trend-grad-total" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
        </linearGradient>

        <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 背景水平网格线与纵轴刻度 */}
      {[0, 0.33, 0.66, 1].map((r) => {
        const y = PAD_T + CHART_H * (1 - r);
        return (
          <g key={r}>
            <line x1={PAD_L} y1={y} x2={WIDTH - PAD_R} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <text x={PAD_L - 6} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="monospace">
              {Math.round(maxY * r)}
            </text>
          </g>
        );
      })}

      {/* 1. 面积填充层（从左至右或平滑淡入） */}
      {series.map((s) => {
        if (filter !== "all" && filter !== s.id) return null;
        const pts = pointsFor(s.key as "bossSent" | "liepinSent" | "job51Sent");
        return (
          <path
            key={`area-${s.id}-${range}`}
            d={makeAreaPath(pts)}
            fill={`url(#trend-grad-${s.id})`}
            className={shouldReduceMotion ? "" : "trend-area-fade"}
            style={{ animationDelay: shouldReduceMotion ? "0s" : `${s.delay + 0.15}s` }}
          />
        );
      })}

      {filter === "all" && (
        <path
          key={`area-total-${range}`}
          d={makeAreaPath(totalPoints)}
          fill="url(#trend-grad-total)"
          className={shouldReduceMotion ? "" : "trend-area-fade"}
          style={{ animationDelay: shouldReduceMotion ? "0s" : "0.35s" }}
        />
      )}

      {/* 2. 各平台曲线（首次自左向右依次绘制 + 柔和光晕） */}
      {series.map((s) => {
        if (filter !== "all" && filter !== s.id) return null;
        const pts = pointsFor(s.key as "bossSent" | "liepinSent" | "job51Sent");
        const linePath = makeSmoothPath(pts);
        const lastPt = pts[pts.length - 1];

        return (
          <g key={`line-group-${s.id}-${range}`}>
            <path
              d={linePath}
              fill="none"
              stroke={s.color}
              strokeWidth={filter === s.id ? "3" : "2"}
              filter="url(#soft-glow)"
              className={shouldReduceMotion ? "" : "trend-draw-line"}
              style={{ animationDelay: shouldReduceMotion ? "0s" : `${s.delay}s` }}
            />

            {/* 最新数据点呼吸式高亮光晕 */}
            {lastPt && (
              <g key={`halo-${s.id}`}>
                <circle cx={lastPt.x} cy={lastPt.y} fill={s.color} className="breathing-halo-circle" />
                <circle cx={lastPt.x} cy={lastPt.y} r="3.5" fill={s.color} stroke="#09090b" strokeWidth="1.5" />
              </g>
            )}
          </g>
        );
      })}

      {/* 3. 综合总览曲线（黄色缓慢流动虚线） */}
      {filter === "all" && totalPoints.length > 0 && (
        <g key={`total-line-${range}`}>
          <path
            d={makeSmoothPath(totalPoints)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            className="trend-flowing-dash"
            filter="url(#soft-glow)"
          />
          <circle
            cx={totalPoints[totalPoints.length - 1].x}
            cy={totalPoints[totalPoints.length - 1].y}
            className="breathing-halo-circle"
            fill="#f59e0b"
          />
          <circle
            cx={totalPoints[totalPoints.length - 1].x}
            cy={totalPoints[totalPoints.length - 1].y}
            r="4"
            fill="#f59e0b"
            stroke="#09090b"
            strokeWidth="1.5"
          />
        </g>
      )}

      {/* X 轴日期刻度 */}
      {filteredData.map((d, i) => {
        const step = CHART_W / Math.max(1, filteredData.length - 1);
        return (
          <text key={d.date} x={PAD_L + i * step} y={HEIGHT - 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
            {d.label}
          </text>
        );
      })}

      {/* 鼠标悬停十字准星线与同轴高亮圆点 */}
      {hoverIndex !== null && (
        <g key="crosshair">
          {(() => {
            const step = CHART_W / Math.max(1, filteredData.length - 1);
            const x = PAD_L + hoverIndex * step;
            return (
              <>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + CHART_H} stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="2 2" />
                {series.map((s) => {
                  if (filter !== "all" && filter !== s.id) return null;
                  const key = s.key as "bossSent" | "liepinSent" | "job51Sent";
                  const y = PAD_T + CHART_H - (filteredData[hoverIndex][key] / maxY) * CHART_H;
                  return <circle key={s.id} cx={x} cy={y} r="4" fill={s.color} stroke="#000" strokeWidth="1.5" />;
                })}
              </>
            );
          })()}
        </g>
      )}

      {/* 交互命中热区：悬停看 tooltip，点击回看那天的早报 */}
      {filteredData.map((d, i) => {
        const step = CHART_W / Math.max(1, filteredData.length - 1);
        const x = PAD_L + i * step;
        return (
          <rect
            key={`hit-${d.date}`}
            x={x - step / 2}
            y={PAD_T}
            width={step}
            height={CHART_H}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHoverIndex(i)}
            onClick={() => onDayClick?.(d.date)}
          />
        );
      })}
    </svg>
  );
}
