import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { useRunStore } from "../store";
import type { GuidedTourStep } from "../components/onboarding/GuidedTour";
import {
  TOUR_STEP_IDS,
  autoSignals,
  loadTourStatus,
  markStepDone,
  nextStep,
  resetTourStatus,
  saveTourStatus,
  type TourStepId,
  type TourStatus,
} from "../lib/onboarding";

/**
 * 新手引导状态机（2026-10-14 用户需求，同日 V0.3 增补）。
 *
 * 引导状态按 GitHub 账号隔离（换号登录会重新弹引导）；
 * 「关于与帮助」的"再次引导"按钮通过 store.tourResetTick 触发完整重置。
 *
 * 三个完成信号自动点亮步骤（幂等，用户绕过引导自己做完同样生效）：
 * - model   ← store.llmConfig.configured（保存/测试成功置位；启动时若 store 为空会主动拉一次）
 * - profile ← 画像页保存成功（Dashboard 包装 onSaveConfig 调 markProfileSaved）
 * - cruise  ← botRuntime.running
 *
 * 光标（cursor）规则：welcome → 首个未完成步；「下一步」= 手动自证完成并推进；
 * 「上一步」只回看已完成步骤（信号推进只认"新完成"，不跟用户回看抢光标）。
 * blocked（设置弹窗等）时卡片整体隐藏，关闭后自动回来。
 */
export function useOnboardingTour({
  t,
  login,
  running,
  blocked,
  actions,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  login: string;
  running: boolean;
  blocked: boolean;
  actions: Record<TourStepId, () => void>;
}) {
  const llmConfig = useRunStore((s) => s.llmConfig);
  const setLLMConfig = useRunStore((s) => s.setLLMConfig);
  const tourResetTick = useRunStore((s) => s.tourResetTick);
  const llmConfigured = !!llmConfig?.configured;

  // login 在 Dashboard 的一次挂载内不变（换号会先回登录门禁、Dashboard 重挂载），
  // 用 ref 供各回调稳定读取。
  const loginRef = useRef(login);
  loginRef.current = login;

  const [status, setStatus] = useState<TourStatus>(() => loadTourStatus(login));
  const [started, setStarted] = useState(() => loadTourStatus(login).doneSteps.length > 0);
  const [cursor, setCursor] = useState<number>(() => {
    const first = nextStep(loadTourStatus(login).doneSteps);
    return first ? TOUR_STEP_IDS.indexOf(first) : TOUR_STEP_IDS.length;
  });

  // 启动自检：store 里 llmConfig 为空就主动拉一次（老用户可能早已配好模型，
  // 否则引导会误以为第一步没完成）。AgentPanel 挂载时也做同样的事，幂等。
  useEffect(() => {
    if (llmConfig === null) {
      ipc.getLLMConfig().then((cfg) => setLLMConfig(cfg)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「关于与帮助」→ 再次引导：删掉该账号的存储 key 并整体回到欢迎卡。
  // 设置弹窗还开着时卡片被 blocked 挡住，关闭弹窗后立即出现，时序自然。
  const doneToastShownRef = useRef(status.status === "done");
  useEffect(() => {
    if (tourResetTick === 0) return;
    resetTourStatus(loginRef.current);
    doneToastShownRef.current = false;
    setStatus({ status: "active", doneSteps: [] });
    setStarted(false);
    setCursor(0);
  }, [tourResetTick]);

  const active = status.status === "active";
  const currentId: TourStepId | null =
    cursor >= 0 && cursor < TOUR_STEP_IDS.length ? TOUR_STEP_IDS[cursor] : null;
  const step: GuidedTourStep | null = active
    ? !started
      ? "welcome"
      : currentId
    : null;

  // 信号 → 自动点亮"用户正在看的那一步"（2026-10-14 V0.3 修复，实测 bug：
  // 老用户启动时模型早已配置，按状态直接点亮会把第一步整个吞掉——进来直接
  // 第二步、第一步下一步跳第三步。引导必须完整走）。规则：
  // 1. 只认信号从无到有的"跳变"（首次运行把当前状态吸收为基线）——启动时
  //    已存在的配置不会再触发跳步；
  // 2. 只对 currentId 生效——用户正看着这一步、恰好把它做完了，才自动点亮
  //    并前进；前方的步骤一律等用户自己走到。
  const prevSignalsRef = useRef<Set<TourStepId> | null>(null);
  useEffect(() => {
    const signals = new Set(autoSignals({ llmConfigured, running }));
    const prev = prevSignalsRef.current;
    const newlyFired = prev === null ? [] : [...signals].filter((id) => !prev.has(id));
    prevSignalsRef.current = signals;

    if (!active || !started || !currentId) return;
    if (!newlyFired.includes(currentId)) return;
    if (status.doneSteps.includes(currentId)) return; // 上一步回看已完成步骤：不弹走
    const merged = markStepDone(status, currentId);
    saveTourStatus(merged, loginRef.current);
    setStatus(merged);
    const first = nextStep(merged.doneSteps);
    setCursor(first ? TOUR_STEP_IDS.indexOf(first) : TOUR_STEP_IDS.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmConfigured, running, active, started, currentId, status]);

  // 全部完成 → 中央提示（每次"重新完成"都弹一次——重置时会清 doneToastShownRef）
  useEffect(() => {
    if (status.status === "done" && !doneToastShownRef.current) {
      doneToastShownRef.current = true;
      useRunStore.getState().showCenterToast(t("tour.finishToast"), { tone: "success" });
    }
  }, [status.status, t]);

  const start = useCallback(() => setStarted(true), []);

  const act = useCallback(
    (id: TourStepId) => {
      actions[id]?.();
    },
    [actions],
  );

  /** 手动自证完成当前步并推进（无论信号是否已点亮）。 */
  const next = useCallback(() => {
    if (!currentId) return;
    const merged = markStepDone(status, currentId);
    if (merged !== status) {
      saveTourStatus(merged, loginRef.current);
      setStatus(merged);
    }
    const first = nextStep(merged.doneSteps);
    setCursor(first ? TOUR_STEP_IDS.indexOf(first) : TOUR_STEP_IDS.length);
  }, [currentId, status]);

  const prevStep = useCallback(() => {
    setCursor((c) => Math.max(0, c - 1));
  }, []);

  const skip = useCallback(() => {
    setStatus((prev) => {
      const skipped = { ...prev, status: "skipped" as const };
      saveTourStatus(skipped, loginRef.current);
      return skipped;
    });
  }, []);

  /** 画像保存成功信号（由 Dashboard 包装 onSaveConfig 调用）。 */
  const markProfileSaved = useCallback(() => {
    setStatus((prev) => {
      const merged = markStepDone(prev, "profile");
      if (merged !== prev) saveTourStatus(merged, loginRef.current);
      return merged;
    });
  }, []);

  return {
    active,
    visible: active && !blocked && step !== null,
    step,
    stepIndex: cursor + 1,
    total: TOUR_STEP_IDS.length,
    start,
    act,
    next,
    prevStep,
    skip,
    markProfileSaved,
  };
}
