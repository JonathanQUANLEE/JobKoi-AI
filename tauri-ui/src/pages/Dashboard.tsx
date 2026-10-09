import { useEffect, useState, type ReactNode } from "react";
import {
  SlidersHorizontal,
  Briefcase,
  Check,
  SkipForward,
  Square,
  FlaskConical,
  ShieldCheck,
  X,
  PanelLeftOpen,
  Activity,
  FileText,
  UserCheck,
} from "lucide-react";
import { ipc, type AgentChatMessage } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { optionLabel } from "../lib/i18n";
import ResumePanel from "../components/ResumePanel";
import PlatformHub from "../components/PlatformHub";
import ProfilePanel from "../components/ProfilePanel";
import AgentPanel from "../components/AgentPanel";
import AnalyticsPanel from "../components/AnalyticsPanel";
import HeroStage from "../components/workbench/HeroStage";
import ProfileBentoCard from "../components/workbench/ProfileBentoCard";
import { useWorkbenchWheel } from "../hooks/useWorkbenchWheel";
import { useProfileFormState } from "../hooks/useProfileFormState";
import { useJobBotRuntime } from "../hooks/useJobBotRuntime";
import SettingsDrawer, { type DrawerTab } from "../components/SettingsDrawer";
import SettingsModal, { type SettingsTab } from "../components/SettingsModal";
import Sidebar, { type NavItem } from "../components/Sidebar";
import { useRunStore, useT } from "../store";

import {
  extractFallbackProfile,
  formatJobLine,
  asRecord,
  asString,
} from "../lib/dashboardHelpers";

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

  const {
    profiles,
    setProfiles,
    profileName,
    setProfileName,
    mode,
    setMode,
    usrName,
    setUsrName,
    label,
    setLabel,
    startUrl,
    setStartUrl,
    greeting,
    setGreeting,
    greetingPath,
    setGreetingPath,
    rule,
    setRule,
    cityValues,
    setCityValues,
    educationValues,
    setEducationValues,
    bossActiveValues,
    setBossActiveValues,
    filterPolicy,
    setFilterPolicy,
    delayMin,
    setDelayMin,
    delayMax,
    setDelayMax,
    maxSent,
    setMaxSent,
    dailyLimit,
    setDailyLimit,
    dryRun,
    setDryRun,
    stopOnCaptcha,
    setStopOnCaptcha,
    sendResumeAfterGreeting,
    setSendResumeAfterGreeting,
    autoResumeOnReply,
    setAutoResumeOnReply,
    aiGreeting,
    setAiGreeting,
    refreshProfiles,
    loadProfile,
    hydrateFromProfile,
    currentProfileData,
    saveConfig,
    validateBeforeRun,
  } = useProfileFormState({
    t,
    setMessage,
    setBusy,
  });

  const {
    replyNotice,
    setReplyNotice,
    running,
    events,
    logs,
    stats,
    currentJob,
    latestSkip,
    latestSent,
    statusText,
    currentIndex,
    reviewPending,
    startRun,
    stopRun,
    resetChrome,
    openManualBrowser,
    copyLogs,
    openChatPage,
    submitReviewDecision,
  } = useJobBotRuntime({
    t,
    busy,
    setBusy,
    message,
    setMessage,
    usrName,
    label,
    dryRun,
    profileName,
    greeting,
    greetingPath,
    currentProfileData,
    validateBeforeRun,
  });

  // 同步当前默认简历名称，供工作台策略卡片实时展示
  useEffect(() => {
    ipc.listResumes().then((res) => {
      const def = res.resumes.find((r) => r.is_default) || res.resumes[0];
      if (def) setDefaultResumeName(def.name);
    }).catch(() => {});
  }, [activeNav]);

  // WorkBuddy 风格系统设置弹窗状态与快捷键 (Ctrl+,)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsTab>("general");

  // 侧边栏展开/收起状态（支持本地持久化与 Ctrl+B 快捷键，高保真复刻 WorkBuddy 侧边栏伸缩）
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("jobhunter_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
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

  const [expandRipple, setExpandRipple] = useState(false);

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

  // Hunt Now 风格 AI 顾问对话终端状态
  const [heroChatting, setHeroChatting] = useState(false);
  const [heroChatMessages, setHeroChatMessages] = useState<AgentChatMessage[]>([]);
  const [heroProfileResult, setHeroProfileResult] = useState<Record<string, unknown> | null>(null);

  const isChattingOrHasHistory = heroChatMessages.length > 0 || heroChatting;

  // =========================================================================
  // 学习 OptionWheel (React Bits) 的物理动力学平滑引擎 (Cylindrical 3D Wheel Physics)
  // =========================================================================
  const {
    mainScrollRef,
    heroStageRef,
    heroInnerRef,
    hubRef,
    profileRef,
    ringActiveIndex,
    scrollToRingStage,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerEnd,
  } = useWorkbenchWheel({
    isChattingOrHasHistory,
    activeNav,
  });

  async function handleHeroChatSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || heroChatting) return;

    setHeroChatting(true);
    setMessage(null);

    const userMsg: AgentChatMessage = { role: "user", content: trimmed };
    const newHistory: AgentChatMessage[] = [...heroChatMessages, userMsg];
    setHeroChatMessages(newHistory);
    pushAgentMessage(userMsg);

    try {
      const currentForm = currentProfileData();
      const res = await ipc.agentChat(trimmed, heroChatMessages.slice(-8), currentForm);
      if (res.status === "ok") {
        const reply = res.reply || "收到！已根据你的背景情况完成求职意向诊断与画像提炼。";
        const assistantMsg: AgentChatMessage = { role: "assistant", content: reply };
        setHeroChatMessages([...newHistory, assistantMsg]);
        pushAgentMessage(assistantMsg);

        if (res.profile) {
          setHeroProfileResult(res.profile);
          const preview = summarizeAgentProfile(res.profile);
          if (preview?.query && preview.query !== "-") setLabel(preview.query);
          if (preview?.cities) setCityValues(preview.cities);
          if (preview?.anyKeywords) setRule((prev) => ({ ...prev, anyKeywords: preview.anyKeywords }));
          if (preview?.excludeKeywords) setRule((prev) => ({ ...prev, excludeKeywords: preview.excludeKeywords }));
        }
      } else {
        const extracted = extractFallbackProfile(trimmed);
        let reply = res.message || "已收到你的求职背景情况。";
        if (res.code === "not_configured") {
          reply = `已收到你的求职情况！由于尚未在【设置 → AI 模型】中绑定 API Key，已先根据你提到的专业背景（${extracted.query} · ${extracted.cities || "全国"}）为你完成基础求职画像定制。建议在设置中填入 API Key 体验深度职业诊断。`;
        }
        const assistantMsg: AgentChatMessage = { role: "assistant", content: reply };
        setHeroChatMessages([...newHistory, assistantMsg]);
        pushAgentMessage(assistantMsg);

        setLabel(extracted.query);
        if (extracted.cities) setCityValues(extracted.cities);
        if (extracted.anyKeywords) setRule((prev) => ({ ...prev, anyKeywords: extracted.anyKeywords }));
        if (extracted.excludeKeywords) setRule((prev) => ({ ...prev, excludeKeywords: extracted.excludeKeywords }));

        setHeroProfileResult({
          search: { query: extracted.query },
          page_filters: { city: { values: extracted.cities ? extracted.cities.split(",") : [] } },
          filters: {
            title: {
              any: { keywords: extracted.anyKeywords ? extracted.anyKeywords.split(",") : [extracted.query] },
              exclude: { keywords: extracted.excludeKeywords ? extracted.excludeKeywords.split(",") : [] },
            },
          },
        });
      }
    } catch (err) {
      const errMsg = `顾问连线异常：${String(err)}`;
      const assistantMsg: AgentChatMessage = { role: "assistant", content: errMsg };
      setHeroChatMessages([...newHistory, assistantMsg]);
      pushAgentMessage(assistantMsg);
    } finally {
      setHeroChatting(false);
    }
  }

  function handleOpenSettings(tab?: DrawerTab) {
    if (tab) setDrawerTab(tab);
    setDrawerOpen(true);
  }



  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/* 左侧独立导航栏（支持展开/折叠伸缩） */}
      <Sidebar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        running={running}
        onStartRun={startRun}
        onStopRun={stopRun}
        busy={busy}
        onOpenSettings={handleOpenSettings}
        onOpenSettingsModal={() => setSettingsModalOpen(true)}
        onOpenBrowser={openManualBrowser}
        onResetBrowser={resetChrome}
        lang={lang}
        onSetLang={setLang}
        dailySentCount={stats.sent}
        dailyLimit={dailyLimit}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* 右侧主工作流区域（水波流体缓动，跟随侧边栏伸缩丝滑平移） */}
      <div className="flex flex-1 flex-col h-screen overflow-hidden bg-[var(--paper)] water-fluid-sidebar relative">
        {/* 左下角常驻状态徽章：AI 顾问在线（全局固定，无论切换哪个页面或卡片都保持不变） */}
        <div className="absolute bottom-4 left-6 z-30 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-950/80 px-3 py-1 text-xs text-emerald-300 backdrop-blur-md shadow-lg select-none pointer-events-none">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400"></span>
          </span>
          <span className="font-medium text-[11px] sm:text-xs">
            {lang === "en" ? "AI Advisor Online" : "AI 顾问在线"}
          </span>
        </div>

        {/* 顶部极简导航面包屑与状态 */}
        <header className="h-12 shrink-0 border-b border-[var(--grid)] bg-[#141210]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20">
          <div className="flex items-center gap-2 text-xs">
            {/* WorkBuddy 风格：展开侧边栏入口按钮（侧边栏收起时呈现，如水露凝结浮现；点击触发雨滴涟漪） */}
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={handleExpandSidebar}
                className="relative group flex items-center gap-1.5 rounded-lg border border-[var(--grid)] bg-[#1c1917] hover:bg-[#25201d] hover:border-amber-500/50 px-2.5 py-1 text-xs font-medium text-stone-200 hover:text-amber-400 shadow-sm transition-all cursor-pointer water-drop-btn mr-1.5 overflow-visible"
                title={lang === "en" ? "Expand Sidebar (Ctrl+B)" : "展开侧边栏 (Ctrl+B)"}
              >
                {expandRipple && (
                  <span className="pointer-events-none absolute inset-0 -m-3 flex items-center justify-center">
                    <span className="absolute h-8 w-8 rounded-full border border-amber-400/80 bg-amber-400/20 animate-raindrop-1" />
                    <span className="absolute h-8 w-8 rounded-full border border-cyan-400/70 bg-cyan-400/15 animate-raindrop-2" />
                  </span>
                )}
                <PanelLeftOpen className="h-3.5 w-3.5 text-amber-400 group-hover:scale-110 transition-transform relative z-10" />
                <span className="font-medium relative z-10">{lang === "en" ? "Expand" : "展开侧边栏"}</span>
                <span className="hidden md:inline-block text-[10px] text-stone-500 font-mono ml-0.5 relative z-10">Ctrl+B</span>
              </button>
            )}

            <span className="text-[var(--muted-fg)]">JobHunter</span>
            <span className="text-stone-600">/</span>
            <span className="font-semibold text-[var(--ink)]">
              {activeNav === "workbench" && (lang === "en" ? "Workbench" : "巡航工作台")}
              {activeNav === "profile" && (lang === "en" ? "Job Profile" : "求职画像")}
              {activeNav === "resumes" && (lang === "en" ? "Resume Vault" : "简历资料库")}
              {activeNav === "copilot" && (lang === "en" ? "AI Copilot" : "AI 意向助理")}
              {activeNav === "analytics" && (lang === "en" ? "Analytics & Logs" : "投递数据与日志")}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {dryRun && (
              <span className="flex items-center gap-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                <FlaskConical className="h-3 w-3" />
                <span>{lang === "en" ? "Dry Run" : "演练模式"}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="btn-ghost !py-1 !px-2.5 text-xs flex items-center gap-1.5 rounded-lg border border-[var(--grid)] hover:border-amber-500/40 text-amber-400 cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{lang === "en" ? "Settings" : "系统设置"}</span>
            </button>
            <span className={running ? "status-on" : "status-idle"}>
              <span className={`inline-block h-2 w-2 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
              {statusText}
            </span>
          </div>
        </header>

        {/* 主内容区域（挂载 3D 物理动力学轮盘叙事引擎 Ref，初始态下全屏沉浸防跳帧） */}
        <main
          ref={mainScrollRef}
          className={`flex-1 ${
            activeNav === "workbench" && !isChattingOrHasHistory
              ? "px-4 sm:px-6 py-0 overflow-hidden"
              : "px-6 py-5 space-y-6 overflow-y-auto"
          }`}
        >
          {replyNotice && (
            <div className="flex items-center gap-3 border border-[var(--signal)] bg-[var(--panel-2)] px-4 py-3 rounded-xl shadow-md">
              <span className="min-w-0 flex-1 break-words text-sm text-[var(--signal)]">
                {t("reply.notice", { count: replyNotice.unread })}
              </span>
              <button
                className="btn-primary"
                onClick={() => openChatPage(replyNotice.chatUrl)}
                disabled={busy}
              >
                {t("reply.openChat")}
              </button>
              <button className="btn-ghost" onClick={() => setReplyNotice(null)}>
                {t("reply.dismiss")}
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: 巡航工作台 (3D 万花筒环形滚轮空间系统 - OptionWheel 动力学驱动)    */}
          {/* ========================================================================= */}
          {activeNav === "workbench" && (
            <div
              className={
                !isChattingOrHasHistory
                  ? "relative w-full h-[calc(100vh-3rem)] overflow-hidden flex items-center justify-center select-none"
                  : "space-y-8 mx-auto w-full max-w-5xl px-2 sm:px-6 py-6 transition-all"
              }
            >
              <div
                className={
                  !isChattingOrHasHistory
                    ? "relative h-full w-full overflow-hidden perspective-stage flex items-center justify-center select-none"
                    : "space-y-8 w-full"
                }
                onPointerDown={!isChattingOrHasHistory ? handleStagePointerDown : undefined}
                onPointerMove={!isChattingOrHasHistory ? handleStagePointerMove : undefined}
                onPointerUp={!isChattingOrHasHistory ? handleStagePointerEnd : undefined}
                onPointerCancel={!isChattingOrHasHistory ? handleStagePointerEnd : undefined}
              >
                {/* 阶段 1：首屏绝对主角 Hero Section (AI 对话中心) */}
                <HeroStage
                  heroStageRef={heroStageRef}
                  heroInnerRef={heroInnerRef}
                  isChattingOrHasHistory={isChattingOrHasHistory}
                  heroChatMessages={heroChatMessages}
                  heroChatting={heroChatting}
                  heroProfileResult={heroProfileResult}
                  onChatSubmit={handleHeroChatSubmit}
                  onResetChat={() => {
                    setHeroChatMessages([]);
                    setHeroProfileResult(null);
                  }}
                  onConfirmProfile={() => {
                    if (heroProfileResult) {
                      hydrateFromProfile({ name: profileName, path: "", data: heroProfileResult });
                      setActiveNav("profile");
                    }
                  }}
                  currentLabel={label}
                  currentCityValues={cityValues}
                  currentRule={rule}
                  lang={lang}
                />

                {/* ===================================================================== */}
                {/* 阶段 2：招聘平台中心 (3D 环形柱面展开，基于滚轮在圆弧上下滚动)           */}
                {/* ===================================================================== */}
                <div
                  ref={hubRef}
                  className={
                    !isChattingOrHasHistory
                      ? "absolute inset-x-0 mx-auto w-full max-w-5xl px-2 sm:px-6 will-change-transform perspective-layer"
                      : "relative w-full"
                  }
                  style={
                    !isChattingOrHasHistory
                      ? {
                          transformOrigin: "center center",
                          opacity: 0,
                          pointerEvents: "none",
                          zIndex: 10,
                          transform: "perspective(1400px) translateY(120vh) rotateX(24deg) scale(0.8)",
                        }
                      : undefined
                  }
                >
                  <div className="spatial-card-glow rounded-3xl">
                    <PlatformHub
                      lang={lang}
                      selectedPlatform={selectedPlatform}
                      onSelectPlatform={setSelectedPlatform}
                    />
                  </div>
                </div>

                {/* 人工审核卡片（如果处于 review 暂停中） */}
                {reviewPending && (
                  <div className="w-full max-w-5xl mx-auto px-2 sm:px-6">
                    <Panel title={t("panel.review")}>
                      <ReviewCard
                        pending={reviewPending}
                        busy={busy}
                        onDecision={submitReviewDecision}
                        t={t}
                      />
                    </Panel>
                  </div>
                )}

                {/* ===================================================================== */}
                {/* 阶段 3：求职画像总览 (3D 环形万花筒圆弧翻折展开)                         */}
                {/* ===================================================================== */}
                <ProfileBentoCard
                  profileRef={profileRef}
                  isChattingOrHasHistory={isChattingOrHasHistory}
                  label={label}
                  cityValues={cityValues}
                  educationValues={educationValues}
                  defaultResumeName={defaultResumeName}
                  mode={mode}
                  dryRun={dryRun}
                  delayMin={delayMin}
                  delayMax={delayMax}
                  dailyLimit={dailyLimit}
                  running={running}
                  stats={stats}
                  onGoToProfile={() => setActiveNav("profile")}
                  onGoToAnalytics={() => setActiveNav("analytics")}
                  onGoToResumes={() => setActiveNav("resumes")}
                  lang={lang}
                />

                {/* 右侧 3D 环形万花筒位置指示点（纯净三点设计，无方框） */}
                {!isChattingOrHasHistory && (
                  <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-3.5 select-none">
                    <button
                      type="button"
                      onClick={() => scrollToRingStage(0)}
                      className="p-1.5 cursor-pointer transition-all outline-none group"
                      title={lang === "en" ? "AI Advisor" : "AI 顾问"}
                      aria-label={lang === "en" ? "AI Advisor" : "AI 顾问"}
                    >
                      <span
                        className={`block rounded-full transition-all duration-300 ${
                          ringActiveIndex === 0
                            ? "size-2.5 bg-[#ff5722] shadow-[0_0_10px_rgba(255,87,34,0.9)] scale-125"
                            : "size-2 bg-stone-600 group-hover:bg-stone-400 group-hover:scale-125"
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => scrollToRingStage(1)}
                      className="p-1.5 cursor-pointer transition-all outline-none group"
                      title={lang === "en" ? "Platforms Hub" : "招聘平台"}
                      aria-label={lang === "en" ? "Platforms Hub" : "招聘平台"}
                    >
                      <span
                        className={`block rounded-full transition-all duration-300 ${
                          ringActiveIndex === 1
                            ? "size-2.5 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] scale-125"
                            : "size-2 bg-stone-600 group-hover:bg-stone-400 group-hover:scale-125"
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => scrollToRingStage(2)}
                      className="p-1.5 cursor-pointer transition-all outline-none group"
                      title={lang === "en" ? "Job Profile" : "求职画像"}
                      aria-label={lang === "en" ? "Job Profile" : "求职画像"}
                    >
                      <span
                        className={`block rounded-full transition-all duration-300 ${
                          ringActiveIndex === 2
                            ? "size-2.5 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] scale-125"
                            : "size-2 bg-stone-600 group-hover:bg-stone-400 group-hover:scale-125"
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 求职画像 (原“招聘平台中心”位置已升级为专属求职画像微调面板) */}
          {activeNav === "profile" && (
            <ProfilePanel
              label={label}
              setLabel={setLabel}
              cityValues={cityValues}
              setCityValues={setCityValues}
              educationValues={educationValues}
              setEducationValues={setEducationValues}
              rule={rule}
              setRule={setRule}
              dailyLimit={dailyLimit}
              setDailyLimit={setDailyLimit}
              dryRun={dryRun}
              setDryRun={setDryRun}
              defaultResumeName={defaultResumeName}
              onGoToResumes={() => setActiveNav("resumes")}
              onBackToWorkbench={() => {
                setActiveNav("workbench");
                scrollToRingStage(0);
              }}
              onSaveConfig={saveConfig}
              lang={lang}
              busy={busy}
            />
          )}

          {/* TAB 3: 简历资料库 */}
          {activeNav === "resumes" && (
            <div className="max-w-4xl mx-auto space-y-5">
              <ResumePanel />
            </div>
          )}

          {/* TAB 4: AI 意向助理 (完整对话面板) */}
          {activeNav === "copilot" && (
            <div className="max-w-4xl mx-auto space-y-5">
              <AgentPanel
                getCurrentForm={currentProfileData}
                onApply={(data) => hydrateFromProfile({ name: profileName, path: "", data })}
                onRun={() => startRun()}
                onOpenSettings={handleOpenSettings}
              />
            </div>
          )}

          {/* TAB 5: 投递数据与自动化执行大屏 */}
          {activeNav === "analytics" && (
            <AnalyticsPanel
              mode={mode}
              setMode={setMode}
              running={running}
              currentIndex={currentIndex}
              dryRun={dryRun}
              delayMin={delayMin}
              delayMax={delayMax}
              stats={stats}
              currentJob={currentJob}
              latestSent={latestSent}
              latestSkip={latestSkip}
              events={events}
              logs={logs}
              statusText={statusText}
              message={message}
              onOpenDrawer={handleOpenSettings}
              onCopyLogs={copyLogs}
            />
          )}
        </main>
      </div>

      {/* 侧边滑出高级设置抽屉 (Settings Drawer) */}
      <SettingsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initialTab={drawerTab}
        lang={lang}
        profiles={profiles}
        profileName={profileName}
        setProfileName={setProfileName}
        onLoadProfile={loadProfile}
        onSaveConfig={saveConfig}
        busy={busy}
        usrName={usrName}
        setUsrName={setUsrName}
        label={label}
        setLabel={setLabel}
        startUrl={startUrl}
        setStartUrl={setStartUrl}
        rule={rule}
        setRule={setRule}
        cityValues={cityValues}
        setCityValues={setCityValues}
        educationValues={educationValues}
        setEducationValues={setEducationValues}
        bossActiveValues={bossActiveValues}
        setBossActiveValues={setBossActiveValues}
        filterPolicy={filterPolicy}
        setFilterPolicy={setFilterPolicy}
        greetingPath={greetingPath}
        setGreetingPath={setGreetingPath}
        greeting={greeting}
        setGreeting={setGreeting}
        delayMin={delayMin}
        setDelayMin={setDelayMin}
        delayMax={delayMax}
        setDelayMax={setDelayMax}
        maxSent={maxSent}
        setMaxSent={setMaxSent}
        dailyLimit={dailyLimit}
        setDailyLimit={setDailyLimit}
        dryRun={dryRun}
        setDryRun={setDryRun}
        stopOnCaptcha={stopOnCaptcha}
        setStopOnCaptcha={setStopOnCaptcha}
        sendResumeAfterGreeting={sendResumeAfterGreeting}
        setSendResumeAfterGreeting={setSendResumeAfterGreeting}
        autoResumeOnReply={autoResumeOnReply}
        setAutoResumeOnReply={setAutoResumeOnReply}
        aiGreeting={aiGreeting}
        setAiGreeting={setAiGreeting}
      />

      {/* WorkBuddy 风格系统设置弹窗 (通用/个人主页/外观主题/快捷键/AI模型/关于帮助) */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={settingsModalTab}
        lang={lang}
        onSetLang={setLang}
        usrName={usrName}
        setUsrName={setUsrName}
        label={label}
        defaultResumeName={defaultResumeName}
        onGoToResumes={() => {
          setSettingsModalOpen(false);
          setActiveNav("resumes");
        }}
        onSaveConfig={saveConfig}
        busy={busy}
      />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">{title}</div>
      {children}
    </section>
  );
}


function ReviewCard({
  pending,
  busy,
  onDecision,
  t,
}: {
  pending: Record<string, unknown>;
  busy: boolean;
  onDecision: (decision: "send" | "skip" | "quit") => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const job = asRecord(pending.job);
  const details = asRecord(pending.details);
  return (
    <div className="space-y-3">
      <div className="review-title">{formatJobLine(job)}</div>
      <InfoLine label={t("review.matchInfo")} value={asString(details.reason, "-")} />
      <InfoLine label={t("review.jobDetail")} value={asString(pending.job_description, "-")} />
      <div>
        <span className="field-label">{t("review.greeting")}</span>
        <pre className="review-greeting">{asString(pending.greeting, "")}</pre>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-primary flex items-center justify-center gap-1.5" onClick={() => onDecision("send")} disabled={busy}>
          <Check className="h-3.5 w-3.5" />
          <span>{t("button.send")}</span>
        </button>
        <button className="btn-secondary flex items-center justify-center gap-1.5" onClick={() => onDecision("skip")} disabled={busy}>
          <SkipForward className="h-3.5 w-3.5" />
          <span>{t("button.skip")}</span>
        </button>
        <button className="btn-ghost flex items-center justify-center gap-1.5" onClick={() => onDecision("quit")} disabled={busy}>
          <Square className="h-3.5 w-3.5" />
          <span>{t("button.stop")}</span>
        </button>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 border-b border-[var(--grid)] pb-2">
      <span className="text-xs text-[var(--muted-fg)]">{label}</span>
      <span className="break-words text-[var(--ink)]">{value}</span>
    </div>
  );
}
