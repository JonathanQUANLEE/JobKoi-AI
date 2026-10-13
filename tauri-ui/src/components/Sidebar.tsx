import { useState, useRef, useEffect } from "react";
import {
  Compass,
  FolderOpen,
  TrendingUp,
  Play,
  Square,
  PanelLeftClose,
  UserCheck,
  Sparkles,
  Clock,
  MoreVertical,
  Radio,
  Bot,
} from "lucide-react";
import { translate, type Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import PillNavButton from "./core/PillNavButton";
import NotificationDock from "./NotificationDock";
import DepthText from "./core/DepthText";
import NavItemButton from "./sidebar/NavItemButton";
import SidebarTimeWidget from "./sidebar/SidebarTimeWidget";
import SidebarUserMenu from "./sidebar/SidebarUserMenu";

export type NavItem = "workbench" | "profile" | "resumes" | "polish" | "copilot" | "analytics" | "live";

interface SidebarProps {
  activeNav: NavItem;
  onSelectNav: (nav: NavItem) => void;
  running: boolean;
  onStartRun: () => void;
  onStopRun: () => void;
  busy: boolean;
  onOpenSettings: (tab?: "rules" | "policy" | "greeting" | "basic" | "model") => void;
  onOpenSettingsModal?: (tab?: any) => void;
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
  onOpenSettingsModal,
  onOpenBrowser,
  onResetBrowser,
  lang,
  onSetLang,
  dailySentCount,
  dailyLimit,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const [menuOpen, setMenuOpen] = useState(false);
  const [collapseRipple, setCollapseRipple] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isMonochrome = useRunStore((s) => s.theme === "monochrome");

  const handleCollapseClick = () => {
    setCollapseRipple(true);
    setTimeout(() => setCollapseRipple(false), 750);
    onToggleCollapse?.();
  };

  // 点击外部关闭弹出的设置菜单
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
      className={`relative flex h-screen shrink-0 flex-col border-r border-[var(--grid)] bg-[var(--sidebar-bg)] select-none z-30 water-fluid-sidebar overflow-hidden ${
        collapsed
          ? "w-0 opacity-0 -translate-x-6 blur-[2px] border-r-0 pointer-events-none"
          : "w-60 opacity-100 translate-x-0 blur-0"
      }`}
    >
      {/* 水面张力微光光晕边线 */}
      <div
        className={`absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-40 ${
          isMonochrome
            ? "bg-gradient-to-b from-transparent via-white/20 via-zinc-400/15 to-transparent"
            : "bg-gradient-to-b from-transparent via-amber-400/25 via-cyan-400/20 to-transparent"
        }`}
      />

      {/* 内部固定宽度容器，防止侧边栏展开/收起时内容被挤压变形 */}
      <div className="w-60 min-w-[15rem] h-full flex flex-col justify-between overflow-hidden">
        {/* 顶部 Logo 与品牌标 + 收起侧边栏按钮 */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between px-3.5 py-3.5 border-b border-[var(--grid)]/60 shrink-0 select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <img
                src="/favicon.png"
                alt="JobKoi-AI Logo"
                className="h-8 w-8 rounded-xl object-cover shadow-md shadow-amber-500/20 border border-amber-400/40"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[var(--sidebar-bg)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <DepthText
                  text="JobKoi-AI"
                  layers={14}
                  depth={1.4}
                  faceColor={isMonochrome ? "#f4f4f5" : "#fbbf24"}
                  depthColor={isMonochrome ? "#3f3f46" : "#b45309"}
                  fontSize="13px"
                  fontWeight={900}
                  tilt={6}
                  pointerTracking={true}
                  shadow={true}
                />
                <span
                  className={`rounded border px-1 py-0.2 text-[9px] font-semibold ${
                    isMonochrome
                      ? "bg-white/10 border-white/25 text-zinc-200"
                      : "bg-pink-500/15 border-pink-500/30 text-pink-300"
                  }`}
                >
                  {t("sidebar.proTag")}
                </span>
              </div>
              <p className="text-[10px] text-[var(--muted-fg)] truncate">
                {t("sidebar.subtitle")}
              </p>
            </div>
          </div>

          {/* 收起侧边栏按钮 */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={handleCollapseClick}
              className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-transparent hover:border-[var(--grid)] text-stone-400 hover:text-stone-200 hover:bg-[var(--panel-hover)] active:scale-95 transition-all ml-1 shrink-0 cursor-pointer overflow-visible"
              title={t("sidebar.collapseTitle")}
              aria-label={t("sidebar.collapseLabel")}
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
            <PillNavButton
              onClick={onStartRun}
              disabled={busy}
              variant="primary"
              icon={<Play className="h-4 w-4 fill-current shrink-0" />}
              label={t("sidebar.startCruise")}
            />
          ) : (
            <button
              type="button"
              onClick={onStopRun}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-red-600/30 hover:from-red-500 hover:to-red-600 active:scale-[0.98] transition-all disabled:opacity-50 animate-pulse cursor-pointer"
            >
              <Square className="h-4 w-4 fill-current shrink-0" />
              <span>{t("sidebar.stopCruise")}</span>
            </button>
          )}
        </div>

        {/* 导航菜单列表 */}
        <nav className="flex-1 space-y-1 px-2.5 py-1 text-xs overflow-y-auto">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            {t("sidebar.navigation")}
          </div>

          <NavItemButton
            active={activeNav === "workbench"}
            onClick={() => onSelectNav("workbench")}
            icon={<Compass className="h-4 w-4 shrink-0" />}
            label={t("sidebar.nav.workbench")}
            badge={running ? t("sidebar.nav.workbenchBadge") : undefined}
            badgeColor="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          />

          <NavItemButton
            active={activeNav === "profile"}
            onClick={() => onSelectNav("profile")}
            icon={<UserCheck className="h-4 w-4 shrink-0" />}
            label={t("sidebar.nav.profile")}
            badge={t("sidebar.nav.profileBadge")}
            badgeColor="bg-amber-500/15 text-amber-400 border border-amber-500/30"
          />

          <NavItemButton
            active={activeNav === "resumes"}
            onClick={() => onSelectNav("resumes")}
            icon={<FolderOpen className="h-4 w-4 shrink-0" />}
            label={t("sidebar.nav.resumes")}
          />

          <NavItemButton
            active={activeNav === "polish"}
            onClick={() => onSelectNav("polish")}
            icon={
              <Sparkles
                className={`h-4 w-4 shrink-0 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`}
              />
            }
            label={t("sidebar.nav.polish")}
            badge={t("sidebar.nav.polishBadge")}
            badgeColor={
              isMonochrome
                ? "bg-white/10 text-zinc-300 border border-white/20"
                : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
            }
          />

          <NavItemButton
            active={activeNav === "copilot"}
            onClick={() => onSelectNav("copilot")}
            icon={
              <Bot
                className={`h-4 w-4 shrink-0 ${isMonochrome ? "text-zinc-300" : "text-purple-400"}`}
              />
            }
            label={t("sidebar.nav.copilot")}
            badge={t("sidebar.nav.copilotBadge")}
            badgeColor={
              isMonochrome
                ? "bg-white/10 text-zinc-300 border border-white/20"
                : "bg-purple-500/15 text-purple-300 border border-purple-500/30"
            }
          />

          <NavItemButton
            active={activeNav === "analytics"}
            onClick={() => onSelectNav("analytics")}
            icon={
              <TrendingUp
                className={`h-4 w-4 shrink-0 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`}
              />
            }
            label={t("sidebar.nav.analytics")}
          />

          <NavItemButton
            active={activeNav === "live"}
            onClick={() => onSelectNav("live")}
            icon={
              <Radio
                className={`h-4 w-4 shrink-0 ${running ? "text-emerald-300" : isMonochrome ? "text-zinc-300" : "text-amber-400"}`}
              />
            }
            label={t("sidebar.nav.live")}
            badge={running ? t("sidebar.nav.liveBadge") : undefined}
            badgeColor="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          />
        </nav>

        {/* 侧边栏专属联动通知坞 */}
        <NotificationDock />

        {/* 侧边栏特助快捷定时与归位基站 */}
        <div className="px-3 py-2 shrink-0 select-none">
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]/60 text-xs text-stone-300">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 text-sm">🐰</span>
              <span className="text-[11px] font-semibold text-stone-200">
                {t("sidebar.usagi")}
              </span>
              <span className="text-[9px] text-stone-500 font-normal">
                {t("sidebar.usagiDock")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenSettingsModal?.("schedule")}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-800 hover:bg-stone-700 text-amber-300 cursor-pointer transition-colors"
              title={t("sidebar.scheduleTitle")}
            >
              <Clock className="h-3 w-3" />
              <span>{t("sidebar.schedule")}</span>
            </button>
          </div>
        </div>

        {/* 左下角用户与设置菜单触发器 */}
        <div
          className="relative border-t border-[var(--grid)]/80 p-2.5 bg-[var(--sidebar-bg)]"
          ref={menuRef}
        >
          {menuOpen && (
            <SidebarUserMenu
              onClose={() => setMenuOpen(false)}
              onOpenSettingsModal={onOpenSettingsModal}
              onOpenSettings={onOpenSettings}
              onOpenBrowser={onOpenBrowser}
              onResetBrowser={onResetBrowser}
              lang={lang}
              onSetLang={onSetLang}
              isMonochrome={isMonochrome}
            />
          )}

          {/* 当前北京时间实时显示槽 */}
          <SidebarTimeWidget lang={lang} isMonochrome={isMonochrome} />

          {/* 底部用户卡片按钮 */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-full flex items-center justify-between rounded-xl p-2 hover:bg-[var(--panel-hover)] active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/favicon.png"
                alt="Avatar"
                className="h-8 w-8 rounded-lg object-cover border border-pink-400/30 shrink-0 shadow-sm"
              />
              <div className="min-w-0 text-left">
                <div className="font-semibold text-xs text-[var(--ink)] truncate leading-tight">
                  {t("sidebar.userName")}
                </div>
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/70 px-2 py-0.5 shadow-sm">
                  <span className="relative flex size-1.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#10b981]" />
                  </span>
                  <span className="text-[10px] font-medium text-emerald-300 leading-none truncate tracking-tight">
                    {running
                      ? t("sidebar.statusCruising")
                      : t("sidebar.statusOnline")}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-stone-400 hover:text-stone-200 p-1 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
}
