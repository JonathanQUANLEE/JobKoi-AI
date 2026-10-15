import { useEffect, useRef, useState } from "react";
import { Clock, Power, ShieldCheck } from "lucide-react";
import { useT } from "../../../store";
import { DELAY_PRESETS, isPresetActive, isFollowGeneric } from "../../../lib/platformDelays";
import { ipc } from "../../../lib/ipc";

interface DrawerPolicyTabProps {
  delayMin: string;
  setDelayMin: (v: string) => void;
  delayMax: string;
  setDelayMax: (v: string) => void;
  /** 分平台拟人化节奏（2026-10-13）：空串 = 跟随通用档（delayMin/Max）。 */
  liepinDelayMin: string;
  setLiepinDelayMin: (v: string) => void;
  liepinDelayMax: string;
  setLiepinDelayMax: (v: string) => void;
  job51DelayMin: string;
  setJob51DelayMin: (v: string) => void;
  job51DelayMax: string;
  setJob51DelayMax: (v: string) => void;
  maxSent: string;
  setMaxSent: (v: string) => void;
  dailyLimit: string;
  setDailyLimit: (v: string) => void;
  stopOnCaptcha: boolean;
  setStopOnCaptcha: (v: boolean) => void;
  sendResumeAfterGreeting: boolean;
  setSendResumeAfterGreeting: (v: boolean) => void;
  autoResumeOnReply: boolean;
  setAutoResumeOnReply: (v: boolean) => void;
}

/** 单个平台的预设按钮（抽屉琥珀主题）。 */
function PresetButton({
  label,
  desc,
  range,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  range: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
        active
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-[var(--grid)] bg-[var(--paper)] hover:border-amber-500/40"
      }`}
    >
      <div
        className={`flex items-baseline justify-between ${
          active ? "text-amber-300" : "text-stone-200"
        }`}
      >
        <span className="text-sm font-bold">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{range}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-stone-400">{desc}</p>
    </button>
  );
}

/** 新号保护模式卡片（2026-10-15）：三时段配额调度的本地状态与 IPC 同步。 */
function ProtectionCard({
  setDelayMin,
  setDelayMax,
  setLiepinDelayMin,
  setLiepinDelayMax,
  setJob51DelayMin,
  setJob51DelayMax,
  setMaxSent,
  setDailyLimit,
}: {
  setDelayMin: (v: string) => void;
  setDelayMax: (v: string) => void;
  setLiepinDelayMin: (v: string) => void;
  setLiepinDelayMax: (v: string) => void;
  setJob51DelayMin: (v: string) => void;
  setJob51DelayMax: (v: string) => void;
  setMaxSent: (v: string) => void;
  setDailyLimit: (v: string) => void;
}) {
  // 与后端 PROTECTION_PRESET 保持一致的展示口径（单一真源头在
  // boss_zhipin/config/protection.py，前端仅用于额度分配文案）
  const BOSS_DAILY = 30;
  const LIEPIN_DAILY = 15;
  const JOB51_DAILY = 10;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  const [enabled, setEnabled] = useState(false);
  const [times, setTimes] = useState<string[]>(["10:00", "15:00", "20:00"]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const savedTimesRef = useRef<string>("");

  useEffect(() => {
    ipc
      .getProtectionMode()
      .then((res) => {
        setEnabled(res.enabled);
        const slots = ["", "", ""];
        (res.times || []).slice(0, 3).forEach((t, i) => {
          slots[i] = t;
        });
        setTimes(slots);
        savedTimesRef.current = slots.join(",");
      })
      .catch(() => {});
  }, []);

  const filled = times.filter((t) => TIME_RE.test(t));
  const windows = Math.max(1, filled.length);
  const bossShare = Math.ceil(BOSS_DAILY / windows);
  const liepinShare = Math.ceil(LIEPIN_DAILY / windows);
  const job51Share = Math.ceil(JOB51_DAILY / windows);

  const applyPresetToForm = () => {
    // 保护预设：稳健节奏 30-45s（三平台统一，猎聘/51Job 跟随通用）+
    // 日限额 30、单轮上限 10（= 三时段份额）。与手动点稳健档同一路径，
    // 用户可随时再改——预设只是起点，不是锁死。
    setDelayMin("30");
    setDelayMax("45");
    setLiepinDelayMin("");
    setLiepinDelayMax("");
    setJob51DelayMin("");
    setJob51DelayMax("");
    setMaxSent(String(bossShare));
    setDailyLimit(String(BOSS_DAILY));
  };

  const handleToggle = async () => {
    const next = !enabled;
    if (next && filled.length === 0) {
      setStatusMsg("请先填好至少一个时段（HH:MM）再开启");
      return;
    }
    setStatusMsg(next ? "正在注册保护任务…" : "正在移除保护任务…");
    try {
      const res = await ipc.saveProtectionMode({ enabled: next, times: filled });
      if (res.status !== "ok") {
        setStatusMsg(`保存失败：${res.message || "未知错误"}`);
        return;
      }
      setEnabled(next);
      if (next) {
        savedTimesRef.current = filled.join(",");
        applyPresetToForm();
        setStatusMsg(
          "保护模式已开启：已接管定时巡航（单一闹钟暂停），表单已同步稳健节奏与保护限额，记得点底部「保存并应用此配置」",
        );
      } else {
        setStatusMsg("保护模式已关闭：三时段任务已移除，可到「定时巡航」页重新启用单一闹钟");
      }
    } catch (err) {
      setStatusMsg(`保存失败：${String(err)}`);
    }
  };

  const handleTimeChange = (index: number, value: string) => {
    const next = [...times];
    next[index] = value;
    setTimes(next);
    if (!enabled) return;
    // 全部时段时间合法、且与已保存版本不同才重新注册（防逐键重建任务）
    const valid = next.filter((t) => TIME_RE.test(t));
    if (valid.length === 0 || next.some((t) => t && !TIME_RE.test(t))) return;
    const key = valid.join(",");
    if (key === savedTimesRef.current) return;
    ipc
      .saveProtectionMode({ enabled: true, times: valid })
      .then((res) => {
        if (res.status === "ok") {
          savedTimesRef.current = key;
          setStatusMsg("时段已更新，计划任务已同步");
        } else {
          setStatusMsg(`时段更新失败：${res.message || "未知错误"}`);
        }
      })
      .catch((err) => setStatusMsg(`时段更新失败：${String(err)}`));
  };

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-all ${
        enabled
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-[var(--grid)] bg-[var(--panel-2)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            新号保护模式
          </h3>
          {enabled && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              守护中
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            enabled
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30"
              : "bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-600"
          }`}
        >
          <Power className="size-3.5" />
          <span>{enabled ? "点击停用" : "点击开启"}</span>
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-stone-500">
        新账号首周防风控专用：开启后接管定时巡航，每日三个时段自动出航并把日限额按份额分配
        （模拟真人「分时段逛」）；节奏锁定稳健档、限额收紧，手动巡航同样受保护额度约束。
      </p>

      {enabled && (
        <div className="space-y-2 pt-1 border-t border-[var(--grid)]">
          <label className="text-xs font-semibold text-stone-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-amber-400" />
              <span>三个巡航时段（24 小时制，建议 09:00-21:00）</span>
            </span>
            <span className="text-[11px] text-stone-500">每天重复，改动即同步计划任务</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {times.map((time, index) => (
              <input
                key={index}
                type="time"
                value={time}
                onChange={(e) => handleTimeChange(index, e.target.value)}
                className="px-3 py-2 rounded-xl border text-sm font-mono font-bold bg-stone-900 border-[var(--grid)] text-amber-300 focus:border-amber-500"
              />
            ))}
          </div>
          <p className="text-[11px] text-stone-400">
            额度分配：BOSS {bossShare}/时段 · 猎聘 {liepinShare}/时段 · 前程无忧 {job51Share}/时段
            （每日上限 {BOSS_DAILY}/{LIEPIN_DAILY}/{JOB51_DAILY}，稳健节奏 30-45s）
          </p>
        </div>
      )}

      {statusMsg && <p className="text-[11px] leading-snug text-amber-300">{statusMsg}</p>}
    </div>
  );
}

export default function DrawerPolicyTab({
  delayMin,
  setDelayMin,
  delayMax,
  setDelayMax,
  liepinDelayMin,
  setLiepinDelayMin,
  liepinDelayMax,
  setLiepinDelayMax,
  job51DelayMin,
  setJob51DelayMin,
  job51DelayMax,
  setJob51DelayMax,
  maxSent,
  setMaxSent,
  dailyLimit,
  setDailyLimit,
  stopOnCaptcha,
  setStopOnCaptcha,
  sendResumeAfterGreeting,
  setSendResumeAfterGreeting,
  autoResumeOnReply,
  setAutoResumeOnReply,
}: DrawerPolicyTabProps) {
  const t = useT();

  return (
    <div className="space-y-5">
      {/* 新号保护模式（2026-10-15）：置于策略区顶部——开启会同步下方节奏/限额 */}
      <ProtectionCard
        setDelayMin={setDelayMin}
        setDelayMax={setDelayMax}
        setLiepinDelayMin={setLiepinDelayMin}
        setLiepinDelayMax={setLiepinDelayMax}
        setJob51DelayMin={setJob51DelayMin}
        setJob51DelayMax={setJob51DelayMax}
        setMaxSent={setMaxSent}
        setDailyLimit={setDailyLimit}
      />

      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            防封禁拟人延时设定 · 分平台独立三档
          </h3>
          <p className="mt-1 text-[11px] text-stone-500">
            {t("policy.delayCurrent", { min: delayMin, max: delayMax })}
          </p>
        </div>

        {/* BOSS 直聘（通用档：猎聘/前程无忧未单设时也回退到这里） */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#00bebd] flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#00bebd]" />
              {t("policy.delay.boss")}
            </span>
            <span className="text-[11px] text-stone-400 font-mono tabular-nums">
              {delayMin}~{delayMax}s
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(delayMin, delayMax, preset)}
                onClick={() => {
                  setDelayMin(preset.min);
                  setDelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </div>

        {/* 猎聘：跟随通用 + 三档 */}
        <div className="space-y-2 pt-3 border-t border-[var(--grid)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#ff7033] flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#ff7033]" />
              {t("policy.delay.liepin")}
            </span>
            <span className="text-[11px] text-stone-400 font-mono tabular-nums">
              {isFollowGeneric(liepinDelayMin, liepinDelayMax)
                ? `${delayMin}~${delayMax}s（跟随通用）`
                : `${liepinDelayMin}~${liepinDelayMax}s`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <PresetButton
              label={t("policy.followGeneric")}
              desc={t("policy.followGenericDesc")}
              range={`${delayMin}–${delayMax}s`}
              active={isFollowGeneric(liepinDelayMin, liepinDelayMax)}
              onClick={() => {
                setLiepinDelayMin("");
                setLiepinDelayMax("");
              }}
            />
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(liepinDelayMin, liepinDelayMax, preset)}
                onClick={() => {
                  setLiepinDelayMin(preset.min);
                  setLiepinDelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </div>

        {/* 前程无忧：跟随通用 + 三档 */}
        <div className="space-y-2 pt-3 border-t border-[var(--grid)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#ff5000] flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#ff5000]" />
              {t("policy.delay.job51")}
            </span>
            <span className="text-[11px] text-stone-400 font-mono tabular-nums">
              {isFollowGeneric(job51DelayMin, job51DelayMax)
                ? `${delayMin}~${delayMax}s（跟随通用）`
                : `${job51DelayMin}~${job51DelayMax}s`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <PresetButton
              label={t("policy.followGeneric")}
              desc={t("policy.followGenericDesc")}
              range={`${delayMin}–${delayMax}s`}
              active={isFollowGeneric(job51DelayMin, job51DelayMax)}
              onClick={() => {
                setJob51DelayMin("");
                setJob51DelayMax("");
              }}
            />
            {DELAY_PRESETS.map((preset) => (
              <PresetButton
                key={preset.key}
                label={t(preset.key)}
                desc={t(preset.descKey)}
                range={`${preset.min}–${preset.max}s`}
                active={isPresetActive(job51DelayMin, job51DelayMax, preset)}
                onClick={() => {
                  setJob51DelayMin(preset.min);
                  setJob51DelayMax(preset.max);
                }}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[var(--grid)]">
          <div>
            <label className="field-label">{t("field.maxSent")} (本次上限)</label>
            <input
              className="field-input"
              type="number"
              value={maxSent}
              onChange={(e) => setMaxSent(e.target.value)}
              placeholder="50"
            />
          </div>
          <div>
            <label className="field-label">{t("field.dailyLimit")} (每日保护限额)</label>
            <input
              className="field-input"
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              placeholder="80"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">投递动作安全开关</h3>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={stopOnCaptcha}
            onChange={(e) => setStopOnCaptcha(e.target.checked)}
          />
          <span>{t("toggle.stopOnCaptcha")}（遇到安全验证码自动停机报警）</span>
        </label>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={sendResumeAfterGreeting}
            onChange={(e) => setSendResumeAfterGreeting(e.target.checked)}
          />
          <span>打招呼后立即投递简历附件</span>
        </label>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={autoResumeOnReply}
            onChange={(e) => setAutoResumeOnReply(e.target.checked)}
          />
          <span>HR 回复消息后自动发送在线简历</span>
        </label>
      </div>
    </div>
  );
}
