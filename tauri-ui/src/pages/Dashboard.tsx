import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { Channel } from "@tauri-apps/api/core";
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
import { ipc, type AgentChatMessage, type LoadedProfile, type ProfileSummary, type ProgressEvent, type RunConfig } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { optionLabel, type Lang } from "../lib/i18n";
import ResumePanel from "../components/ResumePanel";
import PlatformHub from "../components/PlatformHub";
import ProfilePanel from "../components/ProfilePanel";
import AgentPanel from "../components/AgentPanel";
import AnalyticsPanel from "../components/AnalyticsPanel";
import HeroStage from "../components/workbench/HeroStage";
import ProfileBentoCard from "../components/workbench/ProfileBentoCard";
import SettingsDrawer, { type DrawerTab } from "../components/SettingsDrawer";
import SettingsModal, { type SettingsTab } from "../components/SettingsModal";
import Sidebar, { type NavItem } from "../components/Sidebar";
import {
  buildProfileData,
  toggleCsvValue,
  type FilterPolicy,
  type MatchMode,
  type Mode,
  type RuleForm,
  type Scope,
} from "../lib/profileForm";
import { eventLogLine, formatEventForDisplay } from "../lib/eventDisplay";
import { latestPayloadForJob } from "../lib/runView";
import { useRunStore, useT } from "../store";

import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_GREETING,
  DEFAULT_RULE,
  PLATFORM_SHORTCUTS,
  extractFallbackProfile,
  joinKeywords,
  asRecord,
  asString,
  asBool,
  asMode,
  asScope,
  asMatchMode,
  latestPayload,
  latestJob,
  summarizeEvents,
  formatJobLine,
  toRepoRelativePath,
  formatLocalTime,
} from "../lib/dashboardHelpers";

export default function Dashboard() {
  const t = useT();
  const running = useRunStore((s) => s.running);
  const events = useRunStore((s) => s.events);
  const logs = useRunStore((s) => s.logs);
  const currentIndex = useRunStore((s) => s.currentIndex);
  const restoredStats = useRunStore((s) => s.restoredStats);
  const restoredCurrentJob = useRunStore((s) => s.restoredCurrentJob);
  const restoredLatestSkip = useRunStore((s) => s.restoredLatestSkip);
  const restoredLatestSent = useRunStore((s) => s.restoredLatestSent);
  const restoredPage = useRunStore((s) => s.restoredPage);
  const restoredPageFilters = useRunStore((s) => s.restoredPageFilters);
  const lang = useRunStore((s) => s.lang);
  const setLang = useRunStore((s) => s.setLang);
  const setRunning = useRunStore((s) => s.setRunning);
  const pushEvent = useRunStore((s) => s.pushEvent);
  const pushLog = useRunStore((s) => s.pushLog);
  const clear = useRunStore((s) => s.clear);
  const reviewPending = useRunStore((s) => s.reviewPending);
  const setReviewPending = useRunStore((s) => s.setReviewPending);
  const restoreRunState = useRunStore((s) => s.restoreRunState);
  const pushAgentMessage = useRunStore((s) => s.pushAgentMessage);

  const [selectedPlatform, setSelectedPlatform] = useState<string>("boss");
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profileName, setProfileName] = useState(DEFAULT_PROFILE_NAME);
  const [mode, setMode] = useState<Mode>("auto");
  const [usrName, setUsrName] = useState("");
  const [label, setLabel] = useState("后端开发实习");
  const [startUrl, setStartUrl] = useState("");
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [greetingPath, setGreetingPath] = useState("./greetings/default.txt");
  const [rule, setRule] = useState<RuleForm>(DEFAULT_RULE);
  const [cityValues, setCityValues] = useState("");
  const [educationValues, setEducationValues] = useState("");
  const [bossActiveValues, setBossActiveValues] = useState("");
  const [filterPolicy, setFilterPolicy] = useState<FilterPolicy>("warning");
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("60");
  const [maxSent, setMaxSent] = useState("50");
  const [dailyLimit, setDailyLimit] = useState("80");
  const [dryRun, setDryRun] = useState(true);
  const [stopOnCaptcha, setStopOnCaptcha] = useState(true);
  const [sendResumeAfterGreeting, setSendResumeAfterGreeting] = useState(false);
  const [autoResumeOnReply, setAutoResumeOnReply] = useState(false);
  const [aiGreeting, setAiGreeting] = useState(false);
  const [replyNotice, setReplyNotice] = useState<{ unread: number; chatUrl: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavItem>("workbench");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("rules");
  const [defaultResumeName, setDefaultResumeName] = useState<string>("我的求职简历.docx");

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

  // =========================================================================
  // 学习 OptionWheel (React Bits) 的物理动力学平滑引擎 (Cylindrical 3D Wheel Physics)
  // =========================================================================
  const mainScrollRef = useRef<HTMLElement>(null);
  const heroStageRef = useRef<HTMLDivElement>(null);
  const heroInnerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const stagePosRef = useRef<number>(0);
  const stageTargetRef = useRef<number>(0);
  const stageRafRef = useRef<number | null>(null);
  const stageLastTimeRef = useRef<number>(0);
  const stageWheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageDragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const stageDragMovedRef = useRef<boolean>(false);
  const ringActiveIndexRef = useRef<0 | 1 | 2>(0);

  const [ringActiveIndex, setRingActiveIndex] = useState<0 | 1 | 2>(0);
  const isChattingOrHasHistory = heroChatMessages.length > 0 || heroChatting;

  // 将 3D 环形柱面矩阵变换直接映射到 3 个卡片 DOM Ref（零 React Re-render 开销，GPU 硬件加速合成）
  const renderStageTransforms = useCallback((pos: number) => {
    const heroStage = heroStageRef.current;
    const hub = hubRef.current;
    const profile = profileRef.current;

    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;

    if (isChattingOrHasHistory || isReduced || isMobile) {
      [heroStage, hub, profile].forEach((el) => {
        if (el) {
          el.style.transform = "none";
          el.style.opacity = "1";
          el.style.filter = "none";
          el.style.pointerEvents = "auto";
          el.style.zIndex = "auto";
        }
      });
      const heroInner = heroInnerRef.current;
      if (heroInner) {
        heroInner.style.transform = "none";
        heroInner.style.opacity = "1";
        heroInner.style.filter = "none";
      }
      return;
    }

    if (!heroStage || !hub || !profile) return;

    const vh = window.innerHeight || 800;
    // 关键修复：增大垂直位移至至少 600px (或 vh * 0.8)，确保卡片完全移出黄金视界，杜绝上下卡片重叠！
    const stepY = Math.max(600, vh * 0.8);

    const stages = [
      { el: heroStage, index: 0 },
      { el: hub, index: 1 },
      { el: profile, index: 2 },
    ];

    stages.forEach(({ el, index }) => {
      const d = index - pos; // d = 0 时处于正中心黄金视界
      const dist = Math.abs(d);

      if (dist < 0.02) {
        // 当前卡片处于正中心展示
        el.style.transform = "none";
        el.style.opacity = "1";
        el.style.filter = "none";
        el.style.pointerEvents = "auto";
        el.style.zIndex = "30";
        return;
      }

      if (d > 0) {
        // 位于中心下方（尚未滚入的未来站台）
        // 如果用户在首屏 (pos <= 0.05) 或该卡片离中心较远 (d >= 0.85)，彻底隐藏 (opacity: 0)，绝不露脸重叠！
        if (pos <= 0.05 || d >= 0.85) {
          el.style.opacity = "0";
          el.style.transform = `perspective(1400px) translateY(${(stepY * 1.3).toFixed(1)}px) rotateX(24deg) scale(0.8)`;
          el.style.pointerEvents = "none";
          el.style.zIndex = "10";
          return;
        }

        // 当 0 < d < 0.85 时，平滑从下方向中心飞入上升：entryProg 从 0 ➔ 1
        const entryProg = Math.min(1, Math.max(0, (0.85 - d) / 0.85));
        const transY = stepY * (1.2 - 1.2 * Math.pow(entryProg, 0.88));
        const rotX = 22 * (1 - entryProg);
        const scale = 0.82 + 0.18 * entryProg;
        const opacity = entryProg;
        const blur = Math.min(2.5, 2 * (1 - entryProg));

        el.style.transform = `perspective(1400px) translateY(${transY.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = "15";
      } else {
        // 位于中心上方（已被滑过的过去站台，向上翻折折入天穹弧面）
        const pastProg = Math.min(1.8, Math.max(0, -d));
        
        // 关键修复：当 pastProg >= 0.8 时彻底透明淡出（opacity = 0），绝不挂在后方成为鬼影重叠！
        if (pastProg >= 0.8) {
          el.style.opacity = "0";
          el.style.transform = `perspective(1400px) translateY(${(-stepY * 1.3).toFixed(1)}px) rotateX(-22deg) scale(0.7)`;
          el.style.pointerEvents = "none";
          el.style.zIndex = "10";
          return;
        }

        const pastFade = 1 - pastProg / 0.8;
        const transY = -stepY * Math.pow(pastProg, 0.92);
        const rotX = -21 * Math.pow(pastProg, 0.85);
        const scale = Math.max(0.74, 1 - 0.22 * pastProg);
        const opacity = Math.max(0, pastFade * 0.55);
        const blur = Math.min(2.5, 2 * pastProg);

        el.style.transform = `perspective(1400px) translateY(${transY.toFixed(1)}px) rotateX(${rotX.toFixed(1)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = "10";
      }
    });
  }, [isChattingOrHasHistory]);

  // OptionWheel 核心 rAF 物理指数平滑渲染主循环
  const runStageFrame = useCallback((now: number) => {
    const dt = Math.min((now - stageLastTimeRef.current) / 1000, 0.05);
    stageLastTimeRef.current = now;

    // tau = 0.20 (200ms 时间阻尼常数，兼具响应度与丝滑度)
    const tau = 0.20;
    const k = 1 - Math.exp(-dt / tau);

    const target = stageTargetRef.current;
    const cur = stagePosRef.current;
    let next = cur + (target - cur) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    stagePosRef.current = next;

    renderStageTransforms(next);

    // 仅在整数索引改变时通知 React 更新右侧指示点
    const roundedIdx = Math.min(2, Math.max(0, Math.round(next))) as 0 | 1 | 2;
    if (roundedIdx !== ringActiveIndexRef.current) {
      ringActiveIndexRef.current = roundedIdx;
      setRingActiveIndex(roundedIdx);
    }

    if (!settled) {
      stageRafRef.current = requestAnimationFrame(runStageFrame);
    } else {
      stageRafRef.current = null;
    }
  }, [renderStageTransforms]);

  const startStageLoop = useCallback(() => {
    if (stageRafRef.current != null) {
      cancelAnimationFrame(stageRafRef.current);
    }
    stageLastTimeRef.current = performance.now();
    stageRafRef.current = requestAnimationFrame(runStageFrame);
  }, [runStageFrame]);

  const applyStageTarget = useCallback((value: number, snap: boolean) => {
    let v = Math.min(Math.max(value, 0), 2);
    if (snap) v = Math.round(v);
    stageTargetRef.current = v;
    startStageLoop();
  }, [startStageLoop]);

  const scrollToRingStage = useCallback((index: 0 | 1 | 2) => {
    applyStageTarget(index, true);
  }, [applyStageTarget]);

  // 滚轮与触控板事件监听（学习 OptionWheel 处理方式：非被动捕获、步长限制与自动吸附）
  useEffect(() => {
    const scrollEl = mainScrollRef.current;
    if (!scrollEl || isChattingOrHasHistory) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        if (target.scrollHeight > target.clientHeight) return;
      }

      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      
      // 学习 OptionWheel：将每个滚轮 step 映射为平滑的位移增量（步长限制防止跳帧）
      const step = Math.max(-1, Math.min(1, delta / 120));
      const nextTarget = Math.min(Math.max(stageTargetRef.current + step, 0), 2);
      applyStageTarget(nextTarget, false);

      if (stageWheelTimerRef.current) clearTimeout(stageWheelTimerRef.current);
      stageWheelTimerRef.current = setTimeout(() => {
        applyStageTarget(stageTargetRef.current, true);
      }, 150);
    };

    const handleResize = () => {
      renderStageTransforms(stagePosRef.current);
    };

    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", handleResize, { passive: true });
    
    // 初始化首屏渲染
    renderStageTransforms(stagePosRef.current);

    return () => {
      scrollEl.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", handleResize);
      if (stageWheelTimerRef.current) clearTimeout(stageWheelTimerRef.current);
      if (stageRafRef.current != null) cancelAnimationFrame(stageRafRef.current);
    };
  }, [isChattingOrHasHistory, applyStageTarget, renderStageTransforms]);

  // 监听导航切换：无论何时切回工作台，强制彻底重置到首屏 Hero 站台 0，绝不残留或重叠
  useEffect(() => {
    if (activeNav === "workbench" && !isChattingOrHasHistory) {
      stagePosRef.current = 0;
      stageTargetRef.current = 0;
      ringActiveIndexRef.current = 0;
      setRingActiveIndex(0);
      renderStageTransforms(0);
    }
  }, [activeNav, isChattingOrHasHistory, renderStageTransforms]);

  // Pointer 拖拽处理（支持鼠标光标按住上下拖动 3D 轮盘卡片）
  const handleStagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, a, [role='button'], .cursor-pointer")) return;
    stageDragRef.current = { y: e.clientY, start: stageTargetRef.current, id: e.pointerId };
    stageDragMovedRef.current = false;
  }, []);

  const handleStagePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = stageDragRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!stageDragMovedRef.current && Math.abs(dy) > 5) {
      stageDragMovedRef.current = true;
      e.currentTarget.setPointerCapture(drag.id);
    }
    if (stageDragMovedRef.current) {
      const vh = window.innerHeight || 800;
      const step = -dy / (vh * 0.4);
      applyStageTarget(Math.min(Math.max(drag.start + step, 0), 2), false);
    }
  }, [applyStageTarget]);

  const handleStagePointerEnd = useCallback(() => {
    if (!stageDragRef.current) return;
    stageDragRef.current = null;
    if (stageDragMovedRef.current) {
      applyStageTarget(stageTargetRef.current, true);
    }
  }, [applyStageTarget]);

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

  useEffect(() => {
    refreshProfiles(profileName);
    ipc.getGreeting()
      .then(({ path, text }) => {
        setGreetingPath(toRepoRelativePath(path));
        if (text) setGreeting(text);
      })
      .catch((err) => setMessage(t("message.greetingReadFailed", { error: String(err) })));
    ipc.getRunState()
      .then(({ running, review, stats, current_job, latest_skip, latest_sent, page, page_filters }) => {
        setRunning(running);
        setReviewPending(review?.pending ?? null);
        restoreRunState({
          stats,
          currentJob: current_job ?? null,
          latestSkip: latest_skip ?? null,
          latestSent: latest_sent ?? null,
          page: page ?? null,
          pageFilters: page_filters ?? [],
        });
      })
      .catch(() => {});
  }, [setRunning]);


  // F3：BOSS 新回复轮询（60s，仅空闲时）
  useEffect(() => {
    if (running) return;
    const timer = setInterval(async () => {
      try {
        const result = await ipc.checkBossReplies();
        if (result.status === "ok" && result.new_replies) {
          setReplyNotice({
            unread: result.unread ?? 0,
            chatUrl: result.chat_url ?? "https://www.zhipin.com/web/geek/chat",
          });
        }
      } catch {
        /* 轮询失败静默 */
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [running]);

  const eventStats = useMemo(() => summarizeEvents(events), [events]);
  const stats = events.length > 0 || !restoredStats ? eventStats : restoredStats;
  const currentJob = useMemo(() => latestJob(events) ?? restoredCurrentJob ?? undefined, [events, restoredCurrentJob]);
  const latestSkip = useMemo(
    () => latestPayloadForJob(events, "job_skipped", currentJob) ?? (events.length === 0 ? restoredLatestSkip : undefined) ?? undefined,
    [events, currentJob, restoredLatestSkip],
  );
  const latestSent = useMemo(
    () => latestPayloadForJob(events, "letter_sent", currentJob) ?? (events.length === 0 ? restoredLatestSent : undefined) ?? undefined,
    [events, currentJob, restoredLatestSent],
  );

  const statusText = running
    ? currentIndex
      ? t("status.runningIndex", { index: currentIndex })
      : t("status.starting")
    : t("status.idle");

  async function refreshProfiles(preferredName?: string) {
    try {
      const result = await ipc.listProfiles();
      setProfiles(result.profiles);
      const nextName =
        preferredName && result.profiles.some((item) => item.name === preferredName)
          ? preferredName
          : result.profiles.some((item) => item.name === DEFAULT_PROFILE_NAME)
            ? DEFAULT_PROFILE_NAME
            : result.profiles[0]?.name;
      if (nextName) {
        setProfileName(nextName);
        await loadProfile(nextName);
      }
    } catch (err) {
      setMessage(t("message.profileReadFailed", { error: String(err) }));
    }
  }

  async function loadProfile(name: string) {
    try {
      const profile = await ipc.getProfile(name);
      hydrateFromProfile(profile);
    } catch (err) {
      setMessage(t("message.profileLoadFailed", { error: String(err) }));
    }
  }

  function hydrateFromProfile(profile: LoadedProfile) {
    const data = profile.data;
    const search = asRecord(data.search);
    const filters = asRecord(asRecord(data.filters).title);
    const required = asRecord(filters.required);
    const any = asRecord(filters.any);
    const exclude = asRecord(filters.exclude);
    const send = asRecord(data.send);
    const pageFilters = asRecord(data.page_filters);

    setLabel(asString(search.query, label));
    setStartUrl(asString(search.start_url, startUrl));
    setMode(asMode(send.mode, mode));
    setGreetingPath(asString(send.greeting_file, greetingPath));
    setDelayMin(asString(send.delay_min, delayMin));
    setDelayMax(asString(send.delay_max, delayMax));
    setMaxSent(asString(send.max_sent, maxSent));
    setDailyLimit(asString(send.daily_sent_limit, dailyLimit));
    setStopOnCaptcha(asBool(send.stop_on_captcha, stopOnCaptcha));
    setSendResumeAfterGreeting(asBool(send.send_resume_after_greeting, false));
    setAutoResumeOnReply(asBool(send.auto_send_resume_on_reply, false));
    setAiGreeting(asBool(send.ai_greeting, false));
    setRule({
      requiredKeywords: joinKeywords(required.keywords, rule.requiredKeywords),
      anyKeywords: joinKeywords(any.keywords, rule.anyKeywords),
      excludeKeywords: joinKeywords(exclude.keywords, rule.excludeKeywords),
      scope: asScope(required.scope || any.scope || exclude.scope, rule.scope),
      match: asMatchMode(required.match || any.match || exclude.match, rule.match),
      caseSensitive: asBool(required.case_sensitive, rule.caseSensitive),
    });
    setFilterPolicy(pageFilters.strict === true ? "strict" : "warning");
    setCityValues(joinKeywords(asRecord(pageFilters.city).values, cityValues));
    setEducationValues(joinKeywords(asRecord(pageFilters.education).values, educationValues));
    setBossActiveValues(joinKeywords(asRecord(pageFilters.boss_active).values, bossActiveValues));
  }

  function currentProfileData() {
    return buildProfileData({
      label,
      startUrl,
      rule,
      cityValues,
      educationValues,
      bossActiveValues,
      filterPolicy,
      mode,
      greetingPath,
      delayMin,
      delayMax,
      maxSent,
      dailyLimit,
      stopOnCaptcha,
      sendResumeAfterGreeting,
      autoResumeOnReply,
      aiGreeting,
    });
  }

  async function saveConfig() {
    setBusy(true);
    setMessage(null);
    try {
      await ipc.saveGreeting(greeting.trim(), greetingPath.trim() || "./greetings/default.txt");
      const savedName = profileName.trim() || DEFAULT_PROFILE_NAME;
      await ipc.saveProfile(savedName, currentProfileData());
      await refreshProfiles(savedName);
      setMessage(t("message.saved"));
    } catch (err) {
      setMessage(t("message.saveFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  function validateBeforeRun(): string | null {
    if (!usrName.trim()) return t("validation.userName");
    if (!profileName.trim()) return t("validation.profileName");
    if ((mode === "review" || mode === "auto") && !greeting.trim()) return t("validation.greeting");
    if (mode === "auto" && !rule.anyKeywords.trim()) return t("validation.anyKeywords");
    return null;
  }

  async function startRun() {
    const error = validateBeforeRun();
    if (error) {
      setMessage(error);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await ipc.saveGreeting(greeting.trim(), greetingPath.trim() || "./greetings/default.txt");
      await ipc.saveProfile(profileName.trim(), currentProfileData());
      clear();
      setRunning(true);
      const progressChannel = new Channel<ProgressEvent>((ev) => {
        const timestamp = ev.ts_local || formatLocalTime();
        const event = { ...ev, ts_local: timestamp };
        pushEvent(event);
        pushLog(eventLogLine(event, timestamp));
      });
      const logChannel = new Channel<string>((line) => pushLog(`${formatLocalTime()} ${line}`));
      const config: RunConfig = {
        usrName: usrName.trim(),
        label: label.trim(),
        dryRun,
        profile: profileName.trim(),
        useCurrentPage: true,
      };
      await ipc.startRun(config, progressChannel, logChannel);
    } catch (err) {
      setRunning(false);
      pushLog(`${formatLocalTime()} ${t("message.startFailed", { error: String(err) })}`);
      setMessage(t("message.startFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function stopRun() {
    setBusy(true);
    try {
      await ipc.stopRun();
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.stopFailed", { error: String(err) })}`);
    } finally {
      setBusy(false);
    }
  }

  async function resetChrome() {
    setBusy(true);
    try {
      await ipc.shutdownBrowser();
      pushLog(`${formatLocalTime()} ${t("message.browserClosed")}`);
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.browserCloseFailed", { error: String(err) })}`);
    } finally {
      setBusy(false);
    }
  }

  async function openManualBrowser() {
    setBusy(true);
    setMessage(null);
    try {
      const state = await ipc.openManualBrowser();
      pushLog(`${formatLocalTime()} ${t("message.manualBrowserOpened")} ${state.url || ""}`.trim());
      setMessage(t("message.manualBrowserOpened"));
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.manualBrowserOpenFailed", { error: String(err) })}`);
      setMessage(t("message.manualBrowserOpenFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(logs.join("\n"));
      setMessage(t("message.logsCopied"));
    } catch {
      setMessage(t("message.logsCopyFailed"));
    }
  }

  async function openChatPage(url: string) {
    setBusy(true);
    try {
      await ipc.openManualBrowser(url);
      setReplyNotice(null);
    } catch (err) {
      setMessage(t("message.manualBrowserOpenFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function submitReviewDecision(decision: "send" | "skip" | "quit") {
    setBusy(true);
    setMessage(null);
    try {
      await ipc.submitReviewDecision(decision);
      setMessage(
        decision === "send" ? t("message.reviewSend") : decision === "skip" ? t("message.reviewSkip") : t("message.reviewQuit"),
      );
    } catch (err) {
      setMessage(t("message.reviewSubmitFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
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
