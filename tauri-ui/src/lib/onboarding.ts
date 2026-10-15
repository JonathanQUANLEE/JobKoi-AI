/**
 * 新手引导系统（2026-10-14 用户需求）：全部纯逻辑，IO 与 UI 解耦。
 *
 * 两条线：
 * 1. 首次登录三步引导（AI 模型配置 → 求职画像 → 平台扫码+自动巡航），
 *    可跳过、可断点续播；每步的"完成"由系统信号自动点亮：
 *    - model   ← store.llmConfig.configured（保存/测试成功时置位）
 *    - profile ← 求职画像页保存成功（saveConfig 返回 true）
 *    - cruise  ← botRuntime.running（巡航已启动）
 * 2. 模块首次打开介绍卡：10 个模块第一次进入时弹一次说明，看过的永不复弹。
 *
 * localStorage key 遵循项目惯例（jobkoi_* + _v1）：
 *   jobkoi_tour_done_v1    → { status: "active"|"done"|"skipped", doneSteps: [...] }
 *   jobkoi_intro_shown_v1  → ["profile", "resumes", ...]
 */

export const TOUR_STORAGE_KEY = "jobkoi_tour_done_v1";
export const INTRO_STORAGE_KEY = "jobkoi_intro_shown_v1";

/**
 * 引导状态按 GitHub 账号隔离（2026-10-14 用户反馈：换号登录应重新弹引导）。
 * 每个账号第一次登录都有自己的完整引导；正常用户安装后只弹一次。
 */
export function tourStorageKey(login: string): string {
  return login ? `${TOUR_STORAGE_KEY}:${login}` : TOUR_STORAGE_KEY;
}

export type TourStepId = "model" | "profile" | "cruise";

export type IntroModuleId =
  | "profile"
  | "resumes"
  | "polish"
  | "copilot"
  | "analytics"
  | "live"
  | "pet"
  | "rules"
  | "policy"
  | "model";

export type TourStatus = {
  status: "active" | "done" | "skipped";
  doneSteps: TourStepId[];
};

export const TOUR_STEP_IDS: readonly TourStepId[] = ["model", "profile", "cruise"];
const INTRO_MODULE_IDS: readonly IntroModuleId[] = [
  "profile",
  "resumes",
  "polish",
  "copilot",
  "analytics",
  "live",
  "pet",
  "rules",
  "policy",
  "model",
];

// ---------- 引导状态：解析 / 序列化（纯函数，node 测试可直接测） ----------

export function parseTourStatus(raw: string | null): TourStatus {
  const fallback: TourStatus = { status: "active", doneSteps: [] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { status?: unknown; doneSteps?: unknown };
    const status =
      parsed.status === "done" || parsed.status === "skipped" || parsed.status === "active"
        ? parsed.status
        : "active";
    const doneSteps = Array.isArray(parsed.doneSteps)
      ? parsed.doneSteps.filter(
          (id): id is TourStepId => typeof id === "string" && TOUR_STEP_IDS.includes(id as TourStepId),
        )
      : [];
    return { status, doneSteps };
  } catch {
    return fallback;
  }
}

export function loadTourStatus(login: string): TourStatus {
  try {
    return parseTourStatus(localStorage.getItem(tourStorageKey(login)));
  } catch {
    return { status: "active", doneSteps: [] };
  }
}

export function saveTourStatus(status: TourStatus, login: string): void {
  try {
    localStorage.setItem(tourStorageKey(login), JSON.stringify(status));
  } catch {
    /* localStorage 被禁/写失败：引导退化为会话内，不影响功能 */
  }
}

/** 重置某账号的引导（「关于与帮助」的"再次引导"按钮用）：删 key，下次读取即全新。 */
export function resetTourStatus(login: string): void {
  try {
    localStorage.removeItem(tourStorageKey(login));
  } catch {
    /* ignore */
  }
}

/** 下一个未完成的步骤；全部完成返回 null。 */
export function nextStep(doneSteps: TourStepId[]): TourStepId | null {
  return TOUR_STEP_IDS.find((id) => !doneSteps.includes(id)) ?? null;
}

/** 标记一步完成（幂等、忽略非法 id）。全部完成时自动收尾为 done。 */
export function markStepDone(status: TourStatus, id: TourStepId): TourStatus {
  if (!TOUR_STEP_IDS.includes(id)) return status;
  if (status.doneSteps.includes(id)) return status;
  const doneSteps = [...status.doneSteps, id];
  return {
    status: nextStep(doneSteps) === null ? "done" : status.status === "skipped" ? "skipped" : "active",
    doneSteps,
  };
}

/** 启动时自检：用户可能在引导之外已经把某步做完了，直接替他点亮。 */
export function autoSignals(signals: { llmConfigured?: boolean; running?: boolean }): TourStepId[] {
  const done: TourStepId[] = [];
  if (signals.llmConfigured) done.push("model");
  if (signals.running) done.push("cruise");
  return done;
}

// ---------- 模块介绍：已看列表 / 当前模块判定 / 展示条件 ----------

export function parseIntroShown(raw: string | null): IntroModuleId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is IntroModuleId => typeof id === "string" && INTRO_MODULE_IDS.includes(id as IntroModuleId),
    );
  } catch {
    return [];
  }
}

export function loadIntroShown(): IntroModuleId[] {
  try {
    return parseIntroShown(localStorage.getItem(INTRO_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function markIntroShown(shown: IntroModuleId[], id: IntroModuleId): IntroModuleId[] {
  if (shown.includes(id) || !INTRO_MODULE_IDS.includes(id)) return shown;
  return [...shown, id];
}

export function saveIntroShown(shown: IntroModuleId[]): void {
  try {
    localStorage.setItem(INTRO_STORAGE_KEY, JSON.stringify(shown));
  } catch {
    /* 同 saveTourStatus：写失败退化为会话内 */
  }
}

/**
 * 判断当前应该展示哪个模块的介绍卡。
 * 优先级：雾化设置弹窗（rules/policy/model）> 设置抽屉 > 宠物首次交互 > 导航页。
 * 设置类容器（弹窗/抽屉）打开期间不回落到导航页映射——抽屉盖着画像页时
 * 弹"求职画像"介绍是错的。workbench 是引导主舞台，不单独弹介绍。
 */
export function currentIntroModule(input: {
  activeNav: string;
  mistModalType: string | null;
  drawerOpen: boolean;
  drawerTab: string;
  petFirstOpen: boolean;
}): IntroModuleId | null {
  if (input.mistModalType) {
    return isSettingsIntroModule(input.mistModalType) ? input.mistModalType : null;
  }
  if (input.drawerOpen) {
    return isSettingsIntroModule(input.drawerTab) ? input.drawerTab : null;
  }
  if (input.petFirstOpen) return "pet";
  switch (input.activeNav) {
    case "profile":
    case "resumes":
    case "polish":
    case "copilot":
    case "analytics":
    case "live":
      return input.activeNav;
    default:
      return null;
  }
}

function isSettingsIntroModule(value: string): value is IntroModuleId {
  return value === "rules" || value === "policy" || value === "model";
}

/** 是否应该弹介绍卡：有模块、没看过、引导不在进行中、无阻塞弹窗。 */
export function shouldShowIntro(input: {
  module: IntroModuleId | null;
  shown: IntroModuleId[];
  tourActive: boolean;
  blocked: boolean;
}): boolean {
  if (!input.module) return false;
  if (input.shown.includes(input.module)) return false;
  if (input.tourActive) return false;
  if (input.blocked) return false;
  return true;
}
