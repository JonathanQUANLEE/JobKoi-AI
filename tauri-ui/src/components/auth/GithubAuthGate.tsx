import { useState } from "react";
import {
  KeyRound,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Mail,
  Lock,
  ArrowRight,
  Info,
  Minus,
  Square,
  X,
  UserCheck,
  Globe,
  Sparkles,
  Star,
} from "lucide-react";
import {
  verifyGithubAccount,
  verifyGithubToken,
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

export default function GithubAuthGate({ onLoginSuccess }: GithubAuthGateProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [loginMethod, setLoginMethod] = useState<"account" | "token">("account");
  const [accountInput, setAccountInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserNotice, setBrowserNotice] = useState<string | null>(null);

  // 跨平台唤起系统默认浏览器（彻底解决 Webview 内 window.open 打不开的 Bug）
  const handleOpenBrowser = async (url: string, noticeText?: string) => {
    setBrowserNotice(noticeText || "正在为您启动系统默认浏览器...");
    const ok = await openSystemBrowser(url);
    if (!ok) {
      setError(`未能自动打开外部浏览器，请手动访问：${url}`);
    }
  };

  // 窗口控制：最小化、最大化/还原、关闭
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

  // 普通用户登录：通过 GitHub 用户名或绑定邮箱验证
  const handleAccountLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = accountInput.trim();
    if (!val) {
      setError("请输入您的 GitHub 用户名（例如：torvalds）或绑定邮箱");
      return;
    }

    setLoading(true);
    setError(null);
    setBrowserNotice(null);

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

  // 开发者高级登录：通过 Token 验证
  const handleTokenLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const token = tokenInput.trim();
    if (!token) {
      setError("请输入您的 GitHub 访问令牌 (Personal Access Token)");
      return;
    }

    setLoading(true);
    setError(null);
    setBrowserNotice(null);

    try {
      const user = await verifyGithubToken(token);
      setStoredGithubUser(user);
      onLoginSuccess(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // 快速免登录体验模式（演示/无网兜底）
  const handleDemoLogin = () => {
    const demoUser: GithubUser = {
      id: 88888888,
      login: "github-guest",
      name: "GitHub 体验用户",
      avatar_url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
      email: "guest@github.com",
      html_url: "https://github.com",
      loginAt: Date.now(),
    };
    setStoredGithubUser(demoUser);
    onLoginSuccess(demoUser);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#090d16] text-stone-100 select-none">
      {/* 1. 顶部全局可拖拽窗口标题栏与控制按钮（修复无边框窗口无法移动和无关闭按钮的严重 Bug） */}
      <div
        data-tauri-drag-region
        className="h-10 shrink-0 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-md px-4 flex items-center justify-between z-50 cursor-move"
      >
        <div className="flex items-center gap-2 pointer-events-none text-xs text-stone-400">
          <GithubIcon className="size-4 text-white" />
          <span className="font-semibold text-stone-200">JobKoi-AI · 全智能求职锦鲤助手</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            身份认证门禁
          </span>
        </div>

        {/* 标题栏中间大面积拖拽槽 */}
        <div data-tauri-drag-region className="flex-1 h-full cursor-move" />

        {/* 窗口右上角：最小化、最大化、关闭控制器 */}
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

      {/* 2. 主体居中容器（整体空白区支持直接拖动窗口） */}
      <div
        data-tauri-drag-region
        className="flex-1 overflow-y-auto flex items-center justify-center p-4 relative"
      >
        {/* 科技光晕装饰 */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[320px] bg-amber-500/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-12 right-1/4 w-[380px] h-[220px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

        {/* 登录/注册核心卡片 */}
        <div className="relative w-full max-w-lg rounded-3xl border border-stone-800 bg-[#0d1117]/95 shadow-2xl shadow-black/80 backdrop-blur-xl p-6 sm:p-8 space-y-5">
          {/* 品牌与欢迎语 */}
          <div className="flex flex-col items-center text-center space-y-2.5">
            <div className="size-14 rounded-2xl bg-stone-900 border border-stone-700/80 p-2.5 shadow-inner flex items-center justify-center text-white ring-4 ring-amber-500/10">
              <GithubIcon className="size-8 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-white">
                JobKoi-AI · 全智能求职锦鲤助手
              </h1>
              <p className="text-xs text-stone-400">
                本软件深度绑定 GitHub 开发者生态，请验证您的 GitHub 账号以解锁全站巡航
              </p>
            </div>
          </div>

          {/* 开源支持与 Star 解锁倡议卡片 */}
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Star className="size-4 fill-amber-400 text-amber-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-amber-200">开源支持 · 点亮 Star 免费解锁</h3>
                  <p className="text-[11px] text-stone-400">为作者官方仓库点亮 Star，尊享防封库即时更新</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleOpenBrowser(
                    "https://github.com/JonathanQUANLEE/JobKoi-AI",
                    "已在系统默认浏览器中打开 JobKoi-AI 仓库，为作者点亮 ⭐ Star 即可！"
                  )
                }
                className="py-1.5 px-3 text-xs flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 font-bold shadow-md shadow-amber-500/20 cursor-pointer transition-all shrink-0"
              >
                <Star className="size-3.5 fill-stone-950" />
                <span>点亮 Star ⭐</span>
              </button>
            </div>
          </div>

          {/* 顶部主切换 Tab：登录 / 注册 */}
          <div className="flex p-1 rounded-xl bg-stone-900/90 border border-stone-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setActiveTab("login");
                setError(null);
                setBrowserNotice(null);
              }}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "login"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <Lock className="size-3.5" />
              <span>GitHub 账号登录</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("register");
                setError(null);
                setBrowserNotice(null);
              }}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "register"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <Mail className="size-3.5" />
              <span>邮箱注册 GitHub (新用户)</span>
            </button>
          </div>

          {/* TAB 1: 登录界面 */}
          {activeTab === "login" && (
            <div className="space-y-4">
              {/* 登录子模式选择：推荐普通账号登录 / 高级 Token */}
              <div className="flex items-center justify-between text-[11px] text-stone-400 border-b border-stone-800/80 pb-2">
                <span className="font-semibold text-stone-300">
                  {loginMethod === "account" ? "快捷账号登录（推荐）" : "开发者令牌登录"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod(loginMethod === "account" ? "token" : "account");
                    setError(null);
                  }}
                  className="text-amber-400 hover:text-amber-300 underline cursor-pointer"
                >
                  {loginMethod === "account" ? "切换为 Token 登录" : "切换为用户名极速登录"}
                </button>
              </div>

              {loginMethod === "account" ? (
                /* 通用体验：直接输入 GitHub 用户名或邮箱，自动核验 */
                <form onSubmit={handleAccountLogin} className="space-y-3.5">
                  <div className="space-y-1.5 text-xs">
                    <label
                      htmlFor="github-account"
                      className="font-semibold text-stone-300 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="size-3.5 text-amber-400" />
                        <span>GitHub 用户名 或 注册邮箱</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenBrowser(
                            "https://github.com/login",
                            "已在系统默认浏览器中打开 GitHub 官网，您可查看您的用户名"
                          )
                        }
                        className="text-stone-400 hover:text-amber-300 flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        <Globe className="size-3" />
                        <span>在浏览器中打开 GitHub</span>
                      </button>
                    </label>

                    <input
                      id="github-account"
                      type="text"
                      value={accountInput}
                      onChange={(e) => {
                        setAccountInput(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="输入您的 GitHub 用户名（如: torvalds）或邮箱"
                      className="w-full rounded-xl bg-stone-950/80 border border-stone-800 px-3.5 py-2.5 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20"
                      disabled={loading}
                    />
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      💡 提示：无需创建复杂 Token，直接输入您在 GitHub 的用户名，软件即可自动读取您的身份并完成登入。
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <span className="size-3.5 rounded-full border-2 border-stone-950 border-t-transparent animate-spin" />
                        <span>正在校验 GitHub 账号...</span>
                      </>
                    ) : (
                      <>
                        <GithubIcon className="size-4 text-stone-950" />
                        <span>验证并进入软件</span>
                        <ArrowRight className="size-3.5" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* 开发者高级模式：Token 校验 */
                <form onSubmit={handleTokenLogin} className="space-y-3.5">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-stone-300">
                      <label htmlFor="github-token" className="font-semibold flex items-center gap-1.5">
                        <KeyRound className="size-3.5 text-amber-400" />
                        <span>GitHub 个人访问令牌 (Token)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenBrowser(
                            "https://github.com/settings/tokens/new?scopes=read:user,user:email&description=JobHunter%20Desktop",
                            "已在系统默认浏览器中打开 GitHub Token 生成页"
                          )
                        }
                        className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer text-[11px]"
                      >
                        <span>浏览器直达生成令牌</span>
                        <ExternalLink className="size-3" />
                      </button>
                    </div>

                    <input
                      id="github-token"
                      type="password"
                      value={tokenInput}
                      onChange={(e) => {
                        setTokenInput(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="粘贴您的 GitHub Token (ghp_... 或经典令牌)"
                      className="w-full rounded-xl bg-stone-950/80 border border-stone-800 px-3.5 py-2.5 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 font-mono"
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <span className="size-3.5 rounded-full border-2 border-stone-950 border-t-transparent animate-spin" />
                        <span>正在校验令牌...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="size-4 text-stone-950" />
                        <span>验证令牌并进入</span>
                        <ArrowRight className="size-3.5" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* 状态通知与错误反馈 */}
              {browserNotice && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs">
                  <Sparkles className="size-3.5 shrink-0 text-emerald-400" />
                  <span>{browserNotice}</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs">
                  <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* 辅助快捷入口 */}
              <div className="pt-2 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-800/80">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  <span>官方 API 身份核验</span>
                </span>
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="text-stone-400 hover:text-stone-200 underline cursor-pointer"
                >
                  免登录直接体验
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: 新用户注册指导与浏览器直通 */}
          {activeTab === "register" && (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-stone-200">
                  <Info className="size-4 text-amber-400" />
                  <span>全邮箱支持 · 官方注册直达</span>
                </div>
                <p className="text-stone-400 text-[11px] leading-relaxed">
                  GitHub 支持使用国内任何合规邮箱（
                  <span className="text-amber-300 font-semibold">
                    QQ 邮箱、网易 163 邮箱、企业邮、Gmail
                  </span>
                  ）免费注册。点击下方按钮即可直接在您的系统默认浏览器（Chrome/Edge）中直达注册页！
                </p>
              </div>

              {/* 4 步清晰注册指引 */}
              <div className="space-y-2">
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                  <span className="size-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-stone-200">打开官方注册页</p>
                    <p className="text-[11px] text-stone-400">
                      点击下方黄色按钮，系统将立即启动您的默认浏览器直达 GitHub 注册入口
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                  <span className="size-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-stone-200">输入 QQ / 163 邮箱与密码</p>
                    <p className="text-[11px] text-stone-400">
                      输入您的常用邮箱并设定安全密码，起一个属于自己的 GitHub 用户名
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                  <span className="size-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-stone-200">邮箱查收 6 位激活验证码</p>
                    <p className="text-[11px] text-stone-400">
                      前往您的 QQ 邮箱查看 GitHub 发送的激活码并在浏览器中填入
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                  <span className="size-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <p className="font-semibold text-stone-200">返回本软件直接输入用户名</p>
                    <p className="text-[11px] text-stone-400">
                      注册完成后，切回本软件「GitHub 账号登录」输入刚才的用户名即可秒进！
                    </p>
                  </div>
                </div>
              </div>

              {/* 关键直达按钮：使用 Python 后端 ShellExecute，100% 成功弹出浏览器 */}
              <button
                type="button"
                onClick={() =>
                  handleOpenBrowser(
                    "https://github.com/signup",
                    "已为您在默认浏览器中打开 GitHub 注册官网！请在浏览器中完成注册。"
                  )
                }
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                <ExternalLink className="size-4 text-stone-950" />
                <span>在系统默认浏览器中打开 GitHub 注册页面 (直达)</span>
              </button>

              {browserNotice && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs">
                  <Sparkles className="size-3.5 shrink-0 text-emerald-400" />
                  <span>{browserNotice}</span>
                </div>
              )}
            </div>
          )}

          {/* 底部信息 */}
          <div className="pt-2 text-center text-[11px] text-stone-500">
            <p>基于开源生态 · 仅核验公开资料 · 严格保护个人隐私</p>
          </div>
        </div>
      </div>
    </div>
  );
}
