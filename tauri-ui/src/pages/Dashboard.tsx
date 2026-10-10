import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import ResumePanel from "../components/ResumePanel";
import ProfilePanel from "../components/ProfilePanel";
import AgentPanel from "../components/AgentPanel";
import AnalyticsPanel from "../components/AnalyticsPanel";
import DashboardHeader from "../components/DashboardHeader";
import WorkbenchView from "../views/WorkbenchView";
import SettingsDrawer, { type DrawerTab } from "../components/SettingsDrawer";
import SettingsModal, { type SettingsTab } from "../components/SettingsModal";
import Sidebar, { type NavItem } from "../components/Sidebar";
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

  const [selectedPlatform, setSelectedPlatform] = useState<string>("boss");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavItem>("workbench");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("rules");
  const [defaultResumeName, setDefaultResumeName] = useState<string>("我的求职简历.docx");
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
        const def = res.resumes.find((r) => r.is_default) || res.resumes[0];
        if (def) setDefaultResumeName(def.name);
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
          if (tab) setDrawerTab(tab);
          setDrawerOpen(true);
        }}
        onOpenSettingsModal={() => setSettingsModalOpen(true)}
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
          onOpenSettingsModal={() => setSettingsModalOpen(true)}
        />

        {/* 主内容区域 */}
        <main
          ref={wheel.mainScrollRef}
          className={`flex-1 ${
            activeNav === "workbench" && !heroChat.isChattingOrHasHistory
              ? "px-2 sm:px-4 lg:px-6 py-0 overflow-hidden"
              : activeNav === "resumes"
              ? "px-3 sm:px-5 py-3 space-y-4 overflow-y-auto"
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
              handleStagePointerDown={
                !heroChat.isChattingOrHasHistory ? wheel.handleStagePointerDown : undefined
              }
              handleStagePointerMove={
                !heroChat.isChattingOrHasHistory ? wheel.handleStagePointerMove : undefined
              }
              handleStagePointerEnd={
                !heroChat.isChattingOrHasHistory ? wheel.handleStagePointerEnd : undefined
              }
              isChattingOrHasHistory={heroChat.isChattingOrHasHistory}
              heroChatMessages={heroChat.heroChatMessages}
              heroChatting={heroChat.heroChatting}
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
                onGoToProfile={() => setActiveNav("profile")}
              />
            </div>
          )}

          {/* TAB 4: AI 顾问意向 Copilot */}
          {activeNav === "copilot" && (
            <div className="max-w-4xl mx-auto space-y-5">
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
                  if (tab) setDrawerTab(tab);
                  setDrawerOpen(true);
                }}
              />
            </div>
          )}

          {/* TAB 5: 投递数据与自动化执行大屏 */}
          {activeNav === "analytics" && (
            <AnalyticsPanel
              mode={profileForm.mode}
              setMode={profileForm.setMode}
              running={botRuntime.running}
              currentIndex={botRuntime.currentIndex}
              dryRun={profileForm.dryRun}
              delayMin={profileForm.delayMin}
              delayMax={profileForm.delayMax}
              stats={botRuntime.stats}
              currentJob={botRuntime.currentJob}
              latestSent={botRuntime.latestSent}
              latestSkip={botRuntime.latestSkip}
              events={botRuntime.events}
              logs={botRuntime.logs}
              statusText={botRuntime.statusText}
              message={message}
              onOpenDrawer={(tab) => {
                if (tab) setDrawerTab(tab);
                setDrawerOpen(true);
              }}
              onCopyLogs={botRuntime.copyLogs}
            />
          )}
        </main>
      </div>

      {/* 侧边滑出高级设置抽屉 */}
      <SettingsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initialTab={drawerTab}
        lang={lang}
        profiles={profileForm.profiles}
        profileName={profileForm.profileName}
        setProfileName={profileForm.setProfileName}
        onLoadProfile={profileForm.loadProfile}
        onSaveConfig={profileForm.saveConfig}
        busy={busy}
        usrName={profileForm.usrName}
        setUsrName={profileForm.setUsrName}
        label={profileForm.label}
        setLabel={profileForm.setLabel}
        startUrl={profileForm.startUrl}
        setStartUrl={profileForm.setStartUrl}
        rule={profileForm.rule}
        setRule={profileForm.setRule}
        cityValues={profileForm.cityValues}
        setCityValues={profileForm.setCityValues}
        educationValues={profileForm.educationValues}
        setEducationValues={profileForm.setEducationValues}
        bossActiveValues={profileForm.bossActiveValues}
        setBossActiveValues={profileForm.setBossActiveValues}
        filterPolicy={profileForm.filterPolicy}
        setFilterPolicy={profileForm.setFilterPolicy}
        greetingPath={profileForm.greetingPath}
        setGreetingPath={profileForm.setGreetingPath}
        greeting={profileForm.greeting}
        setGreeting={profileForm.setGreeting}
        delayMin={profileForm.delayMin}
        setDelayMin={profileForm.setDelayMin}
        delayMax={profileForm.delayMax}
        setDelayMax={profileForm.setDelayMax}
        maxSent={profileForm.maxSent}
        setMaxSent={profileForm.setMaxSent}
        dailyLimit={profileForm.dailyLimit}
        setDailyLimit={profileForm.setDailyLimit}
        dryRun={profileForm.dryRun}
        setDryRun={profileForm.setDryRun}
        stopOnCaptcha={profileForm.stopOnCaptcha}
        setStopOnCaptcha={profileForm.setStopOnCaptcha}
        sendResumeAfterGreeting={profileForm.sendResumeAfterGreeting}
        setSendResumeAfterGreeting={profileForm.setSendResumeAfterGreeting}
        autoResumeOnReply={profileForm.autoResumeOnReply}
        setAutoResumeOnReply={profileForm.setAutoResumeOnReply}
        aiGreeting={profileForm.aiGreeting}
        setAiGreeting={profileForm.setAiGreeting}
      />

      {/* WorkBuddy 风格系统设置弹窗 */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={settingsModalTab}
        lang={lang}
        onSetLang={setLang}
        usrName={profileForm.usrName}
        setUsrName={profileForm.setUsrName}
        label={profileForm.label}
        defaultResumeName={defaultResumeName}
        onGoToResumes={() => {
          setSettingsModalOpen(false);
          setActiveNav("resumes");
        }}
        onSaveConfig={profileForm.saveConfig}
        busy={busy}
      />
    </div>
  );
}
