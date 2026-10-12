import { MapPin, X, FlagTriangleRight, Clock3 } from "lucide-react";
import { useRunStore } from "../../store";

/**
 * 巡航结束说明弹窗（2026-10-12 用户拍板）：
 * 无论什么原因结束（扫完 / 手动停止 / 异常 / 限额 / 风控），都要如实弹窗
 * 解释——结束原因、运行时长、本轮统计、**按城市拆开**的扫描结果（让用户
 * 明白"郑州/上海每个城市都扫了多少、为什么没投"）。用户点叉关闭后，
 * 自行回去调整求职画像再投。
 */
function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s % 60)}`;
}

export default function CruiseEndDialog() {
  const notice = useRunStore((s) => s.cruiseEndNotice);
  const dismiss = useRunStore((s) => s.dismissCruiseEndNotice);
  if (!notice) return null;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center select-none animate-in fade-in duration-200">
      {/* 全屏背景模糊遮罩（与登录浮层同款质感） */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[6px]" />

      <div className="relative w-[440px] max-w-[92vw] rounded-3xl border border-stone-700/70 bg-stone-950/95 px-7 py-7 shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-200">
        {/* 右上角关闭 */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3.5 top-3.5 p-1.5 rounded-xl text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          title="关闭"
        >
          <X className="size-4" />
        </button>

        {/* 标题区：结束原因 + 时间 */}
        <div className="flex items-start gap-3">
          <div className="grid place-items-center size-10 rounded-2xl border border-amber-500/30 bg-amber-500/10 shrink-0">
            <FlagTriangleRight className="size-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-100">{notice.reason}</h3>
            <p className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1.5">
              <Clock3 className="size-3" />
              {notice.time.slice(11)}
              {notice.durationMs !== null && ` · 运行 ${formatDuration(notice.durationMs)}`}
            </p>
          </div>
        </div>

        {/* 本轮统计 */}
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {[
            { label: "扫描岗位", value: notice.stats.scanned, cls: "text-white" },
            { label: "新投递", value: notice.stats.sent, cls: "text-amber-300" },
            { label: "跳过", value: notice.stats.skipped, cls: "text-stone-300" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-center">
              <p className={`text-xl font-black font-mono ${item.cls}`}>{item.value}</p>
              <p className="text-[10px] text-stone-500 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        {/* 按城市拆开的扫描结果（回答"每个城市都试了吗"） */}
        {notice.perCity.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] font-semibold text-stone-400 flex items-center gap-1.5">
              <MapPin className="size-3" />
              各城市扫描结果
            </p>
            <div className="space-y-1">
              {notice.perCity.slice(0, 6).map((c) => (
                <div
                  key={c.city}
                  className="flex items-center justify-between rounded-lg border border-white/6 bg-white/[0.02] px-3 py-1.5 text-[11px]"
                >
                  <span className="text-stone-200 font-medium">{c.city}</span>
                  <span className="text-stone-400 font-mono">
                    扫 {c.scanned} · 投 <span className="text-amber-300">{c.sent}</span> · 跳 {c.skipped}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 结束原因说明（人话汇总） */}
        {notice.message && (
          <p className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5 text-[11px] text-stone-300 leading-relaxed break-words">
            {notice.message}
          </p>
        )}

        {/* 行动建议 */}
        <p className="mt-3.5 text-[10px] text-stone-500 leading-relaxed">
          可在「求职画像」调整搜索词/关键词/城市后重新启动巡航；今天的投递明细可在「数据统计与早报」查看。
        </p>

        {/* 底部按钮 */}
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-bold transition-all cursor-pointer"
        >
          我知道了
        </button>
      </div>
    </div>
  );
}
