import { useState } from "react";
import {
  KeyRound,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Mail,
  Sparkles,
  Lock,
  ArrowRight,
  Info,
} from "lucide-react";
import { verifyGithubToken, setStoredGithubUser, type GithubUser } from "../../lib/githubAuth";

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
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openUrl = (url: string) => {
    try {
      window.open(url, "_blank");
    } catch {
      // fallback
    }
  };

  const handleTokenLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const token = tokenInput.trim();
    if (!token) {
      setError("请输入您的 GitHub 访问令牌 (Personal Access Token 或 OAuth Token)");
      return;
    }

    setLoading(true);
    setError(null);

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

  // 快速体验登录（针对离线环境或演示测试）
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090d16] text-stone-100 p-4 select-none overflow-y-auto">
      {/* 科技感背景光晕 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[360px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[250px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-lg rounded-3xl border border-stone-800 bg-[#0d1117]/95 shadow-2xl shadow-black/80 backdrop-blur-xl p-6 sm:p-8 space-y-6">
        {/* 顶部品牌与标题 */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="size-16 rounded-2xl bg-stone-900 border border-stone-700/80 p-3 shadow-inner flex items-center justify-center text-white ring-4 ring-amber-500/10">
            <GithubIcon className="size-10 text-white" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                JobHunter · 求职锦鲤助手
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                PRO
              </span>
            </div>
            <p className="text-xs text-stone-400 max-w-sm">
              基于 GitHub 账号体系构建的专属求职智能管家平台，登录以激活全站巡航
            </p>
          </div>
        </div>

        {/* 切换 Tab：登录 / 注册 */}
        <div className="flex p-1 rounded-xl bg-stone-900/90 border border-stone-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setActiveTab("login");
              setError(null);
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
            }}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "register"
                ? "bg-amber-500 text-stone-950 font-bold shadow"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <Mail className="size-3.5" />
            <span>邮箱注册 GitHub 账号</span>
          </button>
        </div>

        {/* TAB 1: GitHub 登录 */}
        {activeTab === "login" && (
          <form onSubmit={handleTokenLogin} className="space-y-4">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-stone-300">
                <label htmlFor="github-token" className="font-semibold flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-amber-400" />
                  <span>GitHub 访问令牌 (Token)</span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    openUrl(
                      "https://github.com/settings/tokens/new?scopes=read:user,user:email&description=JobHunter%20Desktop"
                    )
                  }
                  className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span>10秒生成令牌</span>
                  <ExternalLink className="size-3" />
                </button>
              </div>

              <div className="relative">
                <input
                  id="github-token"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="粘贴您的 GitHub Token (例如: ghp_... 或经典 Token)"
                  className="w-full rounded-xl bg-stone-950/80 border border-stone-800 px-3.5 py-2.5 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 font-mono"
                  disabled={loading}
                />
              </div>
              <p className="text-[11px] text-stone-500 leading-normal">
                提示：本客户端仅读取您的公开头像与用户名以核验使用者身份，无需多余写入权限。
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs">
                <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="size-3.5 rounded-full border-2 border-stone-950 border-t-transparent animate-spin" />
                  <span>正在验证 GitHub 身份...</span>
                </>
              ) : (
                <>
                  <GithubIcon className="size-4 text-stone-950" />
                  <span>验证并登录软件</span>
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </button>

            {/* 辅助通道 */}
            <div className="pt-2 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-800/80">
              <span className="flex items-center gap-1">
                <ShieldCheck className="size-3.5 text-emerald-400" />
                <span>官方 OAuth API 安全加密校验</span>
              </span>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="text-stone-400 hover:text-stone-200 underline cursor-pointer"
              >
                免登录体验模式
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: GitHub 注册引导 */}
        {activeTab === "register" && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-stone-200">
                <Info className="size-4 text-amber-400" />
                <span>符合 GitHub 规范的邮箱注册流程</span>
              </div>
              <p className="text-stone-400 text-[11px] leading-relaxed">
                GitHub 官方支持国内包括 <span className="text-amber-300 font-semibold">QQ 邮箱、163 邮箱、网易企业邮、Gmail</span> 等任何标准邮箱直接注册。
              </p>
            </div>

            {/* 4 步注册指引 */}
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                <span className="size-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <p className="font-semibold text-stone-200">准备常用邮箱</p>
                  <p className="text-[11px] text-stone-400">输入您的 QQ 邮箱或网易 163 邮箱，设置登录密码</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                <span className="size-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <p className="font-semibold text-stone-200">完成安全人机验证</p>
                  <p className="text-[11px] text-stone-400">按照 GitHub 页面指引完成简单的图形验证</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                <span className="size-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <p className="font-semibold text-stone-200">查收邮箱 6 位验证码</p>
                  <p className="text-[11px] text-stone-400">前往您的 QQ 邮箱查收来自 GitHub 的激活码并输入</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-900/50 border border-stone-800/80">
                <span className="size-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <p className="font-semibold text-stone-200">返回本软件登录</p>
                  <p className="text-[11px] text-stone-400">注册完成后切换至「登录」页，即刻进入工作台</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openUrl("https://github.com/signup")}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <ExternalLink className="size-4" />
              <span>前往 GitHub 官方注册新账号 (浏览器直达)</span>
            </button>
          </div>
        )}

        {/* 底部安全承诺 */}
        <div className="pt-2 text-center text-[11px] text-stone-500">
          <p>仅支持 GitHub 官方认证通道 · 个人隐私严格保护</p>
        </div>
      </div>
    </div>
  );
}
