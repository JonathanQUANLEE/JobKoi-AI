import { useEffect, useRef } from "react";
import { Check, X, ScanFace } from "lucide-react";
import { useRunStore } from "../../store";

/**
 * FaceID 式登录引导浮层（用户规格 2026-10-11）：
 * - 点「换号」→ 全屏背景模糊 + 中央卡片：圆圈扫描动画（苹果面容识别质感）
 * - 扫码成功 → 圆圈变绿色对勾 + "叮"一声解锁音 → 1.5s 后自动淡出
 * - 解锁音用 Web Audio 实时合成（B5→E6 双音，听感对齐苹果解锁声）——
 *   苹果原声受版权保护不能内置分发，合成方案零依赖、零版权风险、离线可用。
 */

/** 合成"叮"解锁音：两个短促上行正弦音（B5 987Hz → E6 1319Hz）。 */
function playUnlockChime() {
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // 浏览器 autoplay 策略：await/定时器之后的调用栈已脱离用户手势，
    // AudioContext 可能创建在 suspended 状态——显式 resume 才能出声。
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const notes = [
      { freq: 987.77, at: 0.0 }, // B5
      { freq: 1318.51, at: 0.12 }, // E6
    ];
    for (const { freq, at } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    }
    setTimeout(() => void ctx.close().catch(() => {}), 900);
  } catch {
    /* 无声环境（无 AudioContext 权限等）静默跳过 */
  }
}

export default function LoginOverlay() {
  const loginOverlay = useRunStore((s) => s.loginOverlay);
  const hideLoginOverlay = useRunStore((s) => s.hideLoginOverlay);
  const prevStatusRef = useRef<string | null>(null);

  // 状态切到 success 的瞬间播放解锁音（一次）
  useEffect(() => {
    if (!loginOverlay) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = loginOverlay.status;
    if (loginOverlay.status === "success" && prev !== "success") {
      playUnlockChime();
    }
  }, [loginOverlay]);

  if (!loginOverlay) return null;

  const { status, platform, message } = loginOverlay;
  const isBoss = platform === "boss";
  const platformName = isBoss ? "BOSS 直聘" : platform;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center select-none animate-in fade-in duration-200">
      {/* 全屏背景模糊遮罩（FaceID 唤起时的沉浸感） */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[6px]" />

      {/* 中央登录卡片 */}
      <div className="relative w-[320px] rounded-3xl border border-stone-700/70 bg-stone-950/95 px-7 py-8 shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-200">
        {/* 右上角关闭（只关浮层，后台登录检测继续） */}
        <button
          type="button"
          onClick={hideLoginOverlay}
          className="absolute right-3.5 top-3.5 p-1.5 rounded-xl text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          title="关闭浮层（浏览器保持打开，登录后仍会自动识别）"
        >
          <X className="size-4" />
        </button>

        {/* 圆圈动画区：等待=扫描脉冲；成功=绿色对勾；失败=红色叉 */}
        <div className="flex items-center justify-center">
          <div
            className={`relative grid size-24 place-items-center rounded-full border-2 transition-all duration-500 ${
              status === "success"
                ? "border-emerald-400 bg-emerald-500/15 shadow-[0_0_36px_rgba(52,211,153,0.45)]"
                : status === "error"
                ? "border-red-400/80 bg-red-500/10"
                : "border-amber-400/70 bg-amber-500/5"
            }`}
          >
            {status === "waiting" && (
              <>
                {/* 扫描脉冲外环（FaceID 等待质感） */}
                <span className="absolute inset-0 rounded-full border-2 border-amber-300/50 animate-ping" />
                <ScanFace className="size-11 text-amber-300 animate-pulse" />
              </>
            )}
            {status === "success" && (
              <Check
                className="size-12 text-emerald-300 animate-in zoom-in-50 duration-300"
                strokeWidth={3}
              />
            )}
            {status === "error" && <X className="size-11 text-red-300" strokeWidth={3} />}
          </div>
        </div>

        {/* 文案区 */}
        <div className="mt-6 text-center space-y-1.5">
          {status === "waiting" && (
            <>
              <h3 className="text-base font-bold text-stone-100">
                已打开「{platformName}」登录页
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                请在浏览器中扫码登录
                <br />
                登录成功后将自动识别，无需其他操作
              </p>
            </>
          )}
          {status === "success" && (
            <>
              <h3 className="text-base font-bold text-emerald-300">登录成功</h3>
              <p className="text-xs text-stone-400">正在同步登录状态，浏览器将自动关闭...</p>
            </>
          )}
          {status === "error" && (
            <>
              <h3 className="text-base font-bold text-red-300">登录页打开失败</h3>
              <p className="text-xs text-stone-400 break-words leading-relaxed">
                {message || "请再点一次「换号/刷新」重试"}
              </p>
            </>
          )}
        </div>

        {/* 底部小字 */}
        <p className="mt-6 pt-3 border-t border-stone-800/80 text-center text-[10px] text-stone-500">
          {status === "waiting"
            ? "正在等待您扫码 · 检测持续在后台进行，可关闭此浮层"
            : status === "success"
            ? "认证完成 · 欢迎回来"
            : "可随时重新点击换号/刷新"}
        </p>
      </div>
    </div>
  );
}