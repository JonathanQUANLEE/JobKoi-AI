import { useState, useEffect } from "react";
import {
  X,
  Settings,
  User,
  Palette,
  Keyboard,
  Bot,
  Info,
  Check,
  Save,
  Languages,
  Moon,
  Sun,
  Laptop,
  FileText,
  ExternalLink,
  ShieldCheck,
  Bell,
  Contrast,
  Sparkles,
} from "lucide-react";
import { LANGS, type Lang } from "../lib/i18n";
import { ipc, type LLMConfig, type LLMPreset } from "../lib/ipc";
import { useRunStore } from "../store";
import OptionWheel, { type OptionWheelItemData } from "./OptionWheel";

export type SettingsTab = "general" | "profile" | "appearance" | "shortcuts" | "model" | "about";

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
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Appearance state - synced with global store
  const appTheme = useRunStore((s) => s.theme);
  const setAppTheme = useRunStore((s) => s.setTheme);
  const isMonochrome = appTheme === "monochrome";

  // General settings
  const [notifyOnMatch, setNotifyOnMatch] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Model settings
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("deepseek");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("https://api.deepseek.com");
  const [modelInput, setModelInput] = useState("deepseek-chat");
  const [modelStatusMsg, setModelStatusMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Load LLM Config
  useEffect(() => {
    if (isOpen) {
      ipc.getLLMConfig().then((cfg) => {
        setLlmConfig(cfg);
        if (cfg.base_url) setBaseUrlInput(cfg.base_url);
        if (cfg.model) setModelInput(cfg.model);
        if (cfg.configured && cfg.api_key) setApiKeyInput(cfg.api_key);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (p: LLMPreset) => {
    setSelectedPreset(p.id);
    setBaseUrlInput(p.base_url);
    setModelInput(p.default_model);
  };

  const handleSaveModel = async () => {
    setModelStatusMsg(null);
    try {
      const res = await ipc.saveLLMConfig(
        baseUrlInput.trim(),
        apiKeyInput.trim(),
        modelInput.trim(),
      );
      if (res.status === "ok") {
        setModelStatusMsg("AI 模型配置已成功保存！");
        setTimeout(() => setModelStatusMsg(null), 3000);
      } else {
        setModelStatusMsg(`保存提示: ${res.status}`);
      }
    } catch (err) {
      setModelStatusMsg(`保存失败: ${String(err)}`);
    }
  };

  const handleSaveAll = async () => {
    await onSaveConfig();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const isEn = lang === "en";

  const tabItems: OptionWheelItemData[] = [
    {
      id: "general",
      label: isEn ? "General" : "通用设置",
      icon: <Settings className="size-4" />,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col md:flex-row items-center md:items-stretch gap-4 sm:gap-6 w-full max-w-4xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左侧：纯粹悬浮 3D 轮盘导航（完全去除方框、去除冗余标题与边框，纯净选项自由悬浮） */}
        <aside className="w-full md:w-56 shrink-0 relative overflow-hidden h-44 md:h-[540px] flex items-center justify-center select-none">
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

        {/* 右侧：独立浮岛 主设置内容区 */}
        <main className="flex-1 w-full flex flex-col min-w-0 bg-[var(--panel)]/95 backdrop-blur-xl border border-[var(--grid)] rounded-2xl shadow-2xl shadow-black/80 overflow-hidden h-[480px] md:h-[580px] text-[var(--ink)]">
          {/* 顶栏关闭按钮 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--grid)]/70 shrink-0 bg-[var(--panel-2)]/50">
            <h2 className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
              <span className={isMonochrome ? "text-white" : "text-amber-400"}>
                {activeTab === "general" && <Settings className="size-4" />}
                {activeTab === "profile" && <User className="size-4" />}
                {activeTab === "appearance" && <Palette className="size-4" />}
                {activeTab === "shortcuts" && <Keyboard className="size-4" />}
                {activeTab === "model" && <Bot className="size-4" />}
                {activeTab === "about" && <Info className="size-4" />}
              </span>
              <span>
                {activeTab === "general" && (isEn ? "General Settings" : "通用设置")}
                {activeTab === "profile" && (isEn ? "User Profile" : "个人主页与求职者信息")}
                {activeTab === "appearance" && (isEn ? "Appearance & Theme" : "外观与显示主题")}
                {activeTab === "shortcuts" && (isEn ? "Keyboard Shortcuts" : "常用快捷键")}
                {activeTab === "model" && (isEn ? "AI Model Configuration" : "AI 大模型服务配置")}
                {activeTab === "about" && (isEn ? "About JobHunter" : "关于与帮助支持")}
              </span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              title="关闭 (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 内容面板 */}
          <div className="p-6 space-y-6 text-xs flex-1 overflow-y-auto">
            {/* 1. 通用设置 */}
            {activeTab === "general" && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="font-semibold text-stone-200 text-xs">消息与提醒</h3>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
                      <div className="flex items-center gap-2.5">
                        <Bell className={`size-4 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
                        <div>
                          <div className="font-medium text-stone-200">命中满意岗位时系统提示</div>
                          <div className="text-[10px] text-stone-500">巡航筛选出匹配岗位时在右下角发出气泡提醒</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifyOnMatch}
                        onChange={(e) => setNotifyOnMatch(e.target.checked)}
                        className={`rounded size-4 cursor-pointer ${isMonochrome ? "accent-white" : "accent-amber-500"}`}
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="size-4 text-emerald-400" />
                        <div>
                          <div className="font-medium text-stone-200">智能防封风控保护</div>
                          <div className="text-[10px] text-stone-500">自动开启拟人浏览保护，模拟真实人类操作</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30">
                        始终开启
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--grid)] flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={busy}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                      isMonochrome
                        ? "bg-white hover:bg-zinc-200 text-black shadow-md shadow-white/10"
                        : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/20"
                    }`}
                  >
                    {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
                    <span>{savedSuccess ? "已保存" : "保存通用设置"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. 个人主页 */}
            {activeTab === "profile" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                    您的称呼 / 昵称
                  </label>
                  <input
                    type="text"
                    value={usrName}
                    onChange={(e) => setUsrName(e.target.value)}
                    placeholder="例如：小李 / Alex"
                    className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none"
                  />
                  <p className="text-[10px] text-stone-500 mt-1">仅存储在本地设备，用于打招呼时称呼与会话归档</p>
                </div>

                <div>
                  <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                    当前主要求职目标
                  </label>
                  <input
                    type="text"
                    disabled
                    value={label || "尚未在工作台指定岗位"}
                    className="w-full rounded-xl border border-[var(--grid)] bg-stone-900/40 px-3 py-2 text-xs text-stone-400 opacity-80"
                  />
                  <p className="text-[10px] text-stone-500 mt-1">可在工作台或求职画像中随时与大模型更新</p>
                </div>

                <div className="pt-2 border-t border-[var(--grid)]">
                  <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                    默认投递简历文件
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className={`size-4 shrink-0 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
                      <span className="font-medium text-stone-200 truncate">{defaultResumeName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onGoToResumes();
                      }}
                      className={`hover:underline flex items-center gap-1 text-[11px] shrink-0 ml-2 cursor-pointer ${
                        isMonochrome ? "text-zinc-300 hover:text-white" : "text-amber-400"
                      }`}
                    >
                      <span>前往简历库更换</span>
                      <ExternalLink className="size-3" />
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--grid)] flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={busy}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                      isMonochrome
                        ? "bg-white hover:bg-zinc-200 text-black shadow-md shadow-white/10"
                        : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/20"
                    }`}
                  >
                    {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
                    <span>{savedSuccess ? "已保存" : "保存信息"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 3. 外观主题 */}
            {activeTab === "appearance" && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="block text-[var(--muted-fg)] text-[11px] font-semibold tracking-wide uppercase">
                      {isEn ? "Interface Theme" : "界面显示主题"}
                    </label>
                    <span className="text-[10px] text-stone-500">
                      {isEn ? "Instant preview & auto-saved" : "即时切换 · 自动保存"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* 1. 经典黑金 (默认) */}
                    <button
                      type="button"
                      onClick={() => setAppTheme("classic")}
                      className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer relative overflow-hidden group text-left ${
                        appTheme === "classic"
                          ? "border-amber-500/80 bg-amber-500/10 text-amber-300 font-bold shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30"
                          : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:border-amber-500/40 hover:bg-[var(--panel-hover)]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 group-hover:scale-105 transition-transform">
                          <Sparkles className="size-4" />
                        </div>
                        {appTheme === "classic" ? (
                          <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="size-3" />
                            <span>{isEn ? "Active" : "当前使用"}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400/60 font-mono">Default</span>
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
                          <span>{isEn ? "Classic Warm Amber" : "经典黑金"}</span>
                          <span className="text-[10px] font-normal text-amber-400/80">
                            {isEn ? "(Default)" : "(默认)"}
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 leading-relaxed">
                          {isEn
                            ? "Warm dark tone, amber cyber glow, geek cockpit aesthetic"
                            : "沉浸暖黑底色 · 金琥珀微光 · 经典极客质感"}
                        </div>
                      </div>

                      {/* 视觉调色板微缩胶囊 */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--grid)]/60 w-full">
                        <span className="h-2 w-6 rounded-full bg-[#141210] border border-amber-500/40" />
                        <span className="h-2 w-4 rounded-full bg-amber-500" />
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      </div>
                    </button>

                    {/* 2. 黑白高级感 */}
                    <button
                      type="button"
                      onClick={() => setAppTheme("monochrome")}
                      className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer relative overflow-hidden group text-left ${
                        appTheme === "monochrome"
                          ? "border-white/90 bg-white/10 text-white font-bold shadow-xl shadow-white/10 ring-1 ring-white/40"
                          : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:border-white/40 hover:bg-[var(--panel-hover)]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="p-2 rounded-xl bg-white/15 text-white border border-white/30 group-hover:scale-105 transition-transform">
                          <Contrast className="size-4" />
                        </div>
                        {appTheme === "monochrome" ? (
                          <span className="text-[10px] font-semibold text-black bg-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                            <Check className="size-3" />
                            <span>{isEn ? "Active" : "当前使用"}</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold bg-white/10 text-zinc-300 px-1.5 py-0.2 rounded border border-white/20">
                            Luxe
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
                          <span>{isEn ? "Monochrome Luxe" : "黑白高级感"}</span>
                          <span className="text-[9px] font-semibold bg-white text-black px-1.5 py-0.2 rounded">
                            高奢
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
                          {isEn
                            ? "Deep obsidian black, zinc silver tiers, high-contrast PillNav invert"
                            : "纯粹极夜曜黑 · 钛银灰阶 · 高反差 PillNav 翻转"}
                        </div>
                      </div>

                      {/* 视觉调色板微缩胶囊 */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--grid)]/60 w-full">
                        <span className="h-2 w-6 rounded-full bg-black border border-white/40" />
                        <span className="h-2 w-4 rounded-full bg-white" />
                        <span className="h-2 w-2 rounded-full bg-zinc-400" />
                      </div>
                    </button>

                    {/* 3. 跟随系统 */}
                    <button
                      type="button"
                      onClick={() => setAppTheme("system")}
                      className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer relative overflow-hidden group text-left ${
                        appTheme === "system"
                          ? "border-cyan-500/80 bg-cyan-500/10 text-cyan-300 font-bold shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/30"
                          : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:border-cyan-500/40 hover:bg-[var(--panel-hover)]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 group-hover:scale-105 transition-transform">
                          <Laptop className="size-4" />
                        </div>
                        {appTheme === "system" ? (
                          <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="size-3" />
                            <span>{isEn ? "Active" : "当前使用"}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-cyan-400/60 font-mono">Auto</span>
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
                          <span>{isEn ? "System Adaptive" : "跟随系统"}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 leading-relaxed">
                          {isEn
                            ? "Adapt automatically according to OS dark/contrast appearance"
                            : "自适应检测系统深色与高对比外观模式"}
                        </div>
                      </div>

                      {/* 视觉调色板微缩胶囊 */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--grid)]/60 w-full">
                        <span className="h-2 w-6 rounded-full bg-stone-900 border border-cyan-500/40" />
                        <span className="h-2 w-4 rounded-full bg-cyan-400" />
                        <span className="h-2 w-2 rounded-full bg-stone-500" />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--grid)]">
                  <label className="block text-[var(--muted-fg)] text-[11px] mb-2 font-semibold tracking-wide uppercase flex items-center gap-1.5">
                    <Languages className="size-3.5 text-[var(--muted-fg)]" />
                    <span>{isEn ? "System Language" : "系统显示语言 (Language)"}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {LANGS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => onSetLang(item.value)}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                          lang === item.value
                            ? isMonochrome
                              ? "border-white/80 bg-white/10 text-white font-bold"
                              : "border-amber-500/70 bg-amber-500/10 text-amber-300 font-bold"
                            : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:bg-[var(--panel-hover)]"
                        }`}
                      >
                        <span className="text-xs">{item.label}</span>
                        {lang === item.value && (
                          <Check className={`size-3.5 ${isMonochrome ? "text-white" : "text-amber-400"}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. 快捷键 */}
            {activeTab === "shortcuts" && (
              <div className="space-y-3">
                <div className="divide-y divide-[var(--grid)]/70">
                  <ShortcutRow keys={["Ctrl", "B"]} desc={isEn ? "Toggle Sidebar" : "展开 / 收起侧边栏"} />
                  <ShortcutRow keys={["Ctrl", ","]} desc={isEn ? "Open Settings" : "打开系统设置弹窗"} />
                  <ShortcutRow keys={["Enter"]} desc={isEn ? "Send message in AI chat" : "顾问对话框中直接发送"} />
                  <ShortcutRow keys={["Shift", "Enter"]} desc={isEn ? "New line in chat" : "对话框中换行"} />
                  <ShortcutRow keys={["Esc"]} desc={isEn ? "Close dialog or modal" : "关闭当前弹窗或菜单"} />
                </div>
              </div>
            )}

            {/* 5. AI 模型 (原 ZCode / DeepSeek 模块完整接入) */}
            {activeTab === "model" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-stone-400 text-[11px] mb-1.5 font-medium">
                    常用大模型服务商预设
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {llmConfig?.presets?.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPreset(p)}
                        className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
                          selectedPreset === p.id
                            ? isMonochrome
                              ? "border-white/80 bg-white/15 text-white font-bold"
                              : "border-amber-500/70 bg-amber-500/15 text-amber-300 font-bold"
                            : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:bg-[var(--panel-hover)]"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                    API Base URL
                  </label>
                  <input
                    type="text"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    placeholder="https://api.deepseek.com"
                    className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                    API Key (密钥)
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="sk-..."
                    className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-stone-500 mt-1">密钥仅在本地加密存储，直接与大模型厂商安全交互</p>
                </div>

                <div>
                  <label className="block text-stone-400 text-[11px] mb-1 font-medium">
                    模型名称 (Model)
                  </label>
                  <input
                    type="text"
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    placeholder="deepseek-chat"
                    className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none font-mono"
                  />
                </div>

                {modelStatusMsg && (
                  <div className={`p-2.5 rounded-xl border text-xs ${isMonochrome ? "bg-white/10 border-white/20 text-white" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>
                    {modelStatusMsg}
                  </div>
                )}

                <div className="pt-2 border-t border-[var(--grid)] flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveModel}
                    className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer shadow-md ${
                      isMonochrome
                        ? "bg-white hover:bg-zinc-200 text-black shadow-white/10"
                        : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 shadow-amber-500/20"
                    }`}
                  >
                    保存大模型配置
                  </button>
                </div>
              </div>
            )}

            {/* 6. 关于 */}
            {activeTab === "about" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] flex items-center gap-3.5">
                  <img src="/favicon.png" alt="Logo" className="size-10 rounded-xl border border-pink-400/30" />
                  <div>
                    <div className="font-bold text-sm text-stone-100">JobHunter 求职助手</div>
                    <div className="text-[11px] text-stone-400 mt-0.5">全平台智能巡航 · Offer 尊享版 v0.2.0</div>
                  </div>
                </div>

                <div className="space-y-2 text-stone-400 leading-relaxed text-[11px]">
                  <p>JobHunter 专为求职者打造，深度融合大模型顾问诊断、多招聘平台直连与智能投递风控。</p>
                  <p>支持平台：BOSS 直聘、猎聘、前程无忧、智联招聘。</p>
                </div>

                <div className="pt-3 border-t border-[var(--grid)] flex items-center justify-between text-[11px] text-stone-500">
                  <span>© 2026 JobHunter. 保留所有权利。</span>
                  <button
                    type="button"
                    onClick={() => alert("当前已是最新版本 v0.2.0")}
                    className={`hover:underline cursor-pointer ${isMonochrome ? "text-zinc-300 hover:text-white" : "text-amber-400"}`}
                  >
                    检查更新
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-stone-300 text-xs">{desc}</span>
      <div className="flex items-center gap-1 font-mono text-[11px]">
        {keys.map((k) => (
          <kbd key={k} className="px-2 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-300 shadow-sm">
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
