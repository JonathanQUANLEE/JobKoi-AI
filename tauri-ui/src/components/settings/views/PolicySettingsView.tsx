import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldCheckIcon } from "@hugeicons/core-free-icons";

interface PolicySettingsViewProps {
  localDailyLimit: string;
  setLocalDailyLimit: (val: string) => void;
  localDelayMin: string;
  setLocalDelayMin: (val: string) => void;
  localDelayMax: string;
  setLocalDelayMax: (val: string) => void;
  localDryRun: boolean;
  setLocalDryRun: (val: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function PolicySettingsView({
  localDailyLimit,
  setLocalDailyLimit,
  localDelayMin,
  setLocalDelayMin,
  localDelayMax,
  setLocalDelayMax,
  localDryRun,
  setLocalDryRun,
  onSave,
  onClose,
}: PolicySettingsViewProps) {
  return (
    <div className="py-4 space-y-5">
      <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200/90 leading-relaxed flex items-start gap-2.5">
        <HugeiconsIcon icon={ShieldCheckIcon} size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong>为什么需要防风控保护？</strong><br />
          各大招聘平台（BOSS直聘等）均部署有严格的机械人爬虫检测。本软件内置<strong>泊松过程拟人化等待与贝塞尔平滑轨迹</strong>，每次沟通间隔随机浮动，高度还原真实人类操作节奏，确保您的账号安全无忧。
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="mist-setting-row">
          <label className="text-xs font-semibold text-stone-200">
            每日投递安全上限 (家/天)
          </label>
          <p className="text-[11px] text-stone-400">
            建议设为 50~100 次，避免过度频繁被平台限流
          </p>
          <input
            type="number"
            min="10"
            max="300"
            value={localDailyLimit}
            onChange={(e) => setLocalDailyLimit(e.target.value)}
            className="mist-input text-xs font-mono"
          />
        </div>

        <div className="mist-setting-row">
          <label className="text-xs font-semibold text-stone-200">
            拟人化等待时间区间 (秒)
          </label>
          <p className="text-[11px] text-stone-400">
            每次打招呼后的随机停留时间（推荐 3 ~ 6 秒）
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="10"
              value={localDelayMin}
              onChange={(e) => setLocalDelayMin(e.target.value)}
              className="mist-input text-xs font-mono text-center"
            />
            <span className="text-stone-500 text-xs">至</span>
            <input
              type="number"
              min="3"
              max="20"
              value={localDelayMax}
              onChange={(e) => setLocalDelayMax(e.target.value)}
              className="mist-input text-xs font-mono text-center"
            />
            <span className="text-stone-400 text-xs">秒</span>
          </div>
        </div>
      </div>

      <div className="mist-setting-row flex-row items-center justify-between border-t border-white/10 pt-3">
        <div>
          <span className="text-xs font-semibold text-stone-200 block">
            演练试跑模式 (Dry Run)
          </span>
          <span className="text-[11px] text-stone-400">
            开启后仅模拟筛选与匹配流程，不会真正向 HR 发出招呼语，新手推荐先演练体验
          </span>
        </div>
        <button
          type="button"
          onClick={() => setLocalDryRun(!localDryRun)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            localDryRun ? "bg-amber-500" : "bg-stone-700"
          }`}
        >
          <span
            className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              localDryRun ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="pt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-white transition-all cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-stone-950 font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          保存安全设置
        </button>
      </div>
    </div>
  );
}
