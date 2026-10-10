import { useState, useEffect, type ReactNode } from "react";
import {
  SlidersHorizontal,
  ShieldCheck,
  MessageSquareQuote,
  Bot,
  FolderArchive,
  X,
  Check,
} from "lucide-react";
import { type FilterPolicy, type RuleForm } from "../lib/profileForm";
import { type Lang } from "../lib/i18n";
import DrawerRulesTab from "./settings/drawer/DrawerRulesTab";
import DrawerPolicyTab from "./settings/drawer/DrawerPolicyTab";
import DrawerGreetingTab from "./settings/drawer/DrawerGreetingTab";
import DrawerModelTab from "./settings/drawer/DrawerModelTab";
import DrawerBasicTab from "./settings/drawer/DrawerBasicTab";

export type DrawerTab = "basic" | "rules" | "greeting" | "policy" | "model";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Lang;
  profiles: Array<{ name: string; path: string }>;
  profileName: string;
  setProfileName: (name: string) => void;
  onLoadProfile: (name: string) => void;
  onSaveConfig: () => Promise<void>;
  busy: boolean;

  // Basic
  usrName: string;
  setUsrName: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  startUrl: string;
  setStartUrl: (v: string) => void;

  // Rules
  rule: RuleForm;
  setRule: (r: RuleForm) => void;

  // Page Filters
  cityValues: string;
  setCityValues: (v: string) => void;
  educationValues: string;
  setEducationValues: (v: string) => void;
  bossActiveValues: string;
  setBossActiveValues: (v: string) => void;
  filterPolicy: FilterPolicy;
  setFilterPolicy: (p: FilterPolicy) => void;

  // Greeting
  greetingPath: string;
  setGreetingPath: (v: string) => void;
  greeting: string;
  setGreeting: (v: string) => void;

  // Send Policy
  delayMin: string;
  setDelayMin: (v: string) => void;
  delayMax: string;
  setDelayMax: (v: string) => void;
  maxSent: string;
  setMaxSent: (v: string) => void;
  dailyLimit: string;
  setDailyLimit: (v: string) => void;
  dryRun: boolean;
  setDryRun: (v: boolean) => void;
  stopOnCaptcha: boolean;
  setStopOnCaptcha: (v: boolean) => void;
  sendResumeAfterGreeting: boolean;
  setSendResumeAfterGreeting: (v: boolean) => void;
  autoResumeOnReply: boolean;
  setAutoResumeOnReply: (v: boolean) => void;
  aiGreeting: boolean;
  setAiGreeting: (v: boolean) => void;
  initialTab?: DrawerTab;
}

export default function SettingsDrawer(props: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>(props.initialTab || "rules");

  useEffect(() => {
    if (props.initialTab) {
      setActiveTab(props.initialTab);
    }
  }, [props.initialTab, props.isOpen]);

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm transition-opacity">
      {/* 遮罩背景点击退出 */}
      <div className="absolute inset-0 cursor-pointer" onClick={props.onClose} />

      {/* 侧滑主体面板 */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-[var(--grid)] bg-[var(--panel)] shadow-2xl">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-[var(--grid)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">配置与过滤规则中心</h2>
              <p className="text-xs text-[var(--muted-fg)]">精细化控制求职关键词、城市范围、拟人风控延时与 AI 大模型</p>
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--grid)] text-stone-400 hover:border-stone-600 hover:text-stone-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 标签栏（统一 Lucide 图标规范） */}
        <div className="flex border-b border-[var(--grid)] px-6 bg-[var(--panel-2)]/50 overflow-x-auto">
          <TabButton
            active={activeTab === "rules"}
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            label="关键词与筛选"
            onClick={() => setActiveTab("rules")}
          />
          <TabButton
            active={activeTab === "policy"}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="拟人风控与策略"
            onClick={() => setActiveTab("policy")}
          />
          <TabButton
            active={activeTab === "greeting"}
            icon={<MessageSquareQuote className="h-3.5 w-3.5" />}
            label="打招呼文本"
            onClick={() => setActiveTab("greeting")}
          />
          <TabButton
            active={activeTab === "model"}
            icon={<Bot className="h-3.5 w-3.5" />}
            label="AI 模型配置"
            onClick={() => setActiveTab("model")}
          />
          <TabButton
            active={activeTab === "basic"}
            icon={<FolderArchive className="h-3.5 w-3.5" />}
            label="预设配置档"
            onClick={() => setActiveTab("basic")}
          />
        </div>

        {/* 表单内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === "rules" && (
            <DrawerRulesTab
              lang={props.lang}
              rule={props.rule}
              setRule={props.setRule}
              cityValues={props.cityValues}
              setCityValues={props.setCityValues}
              educationValues={props.educationValues}
              setEducationValues={props.setEducationValues}
              bossActiveValues={props.bossActiveValues}
              setBossActiveValues={props.setBossActiveValues}
              filterPolicy={props.filterPolicy}
              setFilterPolicy={props.setFilterPolicy}
            />
          )}

          {activeTab === "policy" && (
            <DrawerPolicyTab
              delayMin={props.delayMin}
              setDelayMin={props.setDelayMin}
              delayMax={props.delayMax}
              setDelayMax={props.setDelayMax}
              maxSent={props.maxSent}
              setMaxSent={props.setMaxSent}
              dailyLimit={props.dailyLimit}
              setDailyLimit={props.setDailyLimit}
              dryRun={props.dryRun}
              setDryRun={props.setDryRun}
              stopOnCaptcha={props.stopOnCaptcha}
              setStopOnCaptcha={props.setStopOnCaptcha}
              sendResumeAfterGreeting={props.sendResumeAfterGreeting}
              setSendResumeAfterGreeting={props.setSendResumeAfterGreeting}
              autoResumeOnReply={props.autoResumeOnReply}
              setAutoResumeOnReply={props.setAutoResumeOnReply}
            />
          )}

          {activeTab === "greeting" && (
            <DrawerGreetingTab
              greetingPath={props.greetingPath}
              setGreetingPath={props.setGreetingPath}
              greeting={props.greeting}
              setGreeting={props.setGreeting}
              aiGreeting={props.aiGreeting}
              setAiGreeting={props.setAiGreeting}
            />
          )}

          {activeTab === "model" && <DrawerModelTab />}

          {activeTab === "basic" && (
            <DrawerBasicTab
              profiles={props.profiles}
              profileName={props.profileName}
              setProfileName={props.setProfileName}
              onLoadProfile={props.onLoadProfile}
              usrName={props.usrName}
              setUsrName={props.setUsrName}
              label={props.label}
              setLabel={props.setLabel}
              startUrl={props.startUrl}
              setStartUrl={props.setStartUrl}
            />
          )}
        </div>

        {/* 底部吸底操作栏 */}
        <div className="flex items-center justify-between border-t border-[var(--grid)] bg-[var(--paper)] px-6 py-4">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={props.onClose}
          >
            关闭抽屉
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary text-xs flex items-center gap-2"
              onClick={async () => {
                await props.onSaveConfig();
                props.onClose();
              }}
              disabled={props.busy}
            >
              <Check className="h-4 w-4" />
              保存并应用此配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold tracking-wide transition-all border-b-2 whitespace-nowrap ${
        active
          ? "border-amber-500 text-amber-400 bg-amber-500/5"
          : "border-transparent text-stone-400 hover:text-stone-200"
      }`}
    >
      {icon && <span className="opacity-90">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
