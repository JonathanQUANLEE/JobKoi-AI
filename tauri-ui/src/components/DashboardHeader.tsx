import { FlaskConical, PanelLeftOpen, SlidersHorizontal, Minus, Square, X } from "lucide-react";
import type { Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import type { NavItem } from "./Sidebar";
import { ipc } from "../lib/ipc";

interface DashboardHeaderProps {
  sidebarCollapsed: boolean;
  expandRipple: boolean;
  onExpandSidebar: () => void;
  activeNav: NavItem;
  dryRun: boolean;
  running: boolean;
  statusText: string;
  lang: Lang;
  onOpenSettingsModal: (tab?: any) => void;
}

// 统一解析 Tauri 窗口句柄（优先使用全局 withGlobalTauri 句柄，回退动态引入）
async function getTauriWindow() {
  try {
    const tauri = (window as unknown as { __TAURI__?: { window?: { getCurrentWindow?: () => unknown } } }).__TAURI__;
    if (tauri?.window?.getCurrentWindow) {
      return tauri.window.getCurrentWindow() as {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        close: () => Promise<void>;
      };
    }
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch (err) {
    console.warn("Unable to acquire Tauri window handle:", err);
    return null;
  }
}

export default function DashboardHeader({
  sidebarCollapsed,
  expandRipple,
  onExpandSidebar,
  activeNav,
  dryRun,
  running,
  statusText,
  lang,
  onOpenSettingsModal,
}: DashboardHeaderProps) {
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");

  const handleMinimize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await ipc.windowMinimize();
    } catch {
      try {
        const win = await getTauriWindow();
        if (win) await win.minimize();
      } catch (err) {
        console.warn("Minimize error:", err);
      }
    }
  };

  const handleToggleMaximize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await ipc.windowToggleMaximize();
    } catch {
      try {
        const win = await getTauriWindow();
        if (win) await win.toggleMaximize();
      } catch (err) {
        console.warn("Maximize error:", err);
      }
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await ipc.windowClose();
    } catch {
      try {
        const win = await getTauriWindow();
        if (win) await win.close();
      } catch (err) {
        console.warn("Close error:", err);
      }
    }
  };

  return (
    <header className="h-12 shrink-0 border-b border-[var(--grid)] bg-[var(--sidebar-bg)]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20 select-none">
      {/* 左侧功能与面包屑区域 */}
      <div className="flex items-center gap-2 text-xs shrink-0">
        {/* WorkBuddy 风格：展开侧边栏入口按钮 */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={onExpandSidebar}
            className={`relative group flex items-center gap-1.5 rounded-lg border border-[var(--grid)] bg-[var(--panel-2)] hover:bg-[var(--panel-hover)] px-2.5 py-1 text-xs font-medium text-stone-200 shadow-sm transition-all cursor-pointer water-drop-btn mr-1.5 overflow-visible ${
              isMonochrome ? "hover:border-white/40 hover:text-white" : "hover:border-amber-500/50 hover:text-amber-400"
            }`}
            title={lang === "en" ? "Expand Sidebar (Ctrl+B)" : "展开侧边栏 (Ctrl+B)"}
          >
            {expandRipple && (
              <span className="pointer-events-none absolute inset-0 -m-3 flex items-center justify-center">
                <span className={`absolute h-8 w-8 rounded-full border animate-raindrop-1 ${isMonochrome ? "border-white/80 bg-white/20" : "border-amber-400/80 bg-amber-400/20"}`} />
                <span className="absolute h-8 w-8 rounded-full border border-cyan-400/70 bg-cyan-400/15 animate-raindrop-2" />
              </span>
            )}
            <PanelLeftOpen className={`h-3.5 w-3.5 group-hover:scale-110 transition-transform relative z-10 ${isMonochrome ? "text-white" : "text-amber-400"}`} />
            <span className="font-medium relative z-10">{lang === "en" ? "Expand" : "展开侧边栏"}</span>
            <span className="hidden md:inline-block text-[10px] text-stone-500 font-mono ml-0.5 relative z-10">
              Ctrl+B
            </span>
          </button>
        )}

        <span className="text-[var(--muted-fg)]">JobHunter</span>
        <span className="text-stone-600">/</span>
        <span className="font-semibold text-[var(--ink)]">
          {activeNav === "workbench" && (lang === "en" ? "Workbench" : "巡航工作台")}
          {activeNav === "profile" && (lang === "en" ? "Job Profile" : "求职画像")}
          {activeNav === "resumes" && (lang === "en" ? "Resume Vault" : "简历资料库")}
          {activeNav === "copilot" && (lang === "en" ? "Resume Polish" : "简历精修")}
          {activeNav === "analytics" && (lang === "en" ? "Analytics & Logs" : "投递数据与日志")}
        </span>
      </div>

      {/* 中间自由拖拽区（专用透明拖拽槽，绝不遮盖按钮点击） */}
      <div data-tauri-drag-region className="flex-1 h-full min-w-8 cursor-default" />

      {/* 右侧操作栏与窗口原生控制按钮 */}
      <div className="flex items-center gap-3 shrink-0 relative z-30">
        {dryRun && (
          <span className="flex items-center gap-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
            <FlaskConical className="h-3 w-3" />
            <span>{lang === "en" ? "Dry Run" : "演练模式"}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpenSettingsModal?.("general")}
          className={`btn-ghost !py-1 !px-2.5 text-xs flex items-center gap-1.5 rounded-lg border border-[var(--grid)] cursor-pointer transition-all ${
            isMonochrome
              ? "hover:border-white/50 text-zinc-200 hover:text-white"
              : "hover:border-amber-500/40 text-amber-400"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{lang === "en" ? "Settings" : "系统设置"}</span>
        </button>
        <span className={running ? "status-on" : "status-idle"}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              running ? "bg-emerald-400 animate-pulse" : "bg-stone-500"
            }`}
          />
          {statusText}
        </span>

        {/* Windows 现代化沉浸无边框窗口控制器（最小化、最大化、关闭） */}
        <div
          className="flex items-center ml-2 border-l border-[var(--grid)] pl-2 space-x-1 relative z-50 pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleMinimize}
            title="最小化窗口"
            aria-label="最小化"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-white/10 hover:text-white active:bg-white/20 transition-all cursor-pointer"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            title="最大化 / 还原"
            aria-label="最大化或还原"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-white/10 hover:text-white active:bg-white/20 transition-all cursor-pointer"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            title="关闭软件"
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-red-600 hover:text-white active:bg-red-700 transition-all cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
