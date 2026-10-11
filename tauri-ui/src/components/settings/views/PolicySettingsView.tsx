import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldCheckIcon } from "@hugeicons/core-free-icons";
import { useT } from "../../../store";

/** 拟人化节流三档预设（2026-10-12 用户拍板；区间 [15,45]s 依据风控调研，
 *  与后端 platforms/limits.py 的 BOSS_DELAY_RANGE_SECONDS 单一来源一致）。 */
const DELAY_PRESETS: { key: string; descKey: string; min: string; max: string }[] = [
  { key: "policy.preset.fast", descKey: "policy.preset.fastDesc", min: "15", max: "30" },
  { key: "policy.preset.standard", descKey: "policy.preset.standardDesc", min: "20", max: "40" },
  { key: "policy.preset.safe", descKey: "policy.preset.safeDesc", min: "30", max: "45" },
];

interface PolicySettingsViewProps {
  localDailyLimit: string;
  setLocalDailyLimit: (val: string) => void;
  localDelayMin: string;
  setLocalDelayMin: (val: string) => void;
  localDelayMax: string;
  setLocalDelayMax: (val: string) => void;
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
  onSave,
  onClose,
}: PolicySettingsViewProps) {
  const t = useT();
  // 从本地读取或初始化 3 大平台各自的投递限额（默认拉满官方最大上限）
  const [bossLimit, setBossLimit] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("jobhunter_platform_limits");
      if (saved) return JSON.parse(saved).boss ?? 150;
    } catch {}
    return Number(localDailyLimit) || 150;
  });

  const [liepinLimit, setLiepinLimit] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("jobhunter_platform_limits");
      if (saved) return JSON.parse(saved).liepin ?? 100;
    } catch {}
    return 100;
  });

  const [job51Limit, setJob51Limit] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("jobhunter_platform_limits");
      if (saved) return JSON.parse(saved).job51 ?? 40;
    } catch {}
    return 40;
  });

  const persistLimits = (b: number, l: number, j: number) => {
    try {
      localStorage.setItem(
        "jobhunter_platform_limits",
        JSON.stringify({ boss: b, liepin: l, job51: j })
      );
    } catch {}
  };

  return (
    <div className="py-4 space-y-5">
      <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200/90 leading-relaxed flex items-start gap-2.5">
        <HugeiconsIcon icon={ShieldCheckIcon} size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong>为什么需要防风控保护？</strong><br />
          各大招聘平台（BOSS直聘等）均部署有严格的机械人爬虫检测。本软件内置<strong>泊松过程拟人化等待与贝塞尔平滑轨迹</strong>，每次沟通间隔随机浮动，高度还原真实人类操作节奏，确保您的账号安全无忧。
        </div>
      </div>

      {/* 多平台独立投递上限配置 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold text-stone-200 block">
              各平台每日投递上限 (分别设定 · 满额模式)
            </label>
            <p className="text-[11px] text-stone-400">
              各平台规则不同，已默认调至各平台官方最大安全上限，杜绝一刀切
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBossLimit(150);
              setLiepinLimit(100);
              setJob51Limit(40);
              setLocalDailyLimit("150");
              localStorage.setItem(
                "jobhunter_platform_limits",
                JSON.stringify({ boss: 150, liepin: 100, job51: 40 })
              );
            }}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 border border-blue-500/30 transition-all cursor-pointer font-medium"
          >
            一键拉满各平台官方最大上限
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* BOSS 直聘 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#00bebd]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#00bebd] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#00bebd]" />
                BOSS 直聘
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                官方上限 150
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="10"
                max="150"
                value={bossLimit}
                onChange={(e) => {
                  const val = Math.min(150, Math.max(1, Number(e.target.value) || 1));
                  setBossLimit(val);
                  setLocalDailyLimit(String(val));
                  persistLimits(val, liepinLimit, job51Limit);
                }}
                className="mist-input text-xs font-mono w-full"
              />
              <span className="text-xs text-stone-400 shrink-0">次/天</span>
            </div>
          </div>

          {/* 猎聘 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#ff7033]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#ff7033] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ff7033]" />
                猎聘 Liepin
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                官方上限 100
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="10"
                max="100"
                value={liepinLimit}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                  setLiepinLimit(val);
                  persistLimits(bossLimit, val, job51Limit);
                }}
                className="mist-input text-xs font-mono w-full"
              />
              <span className="text-xs text-stone-400 shrink-0">次/天</span>
            </div>
          </div>

          {/* 前程无忧 */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#ff5000]/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#ff5000] flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ff5000]" />
                前程无忧 51job
              </span>
              <span className="text-[10px] text-stone-400 bg-white/5 px-1.5 py-0.5 rounded">
                官方上限 40
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="40"
                value={job51Limit}
                onChange={(e) => {
                  const val = Math.min(40, Math.max(1, Number(e.target.value) || 1));
                  setJob51Limit(val);
                  persistLimits(bossLimit, liepinLimit, val);
                }}
                className="mist-input text-xs font-mono w-full"
              />
              <span className="text-xs text-stone-400 shrink-0">次/天</span>
            </div>
          </div>
        </div>
      </div>

      {/* 拟人化等待时间区间 - 三档可选（2026-10-12 用户拍板）。
          替换旧版"🔒 系统算法托管 · 已锁定 3~6s"假 UI：那个区块显示的
          3-6s 与真实生效值毫无关系（真实值来自画像 delay_min/max），
          既误导用户又堵死了调节入口。 */}
      <div className="mist-setting-row bg-white/[0.02] border border-white/5 p-3.5 rounded-xl">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200">
            拟人化等待时间区间 (秒)
          </label>
          <span className="text-[11px] text-stone-400 font-mono">
            {localDelayMin} ~ {localDelayMax} 秒
          </span>
        </div>
        <p className="text-[11px] text-stone-400 leading-relaxed mt-1">
          {t("policy.delayCurrent", { min: localDelayMin, max: localDelayMax })}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2.5">
          {DELAY_PRESETS.map((preset) => {
            const active = localDelayMin === preset.min && localDelayMax === preset.max;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setLocalDelayMin(preset.min);
                  setLocalDelayMax(preset.max);
                }}
                className={`p-3 rounded-xl text-left transition-all cursor-pointer border ${
                  active
                    ? "border-blue-500/60 bg-blue-500/10"
                    : "bg-white/[0.03] border-white/10 hover:border-blue-500/40"
                }`}
              >
                <div
                  className={`flex items-baseline justify-between ${
                    active ? "text-blue-300" : "text-stone-200"
                  }`}
                >
                  <span className="text-xs font-bold">{t(preset.key)}</span>
                  <span className="text-xs font-semibold font-mono tabular-nums">
                    {preset.min}–{preset.max}s
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-stone-400">
                  {t(preset.descKey)}
                </p>
              </button>
            );
          })}
        </div>
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
