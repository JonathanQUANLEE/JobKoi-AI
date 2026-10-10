import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import ResumePanel from "../components/ResumePanel";
import ProfilePanel from "../components/ProfilePanel";
import AgentPanel from "../components/AgentPanel";
import DeliveryAnalyticsView from "../components/analytics/DeliveryAnalyticsView";
import DashboardHeader from "../components/DashboardHeader";
import WorkbenchView from "../views/WorkbenchView";
import { type DrawerTab } from "../components/SettingsDrawer";
import { type SettingsTab } from "../components/SettingsModal";
import { type MistModalType } from "../components/settings/MistSettingsModal";
import Sidebar, { type NavItem } from "../components/Sidebar";
import DashboardModalLayer from "../components/dashboard/DashboardModalLayer";
import { useWorkbenchWheel } from "../hooks/useWorkbenchWheel";
import { useProfileFormState } from "../hooks/useProfileFormState";
import { useJobBotRuntime } from "../hooks/useJobBotRuntime";
import { useHeroChat } from "../hooks/useHeroChat";
import { useRunStore, useT } from "../store";

/**
 * 仪表盘顶级页面 (Layout Router 外壳)
 * 严格遵从《GEMINI.md 架构铁律》：仅负责顶层框架装配与按需子面板路由，不包含具体业务与展示细节。
 */
export default function Dashboard() {
  const t = useT();
  const lang = useRunStore((s) => s.lang);
  const setLang = useRunStore((s) => s.setLang);
  const pushAgentMessage = useRunStore((s) => s.pushAgentMessage);
  const setPendingResumePolish = useRunStore((s) => s.setPendingResumePolish);

  const [selectedPlatform, setSelectedPlatform] = useState<string>("boss");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavItem>("workbench");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("rules");
  const [mistModalType, setMistModalType] = useState<MistModalType>(null);
  const [defaultResumeName, setDefaultResumeName] = useState<string>(
    "我的求职简历.docx"
  );
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsTab>("general");
  const [expandRipple, setExpandRipple] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("jobhunter_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  // 1. 求职画像表单与持久化 Hook
  const profileForm = useProfileFormState({
    t,
    setMessage,
    setBusy,
  });

  // 2. 机器人运行与浏览器控制 Hook
  const botRuntime = useJobBotRuntime({
    t,
    busy,
    setBusy,
    message,
    setMessage,
    usrName: profileForm.usrName,
    label: profileForm.label,
    dryRun: profileForm.dryRun,
    profileName: profileForm.profileName,
    greeting: profileForm.greeting,
    greetingPath: profileForm.greetingPath,
    currentProfileData: profileForm.currentProfileData,
    validateBeforeRun: profileForm.validateBeforeRun,
  });

  // 3. AI 顾问意向对话流 Hook
  const heroChat = useHeroChat({
    currentProfileData: profileForm.currentProfileData,
    setLabel: profileForm.setLabel,
    setCityValues: profileForm.setCityValues,
    setRule: profileForm.setRule,
    pushAgentMessage,
    setMessage,
  });

  // 4. 3D 万花筒滚轮动力学引擎 Hook
  const wheel = useWorkbenchWheel({
    isChattingOrHasHistory: heroChat.isChattingOrHasHistory,
    activeNav,
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("jobhunter_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const handleExpandSidebar = () => {
    setExpandRipple(true);
    setTimeout(() => setExpandRipple(false), 750);
    toggleSidebar();
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsModalOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 同步当前默认简历名称
  useEffect(() => {
    ipc
      .listResumes()
      .then((res) => {
        const def = res.resumes.find((r) => r.is_default);
        setDefaultResumeName(def ? def.name : "");
      })
      .catch(() => {});
  }, [activeNav]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/* 左侧独立导航栏 */}
      <Sidebar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        running={botRuntime.running}
        onStartRun={botRuntime.startRun}
        onStopRun={botRuntime.stopRun}
        busy={busy}
        onOpenSettings={(tab) => {
          if (tab === "rules" || tab === "policy" || tab === "greeting" || tab === "model") {
            setMistModalType(tab);
          } else {
            setMistModalType("rules");
          }
        }}
        onOpenSettingsModal={(tab) => {
          setSettingsModalTab(tab || "general");
          setSettingsModalOpen(true);
        }}
        onOpenBrowser={botRuntime.openManualBrowser}
        onResetBrowser={botRuntime.resetChrome}
        lang={lang}
        onSetLang={setLang}
        dailySentCount={botRuntime.stats.sent}
        dailyLimit={profileForm.dailyLimit}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* 右侧主工作流区域 */}
      <div className="flex flex-1 flex-col h-screen overflow-hidden bg-[var(--paper)] water-fluid-sidebar relative">
        {/* 顶部极简导航面包屑与状态 */}
        <DashboardHeader
          sidebarCollapsed={sidebarCollapsed}
          expandRipple={expandRipple}
          onExpandSidebar={handleExpandSidebar}
          activeNav={activeNav}
          dryRun={profileForm.dryRun}
          running={botRuntime.running}
          statusText={botRuntime.statusText}
          lang={lang}
          onOpenSettingsModal={(tab) => {
            setSettingsModalTab(tab || "general");
            setSettingsModalOpen(true);
          }}
        />

        {/* 主内容区域 */}
        <main
          ref={wheel.mainScrollRef}
          className={`flex-1 ${
            activeNav === "workbench"
              ? "px-2 sm:px-4 lg:px-6 py-0 overflow-hidden"
              : activeNav === "resumes"
              ? "px-3 sm:px-5 py-3 space-y-4 overflow-y-auto"
              : activeNav === "copilot"
              ? "px-3 sm:px-5 py-3 flex flex-col overflow-y-auto"
              : "px-6 py-5 space-y-6 overflow-y-auto"
          }`}
        >
          {botRuntime.replyNotice && (
            <div className="flex items-center gap-3 border border-[var(--signal)] bg-[var(--panel-2)] px-4 py-3 rounded-xl shadow-md">
              <span className="min-w-0 flex-1 break-words text-sm text-[var(--signal)]">
                {t("reply.notice", { count: botRuntime.replyNotice.unread })}
              </span>
              <button
                className="btn-primary"
                onClick={() => botRuntime.openChatPage(botRuntime.replyNotice!.chatUrl)}
                disabled={busy}
              >
                {t("reply.openChat")}
              </button>
              <button className="btn-ghost" onClick={() => botRuntime.setReplyNotice(null)}>
                {t("reply.dismiss")}
              </button>
            </div>
          )}

          {/* TAB 1: 巡航工作台 */}
          {activeNav === "workbench" && (
            <WorkbenchView
              heroStageRef={wheel.heroStageRef}
              heroInnerRef={wheel.heroInnerRef}
              hubRef={wheel.hubRef}
              profileRef={wheel.profileRef}
              ringActiveIndex={wheel.ringActiveIndex}
              scrollToRingStage={wheel.scrollToRingStage}
              handleStagePointerDown={wheel.handleStagePointerDown}
              handleStagePointerMove={wheel.handleStagePointerMove}
              handleStagePointerEnd={wheel.handleStagePointerEnd}
              isChattingOrHasHistory={heroChat.isChattingOrHasHistory}
              heroChatMessages={heroChat.heroChatMessages}
              heroChatting={heroChat.heroChatting}
              chatStartTime={heroChat.chatStartTime}
              chatPhaseText={heroChat.chatPhaseText}
              heroProfileResult={heroChat.heroProfileResult}
              onChatSubmit={heroChat.handleHeroChatSubmit}
              onResetChat={heroChat.resetHeroChat}
              onConfirmProfile={() => {
                if (heroChat.heroProfileResult) {
                  profileForm.hydrateFromProfile({
                    name: profileForm.profileName,
                    path: "",
                    data: heroChat.heroProfileResult,
                  });
                  heroChat.resetHeroChat();
                  wheel.scrollToRingStage(2, true);
                }
              }}
              label={profileForm.label}
              cityValues={profileForm.cityValues}
              educationValues={profileForm.educationValues}
              rule={profileForm.rule}
              defaultResumeName={defaultResumeName}
              mode={profileForm.mode}
              dryRun={profileForm.dryRun}
              delayMin={profileForm.delayMin}
              delayMax={profileForm.delayMax}
              dailyLimit={profileForm.dailyLimit}
              running={botRuntime.running}
              stats={botRuntime.stats}
              selectedPlatform={selectedPlatform}
              onSelectPlatform={setSelectedPlatform}
              reviewPending={botRuntime.reviewPending}
              busy={busy}
              onReviewDecision={botRuntime.submitReviewDecision}
              onNavigateTo={setActiveNav}
              lang={lang}
              t={t}
            />
          )}

          {/* TAB 2: 求职画像定制面板 */}
          {activeNav === "profile" && (
            <ProfilePanel
              label={profileForm.label}
              setLabel={profileForm.setLabel}
              cityValues={profileForm.cityValues}
              setCityValues={profileForm.setCityValues}
              educationValues={profileForm.educationValues}
              setEducationValues={profileForm.setEducationValues}
              rule={profileForm.rule}
              setRule={profileForm.setRule}
              dailyLimit={profileForm.dailyLimit}
              setDailyLimit={profileForm.setDailyLimit}
              dryRun={profileForm.dryRun}
              setDryRun={profileForm.setDryRun}
              defaultResumeName={defaultResumeName}
              onGoToResumes={() => setActiveNav("resumes")}
              onBackToWorkbench={() => {
                setActiveNav("workbench");
                wheel.scrollToRingStage(2, true);
              }}
              onSaveConfig={profileForm.saveConfig}
              lang={lang}
              busy={busy}
            />
          )}

          {/* TAB 3: 简历资料库 */}
          {activeNav === "resumes" && (
            <div className="w-full space-y-4">
              <ResumePanel
                onExtractProfile={(resumeName, text) => {
                  pushAgentMessage({
                    role: "user",
                    content: `请基于我的简历资料库中的「${resumeName}」来识别提取我的求职画像（目标岗位、意向城市、核心技能及排除方向）。${
                      text ? `\n\n简历内容参考：\n${text.slice(0, 1200)}` : ""
                    }`,
                  });
                  setActiveNav("copilot");
                }}
                onReviewResume={(resumeName, text) => {
                  setPendingResumePolish({
                    name: resumeName,
                    text: text || "",
                  });
                  setActiveNav("copilot");
                }}
                onGoToProfile={() => setActiveNav("profile")}
              />
            </div>
          )}

          {/* TAB 4: 简历精修与诊断 Studio (Agent 2) / 意向画像 (Agent 1) */}
          {activeNav === "copilot" && (
            <div className="w-full flex-1 flex flex-col">
              <AgentPanel
                getCurrentForm={profileForm.currentProfileData}
                onApply={(data) =>
                  profileForm.hydrateFromProfile({
                    name: profileForm.profileName,
                    path: "",
                    data,
                  })
                }
                onRun={() => botRuntime.startRun()}
                onOpenSettings={(tab) => {
                  if (tab === "rules" || tab === "policy" || tab === "greeting" || tab === "model") {
                    setMistModalType(tab);
                  } else {
                    setMistModalType("model");
                  }
                }}
              />
            </div>
          )}

          {/* TAB 5: 历史投递多平台数据统计与投递早报 */}
          {activeNav === "analytics" && (
            <DeliveryAnalyticsView
              onStartCruise={() => {
                botRuntime.startRun();
              }}
            />
          )}
        </main>
      </div>

      {/* 弹窗与悬浮层外壳 */}
      <DashboardModalLayer
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        drawerTab={drawerTab}
        lang={lang}
        setLang={setLang}
        profileForm={profileForm}
        busy={busy}
        settingsModalOpen={settingsModalOpen}
        setSettingsModalOpen={setSettingsModalOpen}
        settingsModalTab={settingsModalTab}
        setSettingsModalTab={setSettingsModalTab}
        defaultResumeName={defaultResumeName}
        setActiveNav={setActiveNav}
        mistModalType={mistModalType}
        setMistModalType={setMistModalType}
        botRuntime={botRuntime}
        sidebarCollapsed={sidebarCollapsed}
      />
    </div>
  );
}
