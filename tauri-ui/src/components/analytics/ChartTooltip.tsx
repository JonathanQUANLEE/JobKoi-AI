import type { DayDeliveryRecord } from "../../lib/deliveryHistory";

interface ChartTooltipProps {
  record: DayDeliveryRecord | null;
  series: readonly { key: string; color: string; id: "boss" | "liepin" | "job51"; name: string }[];
}

export default function ChartTooltip({ record, series }: ChartTooltipProps) {
  if (!record) return null;

  return (
    <div className="absolute top-2 right-3 bg-stone-950/95 border border-white/20 px-3.5 py-2 rounded-xl text-xs backdrop-blur-md flex items-center gap-3.5 shadow-2xl pointer-events-none z-10 animate-in fade-in duration-100">
      <span className="font-mono font-bold text-white border-r border-white/15 pr-2.5">
        {record.date} ({record.weekday})
      </span>
      <span className="flex items-center gap-1 text-[#00bebd] font-medium">
        <span className="size-1.5 rounded-full bg-[#00bebd]" />
        BOSS: <strong className="font-mono text-white">{record.bossSent}</strong>
      </span>
      <span className="flex items-center gap-1 text-[#ff7033] font-medium">
        <span className="size-1.5 rounded-full bg-[#ff7033]" />
        猎聘: <strong className="font-mono text-white">{record.liepinSent}</strong>
      </span>
      <span className="flex items-center gap-1 text-[#ff5000] font-medium">
        <span className="size-1.5 rounded-full bg-[#ff5000]" />
        51job: <strong className="font-mono text-white">{record.job51Sent}</strong>
      </span>
      <span className="text-amber-400 font-bold pl-2 border-l border-white/20">
        总计: <strong className="font-mono text-white">{record.totalSent}</strong>
      </span>
    </div>
  );
}
