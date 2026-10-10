import { Bell, ShieldCheck, Check, Save } from "lucide-react";

interface GeneralTabProps {
  notifyOnMatch: boolean;
  setNotifyOnMatch: (v: boolean) => void;
  isMonochrome: boolean;
  busy: boolean;
  savedSuccess: boolean;
  onSaveAll: () => Promise<void>;
}

export default function GeneralTab({
  notifyOnMatch,
  setNotifyOnMatch,
  isMonochrome,
  busy,
  savedSuccess,
  onSaveAll,
}: GeneralTabProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="font-semibold text-stone-200 text-xs">消息与提醒</h3>
        <div className="space-y-2">
          <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
            <div className="flex items-center gap-2.5">
              <Bell className={`size-4 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
              <div>
                <div className="font-medium text-stone-200">命中满意岗位时系统提示</div>
                <div className="text-[10px] text-stone-500">巡航筛选出匹配岗位时在右下角发出气泡提醒</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyOnMatch}
              onChange={(e) => setNotifyOnMatch(e.target.checked)}
              className={`rounded size-4 cursor-pointer ${isMonochrome ? "accent-white" : "accent-amber-500"}`}
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 text-emerald-400" />
              <div>
                <div className="font-medium text-stone-200">智能防封风控保护</div>
                <div className="text-[10px] text-stone-500">自动开启拟人浏览保护，模拟真实人类操作</div>
              </div>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30">
              始终开启
            </span>
          </label>
        </div>
      </div>

      <div className="pt-3 border-t border-[var(--grid)] flex justify-end">
        <button
          type="button"
          onClick={onSaveAll}
          disabled={busy}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
            isMonochrome
              ? "bg-white hover:bg-zinc-200 text-black shadow-md shadow-white/10"
              : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/20"
          }`}
        >
          {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
          <span>{savedSuccess ? "已保存" : "保存通用设置"}</span>
        </button>
      </div>
    </div>
  );
}
