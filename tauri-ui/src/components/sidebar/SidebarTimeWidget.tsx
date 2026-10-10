import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import type { Lang } from "../../lib/i18n";

interface SidebarTimeWidgetProps {
  lang: Lang;
  isMonochrome: boolean;
}

export default function SidebarTimeWidget({ lang, isMonochrome }: SidebarTimeWidgetProps) {
  const [beijingTime, setBeijingTime] = useState(() => {
    return new Date().toLocaleTimeString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setBeijingTime(
        new Date().toLocaleTimeString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--grid)]/60 flex items-center justify-between text-[11px] text-stone-300 font-mono select-none">
      <div className="flex items-center gap-1.5">
        <Clock className={`size-3 shrink-0 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
        <span className="text-[10px] text-[var(--muted-fg)] font-sans">
          {lang === "en" ? "Beijing Time" : "北京时间"}
        </span>
      </div>
      <span className={`font-bold tracking-wider font-mono text-xs ${isMonochrome ? "text-zinc-100" : "text-amber-300"}`}>
        {beijingTime}
      </span>
    </div>
  );
}
