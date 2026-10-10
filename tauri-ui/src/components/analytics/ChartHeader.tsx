import type { DayDeliveryRecord } from "../../lib/deliveryHistory";

interface ChartHeaderProps {
  range: "7d" | "14d" | "all";
  setRange: (r: "7d" | "14d" | "all") => void;
  filter: "all" | "boss" | "liepin" | "job51";
  setFilter: (f: "all" | "boss" | "liepin" | "job51") => void;
  series: readonly { key: string; color: string; id: "boss" | "liepin" | "job51"; name: string }[];
  isMonochrome: boolean;
}

export default function ChartHeader({
  range,
  setRange,
  filter,
  setFilter,
  series,
  isMonochrome,
}: ChartHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>各平台每日投递趋势折线图</span>
          <span className="text-[11px] font-normal text-stone-400">
            (BOSS直聘 · 猎聘 · 前程无忧)
          </span>
        </h3>
        <p className="text-xs text-stone-400 mt-0.5">多平台投递走势对比与实时动态曲线</p>
      </div>

      <div className="flex items-center gap-2">
        {/* 时间范围切换 */}
        <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
          {(["7d", "14d", "all"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                range === r
                  ? isMonochrome
                    ? "bg-white text-black font-bold shadow-sm"
                    : "bg-amber-500 text-stone-950 font-bold shadow-sm"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              {r === "7d" ? "近 7 天" : r === "14d" ? "近 14 天" : "全部"}
            </button>
          ))}
        </div>

        {/* 平台图例/切换按钮（清晰色彩识别） */}
        <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              filter === "all"
                ? isMonochrome
                  ? "bg-white text-black font-bold shadow-sm"
                  : "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40"
                : "text-stone-400 hover:text-white"
            }`}
          >
            全部
          </button>
          {series.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilter(s.id)}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                filter === s.id
                  ? "bg-white/20 font-bold shadow-sm"
                  : "text-stone-400 hover:text-white"
              }`}
              style={{ color: filter === s.id ? s.color : undefined }}
            >
              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span>{s.id === "boss" ? "BOSS" : s.id === "liepin" ? "猎聘" : "51job"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
