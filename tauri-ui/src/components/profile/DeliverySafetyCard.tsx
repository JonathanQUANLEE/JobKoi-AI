import { ShieldCheck } from "lucide-react";
import { MagicCard } from "../core/MagicBento";

interface DeliverySafetyCardProps {
  dailyLimit: string;
  setDailyLimit: (val: string) => void;
  dryRun: boolean;
  setDryRun: (val: boolean) => void;
  isEn: boolean;
}

export default function DeliverySafetyCard({
  dailyLimit,
  setDailyLimit,
  dryRun,
  setDryRun,
  isEn,
}: DeliverySafetyCardProps) {
  return (
    <MagicCard
      className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4"
      glowColor="6, 182, 212"
      enableTilt={false}
      enableStars={true}
      particleCount={6}
      clickEffect={true}
    >
      <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--grid)]">
        <ShieldCheck className="size-4 text-cyan-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
          {isEn ? "Delivery Settings & Safety" : "投递设置与安全保护"}
        </h2>
      </div>

      <div className="space-y-4 text-xs">
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
          <div>
            <div className="text-xs font-medium text-stone-200">
              {isEn ? "Daily Application Limit" : "每日投递上限"}
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">
              {isEn ? "Automatically pauses after reaching limit" : "达到上限后自动停止，防止账号被平台限制"}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="10"
              max="200"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className="w-20 rounded-xl border border-[var(--grid)] bg-[#1c1917] px-2.5 py-1.5 text-xs text-stone-100 font-mono text-center focus:border-cyan-500/60 focus:outline-none"
            />
            <span className="text-stone-500">{isEn ? "/day" : "次/日"}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-950/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-emerald-300">
                {isEn ? "Smart Anti-Ban Protection" : "智能防封保护"}
              </div>
              <div className="text-[10px] text-stone-400 mt-0.5">
                {isEn
                  ? "Human-like natural delays applied automatically"
                  : "系统已默认配置最佳拟人随机浏览间隔，保障账号稳定安全"}
              </div>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-md bg-emerald-900/60 border border-emerald-500/30">
            {isEn ? "Active" : "已保护"}
          </span>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
          <div>
            <div className="text-xs font-medium text-stone-200">
              {isEn ? "Dry-Run Simulation" : "安全演练模式 (不真实投递)"}
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">
              {isEn ? "Scan and match without sending messages" : "仅抓取和比对岗位，不会真实点击打招呼按钮"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDryRun(!dryRun)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              dryRun ? "bg-cyan-500" : "bg-stone-800"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-stone-950 shadow ring-0 transition duration-200 ease-in-out ${
                dryRun ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </MagicCard>
  );
}
