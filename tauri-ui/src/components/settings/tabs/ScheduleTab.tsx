import { useState, useEffect } from "react";
import { Clock, Calendar, Check, Save, Bell, Power, Sparkles, RefreshCw, ShieldCheck } from "lucide-react";
import {
  type PetScheduleConfig,
  DEFAULT_SCHEDULE_CONFIG,
} from "../../pet/types";
import {
  loadScheduleConfig,
  saveScheduleConfig,
} from "../../pet/PetSchedulePopover";
import { ipc } from "../../../lib/ipc";

interface ScheduleTabProps {
  isMonochrome: boolean;
  busy?: boolean;
}

const WEEKDAYS = [
  { day: 1, label: "周一" },
  { day: 2, label: "周二" },
  { day: 3, label: "周三" },
  { day: 4, label: "周四" },
  { day: 5, label: "周五" },
  { day: 6, label: "周六" },
  { day: 0, label: "周日" },
];

export default function ScheduleTab({ isMonochrome, busy = false }: ScheduleTabProps) {
  const [config, setConfig] = useState<PetScheduleConfig>(loadScheduleConfig);
  const [savedSuccess, setSavedSuccess] = useState(false);
  // 新号保护模式接管状态（2026-10-15）：激活时单一闹钟不生效
  const [protectionActive, setProtectionActive] = useState(false);

  useEffect(() => {
    ipc
      .getProtectionMode()
      .then((res) => setProtectionActive(res.enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setConfig(loadScheduleConfig());
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<PetScheduleConfig>;
      if (customEvent.detail) {
        setConfig(customEvent.detail);
      }
    };
    window.addEventListener("jobhunter_pet_schedule_updated", handleUpdate);
    return () => {
      window.removeEventListener("jobhunter_pet_schedule_updated", handleUpdate);
    };
  }, []);

  const toggleDay = (day: number) => {
    setConfig((prev) => {
      const exists = prev.repeatDays.includes(day);
      const nextDays = exists
        ? prev.repeatDays.filter((d) => d !== day)
        : [...prev.repeatDays, day].sort();
      return { ...prev, repeatDays: nextDays };
    });
  };

  const setWorkdays = () => {
    setConfig((prev) => ({ ...prev, repeatDays: [1, 2, 3, 4, 5] }));
  };

  const setEveryday = () => {
    setConfig((prev) => ({ ...prev, repeatDays: [0, 1, 2, 3, 4, 5, 6] }));
  };

  const handleSave = () => {
    saveScheduleConfig(config);
    // 升级：同步写成 Windows 系统计划任务——App 关掉也到点自动巡航
    ipc
      .saveSchedule({
        time: config.time,
        enabled: config.enabled,
        repeatDays: config.repeatDays,
        autoRun: config.autoRun,
      })
      .then((res) => {
        if (res.status === "ok" && res.task) {
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 2000);
        }
      })
      .catch(() => {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
      });
  };

  return (
    <div className="space-y-5">
      {/* 新号保护模式接管横幅（2026-10-15） */}
      {protectionActive && (
        <div className="p-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 flex items-start gap-3">
          <ShieldCheck className="size-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold text-amber-300">新号保护模式接管中</span>
            <span className="text-stone-400">
              ：每日三个时段自动巡航并按份额分配日限额，此处单一闹钟暂不生效
              （可在「拟人风控与策略」页停用保护模式后恢复）。
            </span>
          </div>
        </div>
      )}

      {/* 头部状态概览卡片 */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          config.enabled
            ? isMonochrome
              ? "bg-zinc-900 border-zinc-700"
              : "bg-gradient-to-r from-amber-950/30 to-stone-900/60 border-amber-500/30"
            : "bg-[var(--panel-2)] border-[var(--grid)]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                config.enabled
                  ? isMonochrome
                    ? "bg-white/10 text-white border-white/20"
                    : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  : "bg-stone-800 text-stone-500 border-stone-700"
              }`}
            >
              <Clock className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-[var(--ink)]">定时巡航总控</h4>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    config.enabled
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-stone-800 text-stone-400 border border-stone-700"
                  }`}
                >
                  {config.enabled ? "已开启 · 守护中" : "已暂停"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-fg)] mt-0.5">
                与侧边栏萌宠小土豆无缝联动，支持每日定时自动启动求职巡航
              </p>
            </div>
          </div>

          {/* 开关 */}
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              config.enabled
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30"
                : "bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-600"
            }`}
          >
            <Power className="size-3.5" />
            <span>{config.enabled ? "点击停用" : "点击开启"}</span>
          </button>
        </div>
      </div>

      {/* 定时与重复周期设置 */}
      <div className="space-y-4">
        {/* 触发时间 */}
        <div className="p-4 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] space-y-2">
          <label className="text-xs font-semibold text-stone-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-amber-400" />
              <span>每天巡航启动时间 (24小时制)</span>
            </span>
            <span className="text-[11px] text-stone-500">格式：HH:mm，例如 09:00</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={config.time}
              onChange={(e) => setConfig((prev) => ({ ...prev, time: e.target.value }))}
              className={`px-3 py-2 rounded-xl border text-sm font-mono font-bold transition-all ${
                isMonochrome
                  ? "bg-zinc-900 border-zinc-700 text-white focus:border-white"
                  : "bg-stone-900 border-[var(--grid)] text-amber-300 focus:border-amber-500"
              }`}
            />
            <span className="text-xs text-stone-400">
              侧边栏宠物悬停微板块亦可滚轮滑动随时微调
            </span>
          </div>
        </div>

        {/* 重复周期 */}
        <div className="p-4 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
              <Calendar className="size-4 text-cyan-400" />
              <span>重复日期 (周一至周日)</span>
            </label>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={setWorkdays}
                className="text-stone-400 hover:text-amber-400 underline decoration-dotted text-[11px] cursor-pointer"
              >
                仅工作日 (一至五)
              </button>
              <span className="text-stone-600">·</span>
              <button
                type="button"
                onClick={setEveryday}
                className="text-stone-400 hover:text-amber-400 underline decoration-dotted text-[11px] cursor-pointer"
              >
                每天 (周一至周日)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(({ day, label }) => {
              const active = config.repeatDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    active
                      ? isMonochrome
                        ? "bg-white text-black border-white shadow-sm"
                        : "bg-amber-500 text-stone-950 border-amber-500 shadow-md shadow-amber-500/20"
                      : "bg-stone-900/80 text-stone-400 border-[var(--grid)] hover:border-stone-600"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 自动行为选项 */}
        <div className="p-4 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] space-y-3">
          <h5 className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-400" />
            <span>自动触发行为</span>
          </h5>

          <div className="space-y-2">
            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-stone-200">到达预定时间后全自动启动巡航</div>
                <div className="text-[10px] text-stone-500">无需人工点击，系统将在后台自动唤起浏览器并投递</div>
              </div>
              <input
                type="checkbox"
                checked={config.autoRun}
                onChange={(e) => setConfig((prev) => ({ ...prev, autoRun: e.target.checked }))}
                className={`rounded size-4 cursor-pointer ${
                  isMonochrome ? "accent-white" : "accent-amber-500"
                }`}
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-stone-200">触发时发出桌面气泡与音效提醒</div>
                <div className="text-[10px] text-stone-500">在任务启动前，侧边栏萌宠会发出提示气泡告知主人</div>
              </div>
              <input
                type="checkbox"
                checked={config.soundNotify}
                onChange={(e) => setConfig((prev) => ({ ...prev, soundNotify: e.target.checked }))}
                className={`rounded size-4 cursor-pointer ${
                  isMonochrome ? "accent-white" : "accent-amber-500"
                }`}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 底部保存按钮 */}
      <div className="pt-3 border-t border-[var(--grid)] flex items-center justify-between">
        <span className="text-[11px] text-stone-500">
          设置保存后即时同步生效至左下角宠物特助
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
            isMonochrome
              ? "bg-white hover:bg-zinc-200 text-black shadow-md shadow-white/10"
              : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/20"
          }`}
        >
          {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
          <span>{savedSuccess ? "已保存配置" : "保存定时配置"}</span>
        </button>
      </div>
    </div>
  );
}
