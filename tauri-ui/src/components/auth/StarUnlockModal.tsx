import { useEffect, useState } from "react";
import {
  Star,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  Minus,
  Square,
  X,
  Heart,
  ShieldCheck,
} from "lucide-react";
import { openSystemBrowser } from "../../lib/browserUtils";
import { ipc } from "../../lib/ipc";
import { type GithubUser } from "../../lib/githubAuth";

interface StarUnlockModalProps {
  user: GithubUser;
  onUnlocked: () => void;
  onLogout?: () => void;
}

export default function StarUnlockModal({
  user,
  onUnlocked,
  onLogout,
}: StarUnlockModalProps) {
  const [hasOpenedLink, setHasOpenedLink] = useState(false);
  const [browserNotice, setBrowserNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const targetRepoUrl = "https://github.com/JonathanQUANLEE/JobKoi-AI";

  const unlock = () => {
    try {
      localStorage.setItem("jobkoi_star_unlocked", "true");
    } catch (e) {
      console.warn("Save star unlock error:", e);
    }
    onUnlocked();
  };

  // 点星真检测（2026-10-14）：OAuth/Token 登录的用户，直接查 GitHub API
  // 判定是否已点星——已点过 → 无感自动放行（老用户丝滑进入）；
  // 未点 → 留在引导页。自觉模式（用户名/游客）不受影响。
  const checkStarred = async (): Promise<boolean> => {
    if (!user.token) return false;
    try {
      const res = await ipc.githubCheckStarred(user.token);
      if (res?.status === "ok") {
        return Boolean(res.starred);
      }
      if (res?.message) setBrowserNotice(res.message);
    } catch {
      /* 网络异常不阻断自觉流程 */
    }
    return false;
  };

  useEffect(() => {
    let cancelled = false;
    if (user.token) {
      checkStarred().then((starred) => {
        if (!cancelled && starred) unlock();
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.token]);

  const handleOpenRepo = async () => {
    setBrowserNotice("已在您的系统默认浏览器打开项目主页，请在页面右上角为作者点亮 ⭐ Star！");
    setHasOpenedLink(true);
    await openSystemBrowser(targetRepoUrl);
  };

  const handleConfirmAndEnter = async () => {
    // 有 token（OAuth/Token 登录）：真实闭环——点完 Star 再查一次 API，
    // 确认点亮才放行，杜绝"口说点过但没点"的漏网
    if (user.token) {
      setVerifying(true);
      setBrowserNotice("正在向 GitHub 核验您的 Star…");
      const starred = await checkStarred();
      setVerifying(false);
      if (starred) {
        unlock();
        return;
      }
      setBrowserNotice(
        "暂未检测到您点亮了 Star：请确认已在浏览器中点击仓库右上角的 ⭐ Star 按钮（可能需要几十秒生效），然后再次点击下方按钮重试。"
      );
      return;
    }
    // 无 token（用户名/游客）：自觉申报模式
    unlock();
  };

  const handleMinimize = async () => {
    try {
      await ipc.windowMinimize();
    } catch (e) {
      console.warn("Minimize error:", e);
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await ipc.windowToggleMaximize();
    } catch (e) {
      console.warn("Maximize error:", e);
    }
  };

  const handleClose = async () => {
    try {
      await ipc.windowClose();
    } catch (e) {
      console.warn("Close error:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#090d16] text-stone-100 select-none">
      {/* 顶部全局可拖拽窗口标题栏与窗口控制 */}
      <div
        data-tauri-drag-region
        className="h-10 shrink-0 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-md px-4 flex items-center justify-between z-50 cursor-move"
      >
        <div className="flex items-center gap-2 pointer-events-none text-xs text-stone-400">
          <Star className="size-4 fill-amber-400 text-amber-400" />
          <span className="font-semibold text-stone-200">JobKoi-AI · 全智能求职锦鲤助手</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            开源支持 · 点星门禁
          </span>
        </div>

        <div data-tauri-drag-region className="flex-1 h-full cursor-move" />

        <div
          className="flex items-center space-x-1 shrink-0 pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleMinimize}
            title="最小化窗口"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            title="最大化 / 还原"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            title="关闭软件"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-red-600 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 主体居中弹窗卡片 */}
      <div
        data-tauri-drag-region
        className="flex-1 overflow-y-auto flex items-center justify-center p-4 relative"
      >
        {/* 光晕氛围 */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[340px] bg-amber-500/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-12 right-1/4 w-[360px] h-[200px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative w-full max-w-lg rounded-3xl border border-stone-800 bg-[#0d1117]/95 shadow-2xl shadow-black/80 backdrop-blur-xl p-6 sm:p-8 space-y-6">
          {/* 用户已登录问候 & 闪耀星徽 */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <div className="size-16 rounded-2xl bg-stone-900 border border-amber-500/40 p-2.5 shadow-inner flex items-center justify-center text-amber-400 ring-4 ring-amber-500/15">
                <Star className="size-9 fill-amber-400 text-amber-400 animate-pulse drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
              </div>
              <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Heart className="size-3.5 fill-emerald-400 text-emerald-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                <span>GitHub 身份核验通过：@{user.login}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                点亮一颗 Star · 永久免费解锁
              </h1>
              <p className="text-xs text-stone-400 max-w-sm mx-auto leading-relaxed">
                JobKoi-AI 是由作者 <span className="text-amber-300 font-semibold">@JonathanQUANLEE</span> 倾力开源的智能求职助手。
                在进入软件前，只需为作者的 GitHub 官方仓库点亮一颗 ⭐ Star 支持，即可永久免费畅享全功能！
              </p>
            </div>
          </div>

          {/* 交互引导双步骤 */}
          <div className="space-y-3">
            {/* 步骤 1：去浏览器点星 */}
            <button
              type="button"
              onClick={handleOpenRepo}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-[0.99] text-stone-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <Star className="size-4 fill-stone-950 text-stone-950" />
              <span>第一步：在默认浏览器打开仓库并点亮 Star ⭐</span>
              <ExternalLink className="size-4 text-stone-950" />
            </button>

            {/* 步骤 2：点亮后进入软件 */}
            <button
              type="button"
              onClick={handleConfirmAndEnter}
              disabled={verifying}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait ${
                hasOpenedLink
                  ? "bg-emerald-500 hover:bg-emerald-400 text-stone-950 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/50"
                  : "bg-stone-900/90 hover:bg-stone-800 text-stone-300 border border-stone-700/80"
              }`}
            >
              <CheckCircle2 className={`size-4 ${hasOpenedLink ? "text-stone-950" : "text-emerald-400"}`} />
              <span>
                {verifying
                  ? "正在核验 Star…"
                  : "第二步：我已在浏览器中点亮 Star，立即进入软件"}
              </span>
              {!verifying && <ArrowRight className="size-4" />}
            </button>
          </div>

          {/* 浏览器弹窗反馈 */}
          {browserNotice && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs animate-in fade-in">
              <Sparkles className="size-4 shrink-0 text-emerald-400" />
              <span className="leading-relaxed">{browserNotice}</span>
            </div>
          )}

          {/* 仓库链接与切换账号 */}
          <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5 text-stone-400">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>一次点亮 · 永久免重复提醒</span>
            </span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="text-stone-400 hover:text-stone-200 underline cursor-pointer"
              >
                更换 GitHub 账号
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
