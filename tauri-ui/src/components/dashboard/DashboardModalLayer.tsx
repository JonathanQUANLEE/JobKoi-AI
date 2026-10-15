import React from "react";
import SettingsDrawer, { type DrawerTab } from "../SettingsDrawer";
import SettingsModal, { type SettingsTab } from "../SettingsModal";
import MistSettingsModal, { type MistModalType } from "../settings/MistSettingsModal";
import GlobalUsagiPet from "../pet/GlobalUsagiPet";
import CenterToast from "../core/CenterToast";
import LoginOverlay from "../core/LoginOverlay";
import CruiseEndDialog from "../core/CruiseEndDialog";
import type { Lang } from "../../lib/i18n";
import type { NavItem } from "../Sidebar";
import type { useProfileFormState } from "../../hooks/useProfileFormState";
import type { useJobBotRuntime } from "../../hooks/useJobBotRuntime";

interface DashboardModalLayerProps {
  drawerOpen: boolean;
  setDrawerOpen: (val: boolean) => void;
  drawerTab: DrawerTab;
  lang: Lang;
  setLang: (lang: Lang) => void;
  profileForm: ReturnType<typeof useProfileFormState>;
  busy: boolean;
  settingsModalOpen: boolean;
  setSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  settingsModalTab: SettingsTab;
  setSettingsModalTab: (tab: SettingsTab) => void;
  defaultResumeName: string;
  setActiveNav: (nav: NavItem) => void;
  mistModalType: MistModalType;
  setMistModalType: (type: MistModalType) => void;
  botRuntime: ReturnType<typeof useJobBotRuntime>;
  sidebarCollapsed: boolean;
  /** 宠物首次被用户按下：Dashboard 用它触发"宠物管家"介绍卡。 */
  onPetFirstInteract?: () => void;
}

export default function DashboardModalLayer({
  drawerOpen,
  setDrawerOpen,
  drawerTab,
  lang,
  setLang,
  profileForm,
  busy,
  settingsModalOpen,
  setSettingsModalOpen,
  settingsModalTab,
  setSettingsModalTab,
  defaultResumeName,
  setActiveNav,
  mistModalType,
  setMistModalType,
  botRuntime,
  sidebarCollapsed,
  onPetFirstInteract,
}: DashboardModalLayerProps) {
  return (
    <>
      {/* 软件中心浮现提示（登录成功等关键反馈） */}
      <CenterToast />

      {/* FaceID 式登录引导浮层（换号扫码全流程） */}
      <LoginOverlay />

      {/* 巡航结束说明弹窗（结束原因 + 按城市统计 + 建议） */}
      <CruiseEndDialog />

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
        liepinDelayMin={profileForm.liepinDelayMin}
        setLiepinDelayMin={profileForm.setLiepinDelayMin}
        liepinDelayMax={profileForm.liepinDelayMax}
        setLiepinDelayMax={profileForm.setLiepinDelayMax}
        job51DelayMin={profileForm.job51DelayMin}
        setJob51DelayMin={profileForm.setJob51DelayMin}
        job51DelayMax={profileForm.job51DelayMax}
        setJob51DelayMax={profileForm.setJob51DelayMax}
        maxSent={profileForm.maxSent}
        setMaxSent={profileForm.setMaxSent}
        dailyLimit={profileForm.dailyLimit}
        setDailyLimit={profileForm.setDailyLimit}
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

      {/* 4 大独立居中局部雾化悬浮设置弹窗 */}
      <MistSettingsModal
        type={mistModalType}
        onClose={() => setMistModalType(null)}
        rule={profileForm.rule}
        setRule={profileForm.setRule}
        dailyLimit={profileForm.dailyLimit}
        setDailyLimit={profileForm.setDailyLimit}
        delayMin={profileForm.delayMin}
        setDelayMin={profileForm.setDelayMin}
        delayMax={profileForm.delayMax}
        setDelayMax={profileForm.setDelayMax}
        liepinDelayMin={profileForm.liepinDelayMin}
        setLiepinDelayMin={profileForm.setLiepinDelayMin}
        liepinDelayMax={profileForm.liepinDelayMax}
        setLiepinDelayMax={profileForm.setLiepinDelayMax}
        job51DelayMin={profileForm.job51DelayMin}
        setJob51DelayMin={profileForm.setJob51DelayMin}
        job51DelayMax={profileForm.job51DelayMax}
        setJob51DelayMax={profileForm.setJob51DelayMax}
        greeting={profileForm.greeting}
        setGreeting={profileForm.setGreeting}
        onSaveConfig={profileForm.saveConfig}
      />

      {/* 乌萨奇全窗口自由停靠浮动特助 */}
      <GlobalUsagiPet
        running={botRuntime.running}
        onStartRun={botRuntime.startRun}
        onOpenSettingsModal={(tab) => {
          setSettingsModalTab((tab as SettingsTab) || "general");
          setSettingsModalOpen(true);
        }}
        lang={lang}
        sidebarCollapsed={sidebarCollapsed}
        onFirstInteract={onPetFirstInteract}
      />
    </>
  );
}
