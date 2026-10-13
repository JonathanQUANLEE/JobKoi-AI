import { useEffect, useState } from "react";
import {
  ExternalLink,
  AlertCircle,
  ArrowRight,
  Minus,
  Square,
  X,
  UserCheck,
  Sparkles,
} from "lucide-react";
import {
  verifyGithubAccount,
  setStoredGithubUser,
  type GithubUser,
} from "../../lib/githubAuth";
import { openSystemBrowser } from "../../lib/browserUtils";
import { ipc } from "../../lib/ipc";

function GithubIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

interface GithubAuthGateProps {
  onLoginSuccess: (user: GithubUser) => void;
}

/**
 * 极简登录门禁（2026-10-14 用户反馈重设计）：
 * - GitHub 登录（OAuth 一键，浏览器授权软件自动识别）
 * - 新用户注册（一键打开 GitHub 注册页）
 * - 游客模式（测试阶段保留）
 * 旧的 Token 切换 / 邮箱登录 / 注册指引 Tab 全部移除。
 * OAuth 未配置 client_id 时降级显示用户名输入框（过渡期，配置后自动消失）。
 */
export default function GithubAuthGate({ onLoginSuccess }: GithubAuthGateProps) {
  const [accountInput, setAccountInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // OAuth 一键登录：后端配置了 client_id 才显示，未配置零影响
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ipc
      .githubOauthStatus()
      .then((res) => {
        if (!cancelled && res?.status === "ok") setOauthEnabled(Boolean(res.enabled));
      })
      .catch(() => {
        /* 查询失败按未配置处理，走用户名登录 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // GitHub 一键 OAuth 登录：自动唤起浏览器，授权完成软件自动识别进入
  const handleOauthLogin = async () => {
    setOauthLoading(true);
    setError(null);
    setNotice("已在浏览器打开 GitHub，完成登录后将自动进入软件…");
    try {
      const res = await ipc.githubOauthLogin();
      if (res?.status === "ok" && res.user) {
        const u = res.user;
        const user: GithubUser = {
          id: u.id,
          login: u.login,
          name: u.name,
          avatar_url: u.avatarUrl,
          email: u.email,
          html_url: u.htmlUrl,
          bio: u.bio,
          token: u.token,
          loginAt: u.loginAt,
        };
        setStoredGithubUser(user);
        onLoginSuccess(user);
      } else {
        setError(res?.message || "GitHub 登录失败，请重试");
        setNotice(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNotice(null);
    } finally {
      setOauthLoading(false);
    }
  };

  // 过渡期用户名登录（OAuth 配置后此表单不再显示）
  const handleAccountLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = accountInput.trim();
    if (!val) {
      setError("请输入您的 GitHub 用户名");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const user = await verifyGithubAccount(val);
      setStoredGithubUser(user);
      onLoginSuccess(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // 游客模式（测试阶段保留）
  const handleDemoLogin = () => {
    const demoUser: GithubUser = {
      id: 88888888,
      login: "github-guest",
      name: "GitHub 体验用户",
      avatar_url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
      email: null,
      html_url: "https://github.com",
      loginAt: Date.now(),
    };
    setStoredGithubUser(demoUser);
    onLoginSuccess(demoUser);
  };

  // 窗口控制
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
      {/* 顶部可拖拽标题栏与窗口控制 */}
      <div
        data-tauri-drag-region
        className="h-10 shrink-0 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-md px-4 flex items-center justify-between z-50 cursor-move"
      >
        <div className="flex items-center gap-2 pointer-events-none text-xs text-stone-400">
          <GithubIcon className="size-4 text-white" />
          <span className="font-semibold text-stone-200">JobKoi-AI · 全智能求职锦鲤助手</span>
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

      {/* 主体居中卡片 */}
      <div
        data-tauri-drag-region
        className="flex-1 overflow-y-auto flex items-center justify-center p-4 relative"
      >
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[320px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="relative w-full max-w-sm rounded-3xl border border-stone-800 bg-[#0d1117]/95 shadow-2xl shadow-black/80 backdrop-blur-xl p-7 sm:p-8 space-y-6">
          {/* 品牌区 */}
          <div className="flex flex-col items-center text-center space-y-2.5">
            <div className="size-14 rounded-2xl bg-stone-900 border border-stone-700/80 p-3 shadow-inner flex items-center justify-center text-white">
              <GithubIcon className="size-8" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">登录 JobKoi-AI</h1>
            <p className="text-xs text-stone-400 leading-relaxed">
              使用您的 GitHub 账号登录，登录一次永久记住
            </p>
          </div>

          {/* GitHub 登录（OAuth 一键，配置后显示） */}
          {oauthEnabled ? (
            <button
              type="button"
              onClick={handleOauthLogin}
              disabled={oauthLoading}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait text-stone-950 font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <GithubIcon className="size-4.5" />
              <span>{oauthLoading ? "等待您在浏览器完成登录…" : "使用 GitHub 登录"}</span>
              {!oauthLoading && <ArrowRight className="size-4" />}
            </button>
          ) : (
            /* 过渡期：OAuth 未配置时的用户名登录（配置后自动消失） */
            <form onSubmit={handleAccountLogin} className="space-y-3">
              <div className="space-y-1.5 text-xs">
                <label
                  htmlFor="github-account"
                  className="font-semibold text-stone-300 flex items-center gap-1.5"
                >
                  <UserCheck className="size-3.5 text-amber-400" />
                  <span>GitHub 用户名</span>
                </label>
                <input
                  id="github-account"
                  type="text"
                  value={accountInput}
                  onChange={(e) => setAccountInput(e.target.value)}
                  placeholder="例如：octocat"
                  autoComplete="username"
                  className="w-full rounded-xl bg-stone-900/80 border border-stone-700/80 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 outline-none px-3.5 py-2.5 text-sm text-stone-100 placeholder:text-stone-600 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-[0.99] disabled:opacity-60 text-stone-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
              >
                {loading ? "正在验证…" : "登录"}
                {!loading && <ArrowRight className="size-4" />}
              </button>
            </form>
          )}

          {/* 新用户注册：一键打开 GitHub 注册页 */}
          <button
            type="button"
            onClick={() => {
              setNotice("已在系统默认浏览器打开 GitHub 注册页，注册完成后回来登录即可");
              void openSystemBrowser("https://github.com/signup");
            }}
            className="w-full py-3 px-4 rounded-2xl bg-stone-900/90 hover:bg-stone-800 border border-stone-700/80 text-stone-200 font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <ExternalLink className="size-4 text-stone-400" />
            <span>没有账号？注册 GitHub</span>
          </button>

          {/* 反馈提示 */}
          {notice && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
              <Sparkles className="size-4 shrink-0 text-emerald-400" />
              <span className="leading-relaxed">{notice}</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs">
              <AlertCircle className="size-4 shrink-0 text-red-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* 游客模式（弱入口，测试阶段保留） */}
          <div className="pt-1 border-t border-stone-800/80 flex items-center justify-center">
            <button
              type="button"
              onClick={handleDemoLogin}
              className="text-xs text-stone-500 hover:text-stone-300 underline underline-offset-4 transition-colors cursor-pointer"
            >
              游客模式直接体验
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
