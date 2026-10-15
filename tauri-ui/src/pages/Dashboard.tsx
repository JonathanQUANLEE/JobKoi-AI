import { useEffect, useState, useCallback } from "react";
import { ipc, type AgentAction } from "../lib/ipc";
import ResumePanel from "../components/ResumePanel";
import ProfilePanel from "../components/ProfilePanel";
import ResumePolishView from "../components/agent/ResumePolishView";
import CareerCopilotView from "../components/agent/CareerCopilotView";
import DeliveryAnalyticsView from "../components/analytics/DeliveryAnalyticsView";
import LiveCruiseView from "../components/live/LiveCruiseView";
import DashboardHeader from "../components/DashboardHeader";
import WorkbenchView from "../views/WorkbenchView";
import { type DrawerTab } from "../components/SettingsDrawer";
import { type SettingsTab } from "../components/SettingsModal";
import { type MistModalType } from "../components/settings/MistSettingsModal";
import Sidebar, { type NavItem } from "../components/Sidebar";
import DashboardModalLayer from "../components/dashboard/DashboardModalLayer";
import StartConfirmDialog from "../components/core/StartConfirmDialog";
import { useWorkbenchWheel } from "../hooks/useWorkbenchWheel";
import { useProfileFormState } from "../hooks/useProfileFormState";
import { useJobBotRuntime } from "../hooks/useJobBotRuntime";
import { useHeroChat } from "../hooks/useHeroChat";
import { useRunStore, useT } from "../store";

import { type GithubUser } from "../lib/githubAuth";
import GuidedTour from "../components/onboarding/GuidedTour";
import ModuleIntroCard from "../components/onboarding/ModuleIntroCard";
import { useOnboardingTour } from "../hooks/useOnboardingTour";
import {
  currentIntroModule,
  loadIntroShown,
  markIntroShown,
  saveIntroShown,
  shouldShowIntro,
  type IntroModuleId,
} from "../lib/onboarding";

interface DashboardProps {
  githubUser?: GithubUser | null;
  onLogout?: () => void;
}

/**
 * 仪表盘顶级页面 (Layout Router 外壳)
 * 严格遵从《GEMINI.md 架构铁律》：仅负责顶层框架装配与按需子面板路由，不包含具体业务与展示细节。
 */
export default function Dashboard({ githubUser, onLogout }: DashboardProps = {}) {
  const t = useT();
  const lang = useRunStore((s) => s.lang);
  const setLang = useRunStore((s) => s.setLang);
  const setTheme = useRunStore((s) => s.setTheme);
  const pushAgentMessage = useRunStore((s) => s.pushAgentMessage);
  const setPendingResumePolish = useRunStore((s) => s.setPendingResumePolish);
  const limitNotice = useRunStore((s) => s.limitNotice);
  const setLimitNotice = useRunStore((s) => s.setLimitNotice);
  const startConfirm = useRunStore((s) => s.startConfirm);
  const loginOverlay = useRunStore((s) => s.loginOverlay);
  const cruiseEndNotice = useRunStore((s) => s.cruiseEndNotice);

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

  // 新手引导 + 模块首次打开介绍（2026-10-14 用户需求）
  const [petFirstOpen, setPetFirstOpen] = useState(false);
  const [introCard, setIntroCard] = useState<IntroModuleId | null>(null);

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
    profileName: profileForm.profileName,
    greeting: profileForm.greeting,
    greetingPath: profileForm.greetingPath,
    currentProfileData: profileForm.currentProfileData,
    validateBeforeRun: profileForm.validateBeforeRun,
    // 巡航成功启动 → 自动跳转「实时巡航」监控页（2026-10-12 用户需求：
    // 用户不看浏览器也能实时看到脚本正在筛选/投递哪个岗位）
    onCruiseStarted: () => setActiveNav("live"),
  });

  // 3. 应用动作分发执行中枢（支持主题切换、设置弹窗呼出、路由跳转、统计/预览执行）
  const handleExecuteAppAction = useCallback(
    async (action: AgentAction) => {
      if (!action || !action.type) return;

      switch (action.type) {
        case "switch_theme":
          if (action.params?.theme) {
            setTheme(action.params.theme);
          }
          break;

        case "open_settings": {
          const modal = action.params?.modal;
          if (modal === "policy" || modal === "rules" || modal === "greeting" || modal === "model") {
            setMistModalType(modal);
          } else {
            const tab = (action.params?.tab as SettingsTab) || "general";
            setSettingsModalTab(tab);
            setSettingsModalOpen(true);
          }
          break;
        }

        case "navigate":
          if (action.params?.to) {
            setActiveNav(action.params.to);
          }
          break;

        case "switch_lang":
          if (action.params?.lang) {
            setLang(action.params.lang);
          }
          break;

        case "get_stats": {
          try {
            const tool = await ipc.agentExecuteAction("get_stats", {});
            if (tool.status === "ok") {
              // 2026-10-13 串线修复：工具结果回到工作台对话流（heroChat），
              // 不再进「意向管家」的全局会话——谁触发谁看见。
              useRunStore
                .getState()
                .setHeroChatMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: tool.text },
                ]);
            }
          } catch (e) {
            useRunStore
              .getState()
              .setHeroChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: `查询统计异常: ${String(e)}` },
              ]);
          }
          break;
        }

        case "preview_jobs": {
          const n = action.params?.n || 5;
          try {
            const tool = await ipc.agentExecuteAction("preview_jobs", { n });
            if (tool.status === "ok") {
              useRunStore
                .getState()
                .setHeroChatMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: tool.text },
                ]);
            }
          } catch (e) {
            useRunStore
              .getState()
              .setHeroChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: `岗位预览异常: ${String(e)}` },
              ]);
          }
          break;
        }

        case "prepare_run":
          // prepare_run 提示用户确认
          break;

        default:
          break;
      }
    },
    [setTheme, setMistModalType, setSettingsModalTab, setSettingsModalOpen, setActiveNav, setLang],
  );

  // 4. AI 顾问意向对话流 Hook
  const heroChat = useHeroChat({
    currentProfileData: profileForm.currentProfileData,
    setLabel: profileForm.setLabel,
    setCityValues: profileForm.setCityValues,
    setRule: profileForm.setRule,
    setMessage,
    hydrateFromProfile: profileForm.hydrateFromProfile,
    onExecuteAction: handleExecuteAppAction,
  });

  // 4. 3D 万花筒滚轮动力学引擎 Hook
  const wheel = useWorkbenchWheel({
    isChattingOrHasHistory: heroChat.isChattingOrHasHistory,
    activeNav,
  });

  // 5. 新手引导（三步：AI 模型 → 画像 → 平台巡航；可跳过、断点续播、信号自动点亮）
  // blocked：任何全屏级弹窗打开时收起引导卡，关闭后自动回来（互斥优先于 z-index 抢屏）。
  const hardOverlayOpen =
    settingsModalOpen || startConfirm !== null || loginOverlay !== null || cruiseEndNotice !== null;
  const tour = useOnboardingTour({
    t,
    // 引导按账号隔离：换 GitHub 账号登录会重新弹一遍（2026-10-14 用户需求）
    login: githubUser?.login || "default",
    running: botRuntime.running,
    blocked: hardOverlayOpen || mistModalType !== null || drawerOpen,
    actions: {
      model: () => setMistModalType("model"),
      profile: () => {
        setActiveNav("workbench");
        wheel.scrollToRingStage(0, true);
      },
      cruise: () => {
        setActiveNav("workbench");
        wheel.scrollToRingStage(1, true);
      },
    },
  });

  // 5.5 模块首次打开介绍卡：首次进入模块/首次打开设置弹窗时弹一次说明，看过永不复弹。
  // 引导进行中全部抑制（宠物 flag 保留，引导结束立刻补弹）；已有介绍卡展示中排队等关闭。
  useEffect(() => {
    if (petFirstOpen && loadIntroShown().includes("pet")) {
      setPetFirstOpen(false); // 老用户：直接消费 flag，别挡住导航页介绍
      return;
    }
    if (tour.active || introCard) return;
    const module = currentIntroModule({
      activeNav,
      mistModalType,
      drawerOpen,
      drawerTab,
      petFirstOpen,
    });
    if (!module) return;
    // 设置类模块（rules/policy/model）的介绍卡压在雾化弹窗/抽屉上方展示，只被
    // 更硬的浮层（系统设置/扫码登录/巡航结束/启动确认）阻塞；导航页/宠物模块
    // 则要求弹窗抽屉全关才弹。
    const fromSettings = module === "rules" || module === "policy" || module === "model";
    const introBlocked =
      hardOverlayOpen || (!fromSettings && (mistModalType !== null || drawerOpen));
    if (
      !shouldShowIntro({ module, shown: loadIntroShown(), tourActive: tour.active, blocked: introBlocked })
    ) {
      return;
    }
    setIntroCard(module);
  }, [activeNav, mistModalType, drawerOpen, drawerTab, petFirstOpen, tour.active, introCard, hardOverlayOpen]);

  const dismissIntroCard = useCallback(() => {
    const current = introCard;
    if (!current) return;
    saveIntroShown(markIntroShown(loadIntroShown(), current));
    if (current === "pet") setPetFirstOpen(false);
    setIntroCard(null);
  }, [introCard]);

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
        githubUser={githubUser}
        onLogout={onLogout}
      />

      {/* 右侧主工作流区域 */}
      <div className="flex flex-1 flex-col h-screen overflow-hidden bg-[var(--paper)] water-fluid-sidebar relative">
        {/* 顶部极简导航面包屑与状态 */}
        <DashboardHeader
          sidebarCollapsed={sidebarCollapsed}
          expandRipple={expandRipple}
          onExpandSidebar={handleExpandSidebar}
          activeNav={activeNav}
          running={botRuntime.running}
          statusText={botRuntime.statusText}
          lang={lang}
          onOpenSettingsModal={(tab) => {
            setSettingsModalTab(tab || "general");
            setSettingsModalOpen(true);
          }}
          githubUser={githubUser}
          onLogout={onLogout}
        />

        {/* 主内容区域 */}
        <main
          ref={wheel.mainScrollRef}
          className={`flex-1 ${
            activeNav === "workbench"
              ? "px-2 sm:px-4 lg:px-6 py-0 overflow-hidden"
              : activeNav === "resumes"
              ? "px-3 sm:px-5 py-3 space-y-4 overflow-y-auto"
              : activeNav === "polish" || activeNav === "copilot"
              ? "px-3 sm:px-5 py-3 flex flex-col overflow-y-auto"
              : activeNav === "live"
              ? "px-3 sm:px-5 py-3 flex flex-col overflow-hidden"
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

          {/* 常驻限额停机横幅：本地安全限额 / 平台限额提示，持续显示直到下一轮运行 */}
          {limitNotice && (
            <div className="flex items-center gap-3 border border-amber-500/50 bg-amber-500/10 px-4 py-3 rounded-xl shadow-md">
              <span className="min-w-0 flex-1 break-words text-sm text-amber-300">
                {limitNotice.message}
              </span>
              <button
                className="btn-primary"
                onClick={() => setActiveNav("analytics")}
                disabled={busy}
              >
                {t("limit.openRecords")}
              </button>
              <button className="btn-ghost" onClick={() => setLimitNotice(null)}>
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
              defaultResumeName={defaultResumeName}
              onGoToResumes={() => setActiveNav("resumes")}
              onBackToWorkbench={() => {
                setActiveNav("workbench");
                wheel.scrollToRingStage(2, true);
              }}
              onSaveConfig={async () => {
                // 包装画像保存：成功时点亮新手引导第二步（未开引导时无副作用）
                const ok = await profileForm.saveConfig();
                if (ok) tour.markProfileSaved();
                return ok;
              }}
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
                  setActiveNav("polish");
                }}
                onGoToProfile={() => setActiveNav("profile")}
              />
            </div>
          )}

          {/* TAB 4: 简历精修 Studio (深度诊断、通俗化改写技能包与前后对比) */}
          {activeNav === "polish" && (
            <div className="w-full flex-1 flex flex-col">
              <ResumePolishView getCurrentForm={profileForm.currentProfileData} />
            </div>
          )}

          {/* TAB 5: AI 智能管家 (全能操作管家、软件全知答疑、简历深度辅导与求职闲聊) */}
          {activeNav === "copilot" && (
            <div className="w-full flex-1 flex flex-col">
              <CareerCopilotView
                getCurrentForm={profileForm.currentProfileData}
                onApply={(data) =>
                  profileForm.hydrateFromProfile({
                    name: profileForm.profileName,
                    path: "",
                    data,
                  })
                }
                onRun={() => botRuntime.startRun()}
                onOpenSettings={(tab?: "rules" | "policy" | "greeting" | "basic" | "model") => {
                  if (tab === "rules" || tab === "policy" || tab === "greeting" || tab === "model") {
                    setMistModalType(tab);
                  } else {
                    setMistModalType("model");
                  }
                }}
                onExecuteAction={handleExecuteAppAction}
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

          {/* TAB 6: 实时巡航监控（启动巡航后自动跳转到这里） */}
          {activeNav === "live" && (
            <LiveCruiseView
              onStartRun={() => {
                botRuntime.startRun();
              }}
              onStopRun={botRuntime.stopRun}
              busy={busy}
            />
          )}
        </main>
      </div>

      {/* 弹窗与悬浮层外壳 */}
      <StartConfirmDialog />
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
        onPetFirstInteract={() => setPetFirstOpen(true)}
      />

      {/* 新手引导三步卡（弹窗打开时自动隐藏，关闭后回来） */}
      {tour.visible && tour.step && (
        <GuidedTour
          step={tour.step}
          stepIndex={tour.stepIndex}
          total={tour.total}
          t={t}
          onStart={tour.start}
          onAction={tour.act}
          onPrev={tour.prevStep}
          onNext={tour.next}
          onSkip={tour.skip}
        />
      )}

      {/* 模块首次打开介绍卡（压在雾化弹窗之上，看过永不复弹） */}
      {introCard && <ModuleIntroCard module={introCard} t={t} onClose={dismissIntroCard} />}
    </div>
  );
}
