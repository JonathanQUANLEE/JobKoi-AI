import {
  X,
  Settings,
  Clock,
  User,
  Palette,
  Keyboard,
  Bot,
  Info,
  Bell,
} from "lucide-react";
import { type Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import OptionWheel, { type OptionWheelItemData } from "./OptionWheel";
import GeneralTab from "./settings/tabs/GeneralTab";
import ScheduleTab from "./settings/tabs/ScheduleTab";
import ProfileTab from "./settings/tabs/ProfileTab";
import AppearanceTab from "./settings/tabs/AppearanceTab";
import ShortcutsTab from "./settings/tabs/ShortcutsTab";
import ModelTab from "./settings/tabs/ModelTab";
import NotificationsTab from "./settings/tabs/NotificationsTab";
import AboutTab from "./settings/tabs/AboutTab";
import { useSettingsModalState } from "./settings/useSettingsModalState";

export type SettingsTab =
  | "general"
  | "schedule"
  | "profile"
  | "appearance"
  | "shortcuts"
  | "model"
  | "notifications"
  | "about";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  lang: Lang;
  onSetLang: (lang: Lang) => void;
  usrName: string;
  setUsrName: (name: string) => void;
  label: string;
  defaultResumeName: string;
  onGoToResumes: () => void;
  onSaveConfig: () => Promise<void>;
  busy?: boolean;
}

export default function SettingsModal({
  isOpen,
  onClose,
  initialTab = "general",
  lang,
  onSetLang,
  usrName,
  setUsrName,
  label,
  defaultResumeName,
  onGoToResumes,
  onSaveConfig,
  busy = false,
}: SettingsModalProps) {
  const appTheme = useRunStore((s) => s.theme);
  const setAppTheme = useRunStore((s) => s.setTheme);
  const isMonochrome = appTheme === "monochrome";

  const {
    activeTab,
    setActiveTab,
    notifyOnMatch,
    setNotifyOnMatch,
    llmConfig,
    selectedPreset,
    apiKeyInput,
    setApiKeyInput,
    baseUrlInput,
    setBaseUrlInput,
    modelInput,
    setModelInput,
    modelStatusMsg,
    savedSuccess,
    auditLogs,
    setAuditLogs,
    logSearchQuery,
    setLogSearchQuery,
    logTypeFilter,
    setLogTypeFilter,
    handleSelectPreset,
    handleSaveModel,
    handleSaveAll,
  } = useSettingsModalState({
    isOpen,
    initialTab,
    onClose,
    onSaveConfig,
  });

  if (!isOpen) return null;

  const isEn = lang === "en";

  const tabItems: OptionWheelItemData[] = [
    {
      id: "general",
      label: isEn ? "General" : "通用设置",
      icon: <Settings className="size-4" />,
    },
    {
      id: "schedule",
      label: isEn ? "Scheduled Cruise" : "定时巡航系统",
      icon: <Clock className="size-4" />,
    },
    {
      id: "profile",
      label: isEn ? "Profile" : "个人主页",
      icon: <User className="size-4" />,
    },
    {
      id: "appearance",
      label: isEn ? "Appearance" : "外观主题",
      icon: <Palette className="size-4" />,
    },
    {
      id: "shortcuts",
      label: isEn ? "Shortcuts" : "快捷键一览",
      icon: <Keyboard className="size-4" />,
    },
    {
      id: "model",
      label: isEn ? "AI Model" : "AI 大模型",
      icon: <Bot className="size-4" />,
      badge: llmConfig?.configured ? (isEn ? "Configured" : "已配置") : (isEn ? "Unset" : "未配置"),
      badgeColor: llmConfig?.configured
        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/30"
        : "bg-stone-800 text-stone-400 border border-stone-700/40",
    },
    {
      id: "notifications",
      label: isEn ? "Audit Logs" : "操作记录与通知",
      icon: <Bell className="size-4" />,
      badge: auditLogs.length > 0 ? String(auditLogs.length) : undefined,
      badgeColor: isMonochrome
        ? "bg-white/10 text-zinc-300 border border-white/20"
        : "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    },
    {
      id: "about",
      label: isEn ? "About & Help" : "关于与帮助",
      icon: <Info className="size-4" />,
    },
  ];

  const activeTabIndex = Math.max(
    0,
    tabItems.findIndex((t) => t.id === activeTab)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col md:flex-row items-center md:items-stretch gap-5 sm:gap-7 w-full max-w-4xl max-h-[90vh] bg-stone-950/75 backdrop-blur-3xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl shadow-black/90 text-[var(--ink)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 背景氛围柔光 */}
        <div className={`absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl pointer-events-none ${isMonochrome ? "bg-white/[0.04]" : "bg-amber-500/[0.07]"}`} />
        <div className={`absolute -bottom-24 -left-24 w-80 h-80 rounded-full blur-3xl pointer-events-none ${isMonochrome ? "bg-white/[0.03]" : "bg-purple-500/[0.07]"}`} />

        {/* 左侧：纯粹悬浮 3D 轮盘导航 */}
        <aside className="w-full md:w-56 shrink-0 relative overflow-hidden h-44 md:h-[530px] flex items-center justify-center select-none border-b md:border-b-0 md:border-r border-white/5 pr-0 md:pr-4">
          <OptionWheel<OptionWheelItemData>
            items={tabItems}
            selected={activeTabIndex}
            onChange={(_idx, item) => {
              if (item?.id) setActiveTab(item.id as SettingsTab);
            }}
            side="right"
            activeColor={isMonochrome ? "#ffffff" : "#f59e0b"}
            textColor={isMonochrome ? "#a1a1aa" : undefined}
            fontSize={0.95}
            spacing={2.4}
            curve={1.1}
            tilt={7}
            blur={1.2}
            fade={0.28}
            minOpacity={0.18}
            smoothing={190}
            inset={14}
            loop={false}
            draggable={true}
            soundUrl="synth"
            soundVolume={0.35}
          />
        </aside>

        {/* 右侧主设置面板 */}
        <main className="flex-1 w-full flex flex-col min-w-0 h-[480px] md:h-[530px] overflow-hidden">
          {/* 顶栏标题与关闭按钮 */}
          <div className="flex items-center justify-between pb-3.5 border-b border-white/10 shrink-0">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span className={isMonochrome ? "text-white" : "text-amber-400"}>
                {activeTab === "general" && <Settings className="size-4" />}
                {activeTab === "schedule" && <Clock className="size-4" />}
                {activeTab === "profile" && <User className="size-4" />}
                {activeTab === "appearance" && <Palette className="size-4" />}
                {activeTab === "shortcuts" && <Keyboard className="size-4" />}
                {activeTab === "model" && <Bot className="size-4" />}
                {activeTab === "notifications" && <Bell className="size-4" />}
                {activeTab === "about" && <Info className="size-4" />}
              </span>
              <span>
                {activeTab === "general" && (isEn ? "General Settings" : "通用设置")}
                {activeTab === "schedule" && (isEn ? "Scheduled Cruise System" : "定时自动巡航系统")}
                {activeTab === "profile" && (isEn ? "User Profile" : "个人主页与求职者信息")}
                {activeTab === "appearance" && (isEn ? "Appearance & Theme" : "外观与显示主题")}
                {activeTab === "shortcuts" && (isEn ? "Keyboard Shortcuts" : "常用快捷键")}
                {activeTab === "model" && (isEn ? "AI Model Configuration" : "AI 大模型服务配置")}
                {activeTab === "notifications" && (isEn ? "Audit & Notification Logs" : "操作记录与通知日志")}
                {activeTab === "about" && (isEn ? "About JobHunter" : "关于与帮助支持")}
              </span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="关闭 (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 内容面板 */}
          <div className="pt-4 pr-1 space-y-6 text-xs flex-1 overflow-y-auto">
            {activeTab === "general" && (
              <GeneralTab
                notifyOnMatch={notifyOnMatch}
                setNotifyOnMatch={setNotifyOnMatch}
                isMonochrome={isMonochrome}
                busy={busy}
                savedSuccess={savedSuccess}
                onSaveAll={handleSaveAll}
              />
            )}

            {activeTab === "schedule" && (
              <ScheduleTab
                isMonochrome={isMonochrome}
                busy={busy}
              />
            )}

            {activeTab === "profile" && (
              <ProfileTab
                usrName={usrName}
                setUsrName={setUsrName}
                label={label}
                defaultResumeName={defaultResumeName}
                isMonochrome={isMonochrome}
                busy={busy}
                savedSuccess={savedSuccess}
                onClose={onClose}
                onGoToResumes={onGoToResumes}
                onSaveAll={handleSaveAll}
              />
            )}

            {activeTab === "appearance" && (
              <AppearanceTab
                isEn={isEn}
                appTheme={appTheme}
                setAppTheme={setAppTheme}
                lang={lang}
                onSetLang={onSetLang}
                isMonochrome={isMonochrome}
              />
            )}

            {activeTab === "shortcuts" && (
              <ShortcutsTab isEn={isEn} />
            )}

            {activeTab === "model" && (
              <ModelTab
                llmConfig={llmConfig}
                selectedPreset={selectedPreset}
                onSelectPreset={handleSelectPreset}
                baseUrlInput={baseUrlInput}
                setBaseUrlInput={setBaseUrlInput}
                apiKeyInput={apiKeyInput}
                setApiKeyInput={setApiKeyInput}
                modelInput={modelInput}
                setModelInput={setModelInput}
                modelStatusMsg={modelStatusMsg}
                isMonochrome={isMonochrome}
                onSaveModel={handleSaveModel}
              />
            )}

            {activeTab === "notifications" && (
              <NotificationsTab
                auditLogs={auditLogs}
                setAuditLogs={setAuditLogs}
                logSearchQuery={logSearchQuery}
                setLogSearchQuery={setLogSearchQuery}
                logTypeFilter={logTypeFilter}
                setLogTypeFilter={setLogTypeFilter}
                isMonochrome={isMonochrome}
              />
            )}

            {activeTab === "about" && (
              <AboutTab isMonochrome={isMonochrome} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
