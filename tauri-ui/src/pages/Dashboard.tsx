import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  SlidersHorizontal,
  Briefcase,
  RotateCw,
  Search,
  Eye,
  Zap,
  ListOrdered,
  Terminal,
  Copy,
  Check,
  SkipForward,
  Square,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  X,
  Bot,
  User,
  PanelLeftOpen,
  Activity,
  FileText,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import { ipc, type AgentChatMessage, type LoadedProfile, type ProfileSummary, type ProgressEvent, type RunConfig } from "../lib/ipc";
import { summarizeAgentProfile } from "../lib/agentPreview";
import { optionLabel, type Lang } from "../lib/i18n";
import { TextEffect } from "@/components/core/text-effect";
import ResumePanel from "../components/ResumePanel";
import PlatformHub from "../components/PlatformHub";
import ProfilePanel from "../components/ProfilePanel";
import AgentPanel from "../components/AgentPanel";
import SettingsDrawer, { type DrawerTab } from "../components/SettingsDrawer";
import SettingsModal, { type SettingsTab } from "../components/SettingsModal";
import PipelineVisualizer from "../components/PipelineVisualizer";
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
  PLACEHOLDERS,
  BACKGROUND_TAGS,
  JOBSEEKER_SITUATION_BATCHES,
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
  const [consoleTab, setConsoleTab] = useState<"pipeline" | "events" | "logs">("pipeline");
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
  const [heroInputText, setHeroInputText] = useState("");
  const [heroChatting, setHeroChatting] = useState(false);
  const [heroChatMessages, setHeroChatMessages] = useState<AgentChatMessage[]>([]);
  const [heroProfileResult, setHeroProfileResult] = useState<Record<string, unknown> | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [recBatchIndex, setRecBatchIndex] = useState(0);
  const [isRotatingRec, setIsRotatingRec] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  // Hero 标题逐行阶梯动效循环状态 (第1行 -> 第2行 -> 第3行 依序显现并停留 10 秒循环)
  const [heroAnimCycle, setHeroAnimCycle] = useState(0);
  const [heroAnimStep, setHeroAnimStep] = useState(1);
  const [heroAnimFading, setHeroAnimFading] = useState(false);

  useEffect(() => {
    // 3行文字依次显现约 5.3s，全部显现后停留 10s，淡出 0.45s，随后自动开启新一轮循环
    const STAY_MS = 10000;
    const ANIM_TOTAL_MS = 5300;
    const FADE_OUT_MS = 450;
    const CYCLE_MS = ANIM_TOTAL_MS + STAY_MS + FADE_OUT_MS;

    const fadeTimer = setTimeout(() => {
      setHeroAnimFading(true);
    }, CYCLE_MS - FADE_OUT_MS);

    const resetTimer = setTimeout(() => {
      setHeroAnimFading(false);
      setHeroAnimStep(1);
      setHeroAnimCycle((c) => c + 1);
    }, CYCLE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(resetTimer);
    };
  }, [heroAnimCycle]);

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

  function handleNextRecBatch() {
    setIsRotatingRec(true);
    setTimeout(() => {
      setRecBatchIndex((prev) => (prev + 1) % JOBSEEKER_SITUATION_BATCHES.length);
      setIsRotatingRec(false);
    }, 200);
  }

  async function handleHeroChatSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || heroChatting) return;

    setHeroChatting(true);
    setHeroInputText("");
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

  const logRef = useRef<HTMLPreElement>(null);

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

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs.length]);

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

  const heroProfilePreview = useMemo(() => summarizeAgentProfile(heroProfileResult), [heroProfileResult]);

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
                <section
                  ref={heroStageRef}
                  className={
                    !isChattingOrHasHistory
                      ? "absolute inset-x-0 mx-auto w-full max-w-5xl px-2 sm:px-6 will-change-transform perspective-layer"
                      : "relative isolate overflow-visible w-full flex flex-col items-center justify-center py-6"
                  }
                  style={
                    !isChattingOrHasHistory
                      ? { transformOrigin: "center center", opacity: 1, zIndex: 30, transform: "none" }
                      : undefined
                  }
                >
                <div
                  ref={heroInnerRef}
                  className="mx-auto w-full flex flex-col items-center text-center perspective-layer relative z-10"
                >
                  <div className="dot-pattern absolute inset-0 -z-10 opacity-70 pointer-events-none" aria-hidden="true" />
                  <div
                    className="fx-glow w-full max-w-5xl pointer-events-none transition-all duration-500"
                    aria-hidden="true"
                  />

                  {/* 主标题与副标题 (逐行渐显动效流) */}
                  <div
                    className={`w-full transition-opacity duration-500 ease-out ${
                      heroAnimFading ? "opacity-0" : "opacity-100"
                    }`}
                  >
                    {/* 第 1 行: 主标题 */}
                    <h1 className="text-balance text-[2rem] font-bold leading-tight tracking-tight text-stone-100 sm:text-[2.75rem] sm:leading-[1.15]">
                      <TextEffect
                        key={`hero-l1-${heroAnimCycle}`}
                        preset="fade-in-blur"
                        speedReveal={1.1}
                        speedSegment={0.3}
                        delay={0}
                        as="span"
                        className="inline-block"
                      >
                        {lang === "en"
                          ? "Tell AI your situation, craft your custom profile"
                          : "向 AI 顾问说出你的情况，定制专属求职画像"}
                      </TextEffect>
                    </h1>

                    {/* 第 2 行 & 第 3 行: 副标题 */}
                    <div className="mt-3.5 max-w-2xl mx-auto text-balance text-[14px] leading-relaxed text-stone-400 sm:text-[15.5px] space-y-1">
                      <TextEffect
                        key={`hero-l2-${heroAnimCycle}`}
                        preset="fade-in-blur"
                        speedReveal={1.1}
                        speedSegment={0.3}
                        delay={1.7}
                        as="p"
                        className="m-0"
                      >
                        {lang === "en"
                          ? "Tell me your graduation year, skills, target cities or expected salary."
                          : "告诉我你的毕业年份、专业技能、意向城市或期望薪资。"}
                      </TextEffect>
                      <TextEffect
                        key={`hero-l3-${heroAnimCycle}`}
                        preset="fade-in-blur"
                        speedReveal={1.1}
                        speedSegment={0.3}
                        delay={3.5}
                        as="p"
                        className="m-0"
                      >
                        {lang === "en"
                          ? "AI advisor will chat with you to tailor precision job preferences and settings."
                          : "AI 顾问将与你深度交流，自动生成量身定制的求职偏好与就绪策略。"}
                      </TextEffect>
                    </div>
                  </div>

                  {/* Hunt Now 标志性 Beam Composer (宽屏大气光轨 AI 顾问对话舱) */}
                  <div className="relative mt-8 w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl transition-all duration-300 ease-in-out">
                    <div
                      className="absolute -inset-x-8 -inset-y-4 -z-10 rounded-[2.5rem] bg-gradient-to-b from-[#ff5722]/15 via-transparent to-transparent blur-2xl"
                      aria-hidden="true"
                    />
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleHeroChatSubmit(heroInputText);
                      }}
                      className="beam w-full rounded-[1.75rem] border border-white/10 bg-[#181614]/95 text-left shadow-2xl backdrop-blur-xl transition-all focus-within:border-[#ff5722]/60 focus-within:ring-2 focus-within:ring-[#ff5722]/20"
                    >
                      <div className="relative px-6 pt-5 sm:px-7 sm:pt-6">
                        <textarea
                          rows={2}
                          value={heroInputText}
                          onChange={(e) => setHeroInputText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              handleHeroChatSubmit(heroInputText);
                            }
                          }}
                          placeholder={PLACEHOLDERS[placeholderIndex]}
                          className="block min-h-[3.8rem] w-full resize-none bg-transparent text-base sm:text-[17px] leading-7 text-stone-100 outline-none placeholder:text-stone-500"
                        />
                      </div>

                      <div className="flex items-center gap-3 px-4 pb-3.5 pt-1 sm:px-5">
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] py-0.5">
                          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5722]/20 to-[#ff2a55]/20 border border-[#ff5722]/40 px-3 py-1.5 text-xs font-semibold text-[#ff5722] shadow-sm">
                            <Bot className="size-3.5" />
                            {lang === "en" ? "Tell AI" : "告诉顾问"}
                          </span>
                          {BACKGROUND_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setHeroInputText((prev) => (prev ? `${prev}，${tag}` : tag));
                              }}
                              className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] hover:border-white/25 px-3 py-1.5 text-xs text-stone-300 hover:text-white transition-all cursor-pointer shadow-sm whitespace-nowrap"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>

                        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-stone-500 xl:inline-flex">
                          <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-400">Enter</kbd> {lang === "en" ? "Send" : "发送"}
                        </span>

                        <button
                          type="submit"
                          disabled={heroChatting || !heroInputText.trim()}
                          title={lang === "en" ? "Send to AI Advisor" : "发送给 AI 顾问"}
                          aria-label={lang === "en" ? "Send to AI Advisor" : "发送给 AI 顾问"}
                          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-stone-950 transition-all hover:scale-105 active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                        >
                          {heroChatting ? (
                            <RotateCw className="size-4 animate-spin text-stone-900" />
                          ) : (
                            <ArrowUp className="size-5" />
                          )}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* 输入框下方：求职者个人背景情况案例（严格单行排列，带 ↗ 与 “换一批”动画） */}
                  <div className="mt-5 flex items-center justify-center gap-2.5 text-xs flex-nowrap overflow-x-auto [scrollbar-width:none] w-full px-2">
                    {JOBSEEKER_SITUATION_BATCHES[recBatchIndex].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => {
                          setHeroInputText(item.userText);
                          handleHeroChatSubmit(item.userText);
                        }}
                        className="group shrink-0 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1917]/80 hover:bg-[#25201d] hover:border-[#ff5722]/50 px-3.5 py-1.5 text-stone-300 hover:text-white backdrop-blur transition-all shadow-sm cursor-pointer whitespace-nowrap"
                      >
                        <span className="size-1.5 rounded-full bg-[#ff5722] group-hover:scale-125 transition-transform shadow-[0_0_6px_rgba(255,87,34,0.6)]" />
                        <span className="font-medium">{item.role}</span>
                        <span className="text-[11px] text-stone-400 group-hover:text-stone-300">· {item.tag}</span>
                        <ArrowUpRight className="size-3 text-stone-500 transition-colors group-hover:text-[#ff5722]" />
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={handleNextRecBatch}
                      className="group shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1c1917]/60 hover:bg-[#25201d] hover:border-white/20 px-3 py-1.5 text-stone-400 hover:text-white transition-all shadow-sm cursor-pointer whitespace-nowrap"
                      title={lang === "en" ? "Shuffle Cases" : "换一批求职者情况案例"}
                    >
                      <RotateCw className={`size-3.5 transition-transform duration-300 ${isRotatingRec ? "rotate-180" : ""}`} />
                      <span className="text-xs">{lang === "en" ? "Shuffle Cases" : "换一批情况"}</span>
                    </button>
                  </div>

                  {/* 人与 Agent 对话交互展示区（发送对话或点击情况案例后优雅展开） */}
                  {(heroChatMessages.length > 0 || heroChatting) && (
                    <div className="rise-in mt-6 w-full max-w-5xl rounded-2xl border border-[#ff5722]/40 bg-gradient-to-b from-[#1c1917]/95 to-[#12100e]/95 p-5 shadow-2xl backdrop-blur-xl text-left">
                      <div className="flex items-center justify-between pb-3 border-b border-stone-800/80 mb-3.5">
                        <span className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                          <Bot className="size-4 text-[#ff5722]" />
                          <span>AI 求职顾问交流实录</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setHeroChatMessages([]);
                              setHeroProfileResult(null);
                              setHeroInputText("");
                            }}
                            className="text-stone-400 hover:text-stone-200 text-xs flex items-center gap-1 cursor-pointer"
                            title="重新开始对话"
                          >
                            <RotateCw className="size-3" />
                            <span>清空重置</span>
                          </button>
                        </div>
                      </div>

                      {/* 对话消息气泡流 */}
                      <div className="space-y-3 mb-4 max-h-64 overflow-y-auto pr-1">
                        {heroChatMessages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                          >
                            <div
                              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                                msg.role === "user"
                                  ? "bg-[#ff5722] text-stone-950"
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              }`}
                            >
                              {msg.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                            </div>
                            <div
                              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                                msg.role === "user"
                                  ? "bg-[#ff5722]/15 border border-[#ff5722]/30 text-stone-100"
                                  : "bg-stone-900/90 border border-stone-800 text-stone-200"
                              }`}
                            >
                              <div className="text-[10px] text-stone-400 mb-0.5 font-semibold">
                                {msg.role === "user" ? "你的情况与诉求" : "AI 顾问建议"}
                              </div>
                              <div className="whitespace-pre-wrap">{msg.content}</div>
                            </div>
                          </div>
                        ))}

                        {heroChatting && (
                          <div className="flex items-start gap-2.5">
                            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Bot className="size-3.5 animate-pulse" />
                            </div>
                            <div className="rounded-2xl bg-stone-900/90 border border-stone-800 px-3.5 py-2 text-xs text-stone-400 flex items-center gap-2">
                              <span className="size-2 rounded-full bg-amber-400 animate-ping" />
                              <span>AI 顾问正在为您分析背景与规划画像...</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 提炼出的投递画像卡片 */}
                      {heroProfileResult && (
                        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                              <Sparkles className="size-3.5 text-[#ff5722]" />
                              <span>{lang === "en" ? "AI Job Profile Generated" : "AI 专属求职画像已就绪"}</span>
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-medium">
                              ● {lang === "en" ? "Ready" : "策略就绪"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs mb-3.5">
                            <div className="bg-stone-950/80 p-2.5 rounded-xl border border-stone-800/80">
                              <span className="text-stone-500 text-[10px] block font-medium">
                                {lang === "en" ? "Target Role:" : "目标岗位:"}
                              </span>
                              <span className="font-semibold text-stone-100">{heroProfilePreview?.query || label}</span>
                            </div>
                            <div className="bg-stone-950/80 p-2.5 rounded-xl border border-stone-800/80">
                              <span className="text-stone-500 text-[10px] block font-medium">
                                {lang === "en" ? "Target Cities:" : "意向城市:"}
                              </span>
                              <span className="font-semibold text-stone-100">{heroProfilePreview?.cities || cityValues || (lang === "en" ? "Nationwide / Any" : "全国/不限")}</span>
                            </div>
                            <div className="bg-stone-950/80 p-2.5 rounded-xl border border-stone-800/80">
                              <span className="text-stone-500 text-[10px] block font-medium">
                                {lang === "en" ? "Preferred Skills:" : "希望包含的技能:"}
                              </span>
                              <span className="text-emerald-400 font-medium truncate block">{heroProfilePreview?.anyKeywords || rule.anyKeywords || "-"}</span>
                            </div>
                            <div className="bg-stone-950/80 p-2.5 rounded-xl border border-stone-800/80">
                              <span className="text-stone-500 text-[10px] block font-medium">
                                {lang === "en" ? "Excluded Directions:" : "不考虑的方向/排除词:"}
                              </span>
                              <span className="text-red-400 font-medium truncate block">{heroProfilePreview?.excludeKeywords || rule.excludeKeywords || "-"}</span>
                            </div>
                          </div>

                          {/* 确认提示行与跳转按钮 */}
                          <div className="mt-3.5 pt-3 border-t border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs text-stone-300">
                              <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                              <span>
                                {lang === "en"
                                  ? "Please verify the AI-extracted information above. Confirm to proceed to Job Profile for fine-tuning."
                                  : "请核对上方 AI 提炼的求职信息是否准确。确认后可前往「求职画像」进行详细配置或手动微调。"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  hydrateFromProfile({ name: profileName, path: "", data: heroProfileResult });
                                  setActiveNav("profile");
                                }}
                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/15 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                              >
                                <UserCheck className="size-3.5" />
                                <span>{lang === "en" ? "Confirm & View Job Profile →" : "确认信息正确，前往求职画像 →"}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

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
                <div
                  ref={profileRef}
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
                  <div className="spatial-card-glow w-full rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--grid)]">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      {lang === "en" ? "Job Profile" : "求职画像"}
                    </span>
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {lang === "en" ? "Synced" : "已同步"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveNav("profile")}
                      className="text-xs flex items-center gap-1.5 py-1 px-3 rounded-lg border border-amber-500/40 hover:border-amber-500/70 text-amber-400 hover:text-amber-300 bg-amber-500/10 transition-all cursor-pointer font-medium"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>{lang === "en" ? "View / Edit Job Profile →" : "查看 / 手动修改求职画像 →"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveNav("analytics")}
                      className="text-xs flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-[var(--grid)] hover:border-stone-700 text-stone-300 hover:text-white bg-[#1c1917] transition-all cursor-pointer"
                    >
                      <Activity className="h-3.5 w-3.5 text-stone-400" />
                      <span>{lang === "en" ? "Analytics & Pipeline →" : "投递大屏 & 管线 →"}</span>
                    </button>
                  </div>
                </div>

                {/* 3列信息便当盒 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                  {/* 1. 意向岗位与地域 */}
                  <div
                    data-bento-col="0"
                    className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-3.5 flex flex-col justify-between transition-transform duration-75"
                  >
                    <div>
                      <div className="text-[10px] text-stone-500 font-medium">
                        {lang === "en" ? "Target Role & Cities" : "目标岗位与城市"}
                      </div>
                      <div className="text-sm font-bold text-[var(--ink)] mt-1 truncate">
                        {label || (lang === "en" ? "Not specified" : "未指定岗位")}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-stone-400 flex items-center gap-2">
                      <span>{lang === "en" ? "Cities: " : "城市: "}<strong className="text-stone-200">{cityValues || (lang === "en" ? "Nationwide / Any" : "全国/不限")}</strong></span>
                      <span className="text-stone-600">·</span>
                      <span>{lang === "en" ? "Edu: " : "学历: "}<strong className="text-stone-200">{educationValues || (lang === "en" ? "Any" : "不限")}</strong></span>
                    </div>
                  </div>

                  {/* 2. 默认投递简历 */}
                  <div
                    data-bento-col="1"
                    className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-3.5 flex flex-col justify-between transition-transform duration-75"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-stone-500 font-medium">
                        <span>{lang === "en" ? "Bound Resume" : "当前绑定简历"}</span>
                        <button
                          type="button"
                          onClick={() => setActiveNav("resumes")}
                          className="text-amber-400 hover:underline hover:text-amber-300 cursor-pointer"
                        >
                          {lang === "en" ? "Manage Resumes →" : "管理简历库 →"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1 min-w-0">
                        <FileText className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="text-xs font-semibold text-stone-200 truncate" title={defaultResumeName}>
                          {defaultResumeName || "我的求职简历.docx"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-stone-400">
                      {lang === "en" ? "Default attachment · Ready" : "默认附件 · 已准备就绪"}
                    </div>
                  </div>

                  {/* 3. 拟人风控与模式 */}
                  <div
                    data-bento-col="2"
                    className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-3.5 flex flex-col justify-between transition-transform duration-75"
                  >
                    <div>
                      <div className="text-[10px] text-stone-500 font-medium">
                        {lang === "en" ? "Cruise Mode & Safety" : "巡航模式与安全保护"}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                          {mode === "auto" ? (lang === "en" ? "Auto Apply" : "全自动投递") : mode === "review" ? (lang === "en" ? "Manual Review" : "逐条人工确认") : (lang === "en" ? "Scan Only" : "仅扫描测试")}
                        </span>
                        {dryRun && (
                          <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                            {lang === "en" ? "Dry Run" : "演练模式"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-stone-400 flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{lang === "en" ? "Interval: " : "拟人间歇: "}<strong>{delayMin}~{delayMax}s</strong></span>
                      <span className="text-stone-600">·</span>
                      <span>{lang === "en" ? "Quota: " : "每日限额: "}<strong>{dailyLimit}{lang === "en" ? "" : "次"}</strong></span>
                    </div>
                  </div>
                </div>

                {/* 巡航运行中动态条 */}
                {running && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-300 animate-pulse">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                      <span className="font-semibold">
                        {lang === "en" ? "Auto cruise running..." : "自动巡航正在运行中..."}
                      </span>
                      <span className="text-stone-400">
                        {lang === "en"
                          ? `Scanned: ${stats.scanned} · Sent: ${stats.sent} · Skipped: ${stats.skipped}`
                          : `已扫描: ${stats.scanned} · 成功投递: ${stats.sent} · 跳过: ${stats.skipped}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveNav("analytics")}
                      className="font-bold underline hover:text-emerald-200 cursor-pointer"
                    >
                      {lang === "en" ? "Go to live dashboard →" : "进入大屏监控实时状态 →"}
                    </button>
                  </div>
                )}
                  </div>
                </div>

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
            <div className="max-w-5xl mx-auto space-y-5">
              {/* 可视化自动化执行管线大屏 */}
              <PipelineVisualizer
                running={running}
                currentIndex={currentIndex}
                mode={mode}
                dryRun={dryRun}
                delayMin={delayMin}
                delayMax={delayMax}
                stats={stats}
                currentJob={currentJob}
                latestSent={latestSent}
                latestSkip={latestSkip}
                onOpenDrawer={() => handleOpenSettings("policy")}
              />

              {/* 模式选择与巡航控制卡片 */}
              <div className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--grid)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">巡航模式选择与控制</span>
                  <span className={running ? "status-on" : "status-idle"}>{statusText}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <ModeButton
                    active={mode === "scan"}
                    icon={<Search className="h-4 w-4" />}
                    title={t("mode.scan.title")}
                    desc={t("mode.scan.desc")}
                    onClick={() => setMode("scan")}
                  />
                  <ModeButton
                    active={mode === "review"}
                    icon={<Eye className="h-4 w-4" />}
                    title={t("mode.review.title")}
                    desc={t("mode.review.desc")}
                    onClick={() => setMode("review")}
                  />
                  <ModeButton
                    active={mode === "auto"}
                    icon={<Zap className="h-4 w-4" />}
                    title={t("mode.auto.title")}
                    desc={t("mode.auto.desc")}
                    onClick={() => setMode("auto")}
                  />
                </div>

                {mode === "auto" && (
                  <div className="risk-box mt-3">
                    {t("warning.auto")}
                  </div>
                )}

                {message && <div className="mt-3 message-line">{message}</div>}
              </div>

              {/* 实时事件流水与终端运行日志 */}
              <div className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--grid)]">
                  <div className="flex gap-4 text-xs font-bold">
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 pb-1 transition-all ${
                        consoleTab === "pipeline"
                          ? "border-b-2 border-amber-500 text-amber-400"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                      onClick={() => setConsoleTab("pipeline")}
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                      <span>实时事件流水 ({events.length})</span>
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 pb-1 transition-all ${
                        consoleTab === "logs"
                          ? "border-b-2 border-amber-500 text-amber-400"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                      onClick={() => setConsoleTab("logs")}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      <span>终端运行日志 ({logs.length})</span>
                    </button>
                  </div>
                  <button className="btn-ghost text-xs py-0.5 px-2 flex items-center gap-1" onClick={copyLogs}>
                    <Copy className="h-3 w-3" />
                    <span>{t("button.copyLogs")}</span>
                  </button>
                </div>

                <div className="mt-3">
                  {consoleTab === "pipeline" ? (
                    <div className="event-list h-96">
                      {events.length === 0 ? (
                        <p className="empty-text">{t("empty.events")}</p>
                      ) : (
                        events.slice(-150).map((event, index) => <EventRow key={`${event.kind}-${index}`} event={event} />)
                      )}
                    </div>
                  ) : (
                    <pre ref={logRef} className="log-box h-96">{logs.length ? logs.join("\n") : t("empty.logs")}</pre>
                  )}
                </div>
              </div>
            </div>
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

function ModeButton({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon?: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? "mode-button active" : "mode-button"}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className={active ? "text-amber-400" : "text-stone-400"}>{icon}</span>}
        <span className="block text-sm font-semibold">{title}</span>
      </div>
      <span className="block text-xs text-[var(--muted-fg)]">{desc}</span>
    </button>
  );
}

function EventRow({ event }: { event: ProgressEvent }) {
  const display = formatEventForDisplay(event, formatLocalTime());
  return (
    <div className={`event-row ${display.severity}`}>
      <div className="event-meta">
        <span className="event-time">{display.time || "-"}</span>
        <span className="event-title">{display.title}</span>
      </div>
      <div className="event-body">
        <span className="event-summary">{display.summary}</span>
        {display.details && <span className="event-details">{display.details}</span>}
      </div>
    </div>
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
