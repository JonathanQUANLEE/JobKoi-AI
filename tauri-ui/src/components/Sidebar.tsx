import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Compass,
  Globe,
  FolderOpen,
  Bot,
  BarChart3,
  Play,
  Square,
  SlidersHorizontal,
  ShieldCheck,
  MessageSquareQuote,
  ExternalLink,
  RefreshCw,
  Languages,
  MoreVertical,
  PanelLeftClose,
  UserCheck,
} from "lucide-react";
import { LANGS, type Lang } from "../lib/i18n";

export type NavItem = "workbench" | "profile" | "resumes" | "copilot" | "analytics";

interface SidebarProps {
  activeNav: NavItem;
  onSelectNav: (nav: NavItem) => void;
  running: boolean;
  onStartRun: () => void;
  onStopRun: () => void;
  busy: boolean;
  onOpenSettings: (tab?: "rules" | "policy" | "greeting" | "basic" | "model") => void;
  onOpenBrowser: () => void;
  onResetBrowser: () => void;
  lang: Lang;
  onSetLang: (lang: Lang) => void;
  dailySentCount: number;
  dailyLimit: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({
  activeNav,
  onSelectNav,
  running,
  onStartRun,
  onStopRun,
  busy,
  onOpenSettings,
  onOpenBrowser,
  onResetBrowser,
  lang,
  onSetLang,
  dailySentCount,
  dailyLimit,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapseRipple, setCollapseRipple] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCollapseClick = () => {
    setCollapseRipple(true);
    setTimeout(() => setCollapseRipple(false), 750);
    onToggleCollapse?.();
  };

  // 点击外部关闭弹出的设置菜单 (WorkBuddy 交互)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <aside
      className={`relative flex h-screen shrink-0 flex-col border-r border-[var(--grid)] bg-[#141210] select-none z-30 water-fluid-sidebar overflow-hidden ${
        collapsed
          ? "w-0 opacity-0 -translate-x-6 blur-[2px] border-r-0 pointer-events-none"
          : "w-60 opacity-100 translate-x-0 blur-0"
      }`}
    >
      {/* 水面张力微光光晕边线 */}
      <div className="absolute top-0 right-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-amber-400/25 via-cyan-400/20 to-transparent pointer-events-none z-40" />

      {/* 内部固定宽度容器，防止侧边栏展开/收起时内容被挤压变形 */}
      <div className="w-60 min-w-[15rem] h-full flex flex-col justify-between overflow-hidden">
        {/* 顶部 Logo 与品牌标 + 收起侧边栏按钮 */}
        <div className="flex items-center justify-between px-3.5 py-3.5 border-b border-[var(--grid)]/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <img
                src="/favicon.png"
                alt="JobHunter Bunny"
                className="h-8 w-8 rounded-xl object-cover shadow-md shadow-pink-500/20 border border-pink-400/40"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#141210]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-[var(--ink)]">JobHunter</span>
                <span className="rounded bg-pink-500/15 border border-pink-500/30 px-1 py-0.2 text-[9px] font-semibold text-pink-300">
                  Offer版
                </span>
              </div>
              <p className="text-[10px] text-[var(--muted-fg)] truncate">全平台智能求职助手</p>
            </div>
          </div>

          {/* 收起侧边栏按钮 (雨滴滴入河面同心水波涟漪动效) */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={handleCollapseClick}
              className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-transparent hover:border-[var(--grid)] text-stone-400 hover:text-stone-200 hover:bg-[#1f1c19] active:scale-95 transition-all ml-1 shrink-0 cursor-pointer overflow-visible"
              title="收起侧边栏 (Ctrl+B)"
              aria-label="收起侧边栏"
            >
              {collapseRipple && (
                <span className="pointer-events-none absolute inset-0 -m-3 flex items-center justify-center">
                  <span className="absolute h-8 w-8 rounded-full border border-amber-400/80 bg-amber-400/20 animate-raindrop-1" />
                  <span className="absolute h-8 w-8 rounded-full border border-cyan-400/70 bg-cyan-400/15 animate-raindrop-2" />
                </span>
              )}
              <PanelLeftClose className="h-4 w-4 relative z-10" />
            </button>
          )}
        </div>

      {/* 快捷主按钮：启动 / 停止巡航 */}
      <div className="p-3">
        {!running ? (
          <button
            type="button"
            onClick={onStartRun}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2.5 text-xs font-bold text-stone-950 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Play className="h-4 w-4 fill-current" />
            启动自动巡航
          </button>
        ) : (
          <button
            type="button"
            onClick={onStopRun}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-red-600/30 hover:from-red-500 hover:to-red-600 active:scale-[0.98] transition-all disabled:opacity-50 animate-pulse"
          >
            <Square className="h-4 w-4 fill-current" />
            停止当前巡航
          </button>
        )}
      </div>

      {/* 导航菜单列表（统一 Lucide 图标规范） */}
      <nav className="flex-1 space-y-1 px-2.5 py-1 text-xs overflow-y-auto">
        <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
          功能模块
        </div>

        <NavItemButton
          active={activeNav === "workbench"}
          onClick={() => onSelectNav("workbench")}
          icon={<Compass className="h-4 w-4 shrink-0" />}
          label="巡航工作台"
          badge={running ? "运行中" : undefined}
          badgeColor="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
        />

        <NavItemButton
          active={activeNav === "profile"}
          onClick={() => onSelectNav("profile")}
          icon={<UserCheck className="h-4 w-4 shrink-0" />}
          label="求职画像"
          badge="已同步"
          badgeColor="bg-amber-500/15 text-amber-400 border border-amber-500/30"
        />

        <NavItemButton
          active={activeNav === "resumes"}
          onClick={() => onSelectNav("resumes")}
          icon={<FolderOpen className="h-4 w-4 shrink-0" />}
          label="简历资料库"
        />

        <NavItemButton
          active={activeNav === "copilot"}
          onClick={() => onSelectNav("copilot")}
          icon={<Bot className="h-4 w-4 shrink-0" />}
          label="AI 意向助理"
        />

        <NavItemButton
          active={activeNav === "analytics"}
          onClick={() => onSelectNav("analytics")}
          icon={<BarChart3 className="h-4 w-4 shrink-0" />}
          label="投递数据与日志"
        />
      </nav>

      {/* 左下角用户与设置菜单触发器（WorkBuddy 架构） */}
      <div className="relative border-t border-[var(--grid)]/80 p-2.5 bg-[#100e0d]" ref={menuRef}>
        {/* 向上滑出的弹出菜单 (Popover Menu) */}
        {menuOpen && (
          <div className="absolute bottom-16 left-2 right-2 rounded-2xl border border-[var(--grid)] bg-[#1a1816] p-3 shadow-2xl backdrop-blur-md z-50 text-xs space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* 用户状态徽章 */}
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--grid)]">
              <img
                src="/favicon.png"
                alt="Avatar"
                className="h-8 w-8 rounded-lg object-cover border border-pink-400/30"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--ink)]">求职锦鲤</span>
                  <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.2 rounded bg-amber-500/15">
                    尊享版
                  </span>
                </div>
                <div className="text-[10px] text-[var(--muted-fg)] mt-0.5">
                  今日额度: {dailySentCount}/{dailyLimit}
                </div>
              </div>
            </div>

            {/* 功能选项列表（统一 Lucide 图标） */}
            <div className="space-y-1">
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-stone-300 hover:bg-[var(--panel-2)] hover:text-amber-400 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings("rules");
                }}
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-stone-400" />
                  <span>过滤规则设置</span>
                </span>
                <span className="text-[10px] text-stone-500 font-mono">Ctrl+,</span>
              </button>

              <button
                type="button"
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-stone-300 hover:bg-[var(--panel-2)] hover:text-amber-400 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings("policy");
                }}
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-stone-400" />
                  <span>拟人延时与风控</span>
                </span>
              </button>

              <button
                type="button"
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-stone-300 hover:bg-[var(--panel-2)] hover:text-amber-400 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings("greeting");
                }}
              >
                <span className="flex items-center gap-2">
                  <MessageSquareQuote className="h-3.5 w-3.5 text-stone-400" />
                  <span>打招呼文本模板</span>
                </span>
              </button>

              <button
                type="button"
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-stone-300 hover:bg-[var(--panel-2)] hover:text-amber-400 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings("model");
                }}
              >
                <span className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-stone-400" />
                  <span>AI 模型配置 (ZCode)</span>
                </span>
              </button>

              <button
                type="button"
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-stone-300 hover:bg-[var(--panel-2)] hover:text-amber-400 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenBrowser();
                }}
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="h-3.5 w-3.5 text-stone-400" />
                  <span>手动打开调试浏览器</span>
                </span>
              </button>

              <button
                type="button"
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-stone-300 hover:bg-[var(--panel-2)] hover:text-red-400 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onResetBrowser();
                }}
              >
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 text-red-400" />
                  <span>重置浏览器数据</span>
                </span>
              </button>
            </div>

            {/* 语言切换 */}
            <div className="pt-2 border-t border-[var(--grid)] flex items-center justify-between text-[11px] text-[var(--muted-fg)]">
              <span className="flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5 text-stone-400" />
                <span>界面语言</span>
              </span>
              <div className="flex gap-1">
                {LANGS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onSetLang(item.value)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                      lang === item.value
                        ? "bg-amber-500 text-stone-950 font-bold"
                        : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 底部用户卡片按钮 */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-full flex items-center justify-between rounded-xl p-2 hover:bg-[#1f1c19] active:scale-[0.98] transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/favicon.png"
              alt="Avatar"
              className="h-7 w-7 rounded-lg object-cover border border-pink-400/30"
            />
            <div className="min-w-0 text-left">
              <div className="font-semibold text-xs text-[var(--ink)] truncate">求职锦鲤</div>
              <div className="text-[10px] text-stone-400 flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
                {running ? "巡航中" : "就绪"}
              </div>
            </div>
          </div>
          <div className="text-stone-400 hover:text-stone-200 p-1">
            <MoreVertical className="h-4 w-4" />
          </div>
        </button>
      </div>
      </div>
    </aside>
  );
}

function NavItemButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 font-medium transition-all text-left ${
        active
          ? "bg-[#25211c] text-amber-400 font-semibold shadow-sm border border-amber-500/20"
          : "text-stone-400 hover:bg-[#1a1714] hover:text-stone-200"
      }`}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span className="text-stone-400 group-hover:text-stone-200">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {badge && (
        <span className={`rounded px-1.5 py-0.2 text-[9px] font-semibold ${badgeColor || "bg-stone-800 text-stone-300"}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
