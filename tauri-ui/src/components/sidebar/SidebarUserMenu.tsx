import { Settings, ExternalLink, RefreshCw, Languages } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon, ShieldCheckIcon, Comment01Icon, CpuIcon } from "@hugeicons/core-free-icons";
import { LANGS, type Lang } from "../../lib/i18n";
import PillNavButton from "../core/PillNavButton";

interface SidebarUserMenuProps {
  onClose: () => void;
  onOpenSettingsModal?: (tab?: any) => void;
  onOpenSettings: (tab?: "rules" | "policy" | "greeting" | "basic" | "model") => void;
  onOpenBrowser: () => void;
  onResetBrowser: () => void;
  lang: Lang;
  onSetLang: (lang: Lang) => void;
  isMonochrome: boolean;
}

export default function SidebarUserMenu({
  onClose,
  onOpenSettingsModal,
  onOpenSettings,
  onOpenBrowser,
  onResetBrowser,
  lang,
  onSetLang,
  isMonochrome,
}: SidebarUserMenuProps) {
  return (
    <div className="absolute bottom-16 left-2 right-2 rounded-2xl border border-[var(--grid)] bg-[var(--panel-2)] p-3 shadow-2xl backdrop-blur-md z-50 text-xs space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* 用户状态徽章 */}
      <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--grid)]">
        <img
          src="/favicon.png"
          alt="Avatar"
          className="h-8 w-8 rounded-lg object-cover border border-pink-400/30"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--ink)]">
              {lang === "en" ? "Job Hunter" : "求职锦鲤"}
            </span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                isMonochrome
                  ? "text-zinc-200 bg-white/10 border border-white/20"
                  : "text-amber-400 bg-amber-500/15"
              }`}
            >
              {lang === "en" ? "PRO" : "尊享版"}
            </span>
          </div>
          <div className="text-[10px] text-[var(--muted-fg)] mt-0.5">
            {lang === "en" ? "Local Direct Connect · Active" : "本地安全直连 · 已就绪"}
          </div>
        </div>
      </div>

      {/* 功能选项列表 */}
      <div className="space-y-1">
        <PillNavButton
          variant="menu"
          onClick={() => {
            onClose();
            onOpenSettingsModal?.();
          }}
          icon={
            <Settings
              className={`h-3.5 w-3.5 shrink-0 ${
                isMonochrome ? "text-zinc-300" : "text-amber-400"
              }`}
            />
          }
          label={lang === "en" ? "System Settings" : "系统设置"}
          shortcut="Ctrl+,"
        />

        <PillNavButton
          variant="menu"
          onClick={() => {
            onClose();
            onOpenSettings("rules");
          }}
          icon={<HugeiconsIcon icon={FilterIcon} size={15} className="text-stone-400 shrink-0" />}
          label={lang === "en" ? "Job Filter Rules" : "过滤规则设置"}
        />

        <PillNavButton
          variant="menu"
          onClick={() => {
            onClose();
            onOpenSettings("policy");
          }}
          icon={<HugeiconsIcon icon={ShieldCheckIcon} size={15} className="text-stone-400 shrink-0" />}
          label={lang === "en" ? "Delivery Settings" : "投递设置与安全"}
        />

        <PillNavButton
          variant="menu"
          onClick={() => {
            onClose();
            onOpenSettings("greeting");
          }}
          icon={<HugeiconsIcon icon={Comment01Icon} size={15} className="text-stone-400 shrink-0" />}
          label={lang === "en" ? "Greeting Templates" : "打招呼模板"}
        />

        <PillNavButton
          variant="menu"
          onClick={() => {
            onClose();
            onOpenSettings("model");
          }}
          icon={<HugeiconsIcon icon={CpuIcon} size={15} className="text-stone-400 shrink-0" />}
          label={lang === "en" ? "AI Model Config" : "AI 模型配置"}
        />

        <PillNavButton
          variant="menu"
          onClick={() => {
            onClose();
            onOpenBrowser();
          }}
          icon={<ExternalLink className="h-3.5 w-3.5 text-stone-400 shrink-0" />}
          label={lang === "en" ? "Debug Browser" : "手动打开调试浏览器"}
        />

        <PillNavButton
          variant="danger-menu"
          onClick={() => {
            onClose();
            onResetBrowser();
          }}
          icon={<RefreshCw className="h-3.5 w-3.5 text-red-400 shrink-0" />}
          label={lang === "en" ? "Reset Browser Data" : "重置浏览器数据"}
        />
      </div>

      {/* 语言切换 */}
      <div className="pt-2 border-t border-[var(--grid)] flex items-center justify-between text-[11px] text-[var(--muted-fg)]">
        <span className="flex items-center gap-1.5">
          <Languages className="h-3.5 w-3.5 text-stone-400" />
          <span>{lang === "en" ? "Language" : "界面语言"}</span>
        </span>
        <div className="flex gap-1">
          {LANGS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onSetLang(item.value)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                lang === item.value
                  ? isMonochrome
                    ? "bg-white text-black font-bold"
                    : "bg-amber-500 text-stone-950 font-bold"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
