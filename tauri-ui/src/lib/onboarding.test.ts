import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoSignals,
  currentIntroModule,
  markIntroShown,
  markStepDone,
  nextStep,
  parseIntroShown,
  parseTourStatus,
  shouldShowIntro,
  tourStorageKey,
  type IntroModuleId,
} from "./onboarding";

/** node 环境无 localStorage，用最小假实现（onboarding.ts 只用 get/setItem）。 */
class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new FakeStorage());
});

describe("tourStorageKey", () => {
  it("按账号隔离：不同账号不同 key，空账号回落全局 key", () => {
    expect(tourStorageKey("alice")).toBe("jobkoi_tour_done_v1:alice");
    expect(tourStorageKey("bob")).toBe("jobkoi_tour_done_v1:bob");
    expect(tourStorageKey("alice")).not.toBe(tourStorageKey("bob"));
    expect(tourStorageKey("")).toBe("jobkoi_tour_done_v1");
  });
});

describe("parseTourStatus", () => {
  it("空值返回默认 active + 空 doneSteps", () => {
    expect(parseTourStatus(null)).toEqual({ status: "active", doneSteps: [] });
    expect(parseTourStatus("")).toEqual({ status: "active", doneSteps: [] });
  });

  it("坏 JSON 兜底为默认值", () => {
    expect(parseTourStatus("{not json")).toEqual({ status: "active", doneSteps: [] });
  });

  it("非法 status 值回退 active，非法 doneSteps 项被过滤", () => {
    const result = parseTourStatus(
      JSON.stringify({ status: "whatever", doneSteps: ["model", "hack", 42, "cruise"] }),
    );
    expect(result).toEqual({ status: "active", doneSteps: ["model", "cruise"] });
  });

  it("合法 skipped 状态完整保留", () => {
    const result = parseTourStatus(JSON.stringify({ status: "skipped", doneSteps: ["model"] }));
    expect(result).toEqual({ status: "skipped", doneSteps: ["model"] });
  });
});

describe("nextStep", () => {
  it("返回首个未完成步骤", () => {
    expect(nextStep([])).toBe("model");
    expect(nextStep(["model"])).toBe("profile");
    expect(nextStep(["model", "profile"])).toBe("cruise");
  });

  it("全部完成返回 null", () => {
    expect(nextStep(["model", "profile", "cruise"])).toBeNull();
  });
});

describe("markStepDone", () => {
  it("追加步骤且全部完成时自动收尾为 done", () => {
    let status = parseTourStatus(null);
    status = markStepDone(status, "model");
    expect(status).toEqual({ status: "active", doneSteps: ["model"] });
    status = markStepDone(status, "profile");
    expect(status.status).toBe("active");
    status = markStepDone(status, "cruise");
    expect(status).toEqual({ status: "done", doneSteps: ["model", "profile", "cruise"] });
  });

  it("幂等：重复标记同一一步不变", () => {
    const status = { status: "active" as const, doneSteps: ["model" as const] };
    expect(markStepDone(status, "model")).toEqual(status);
  });

  it("忽略非法 id（类型系统外的调用兜底）", () => {
    const status = { status: "active" as const, doneSteps: [] };
    // @ts-expect-error 故意传非法值
    expect(markStepDone(status, "hack")).toEqual(status);
  });

  it("跳过状态保持 skipped 不被翻转", () => {
    const status = { status: "skipped" as const, doneSteps: [] };
    const next = markStepDone(status, "model");
    expect(next.status).toBe("skipped");
    expect(next.doneSteps).toEqual(["model"]);
  });
});

describe("autoSignals", () => {
  it("模型已配置点亮 model，巡航已启动点亮 cruise", () => {
    expect(autoSignals({ llmConfigured: true })).toEqual(["model"]);
    expect(autoSignals({ running: true })).toEqual(["cruise"]);
    expect(autoSignals({ llmConfigured: true, running: true })).toEqual(["model", "cruise"]);
  });

  it("无信号返回空数组", () => {
    expect(autoSignals({})).toEqual([]);
    expect(autoSignals({ llmConfigured: false, running: false })).toEqual([]);
  });
});

describe("parseIntroShown / markIntroShown", () => {
  it("坏数据兜底空数组，合法 id 过滤保留", () => {
    expect(parseIntroShown(null)).toEqual([]);
    expect(parseIntroShown("oops")).toEqual([]);
    expect(parseIntroShown(JSON.stringify(["profile", "bad", "live"]))).toEqual(["profile", "live"]);
  });

  it("markIntroShown 追加去重且忽略非法 id", () => {
    expect(markIntroShown([], "profile")).toEqual(["profile"]);
    expect(markIntroShown(["profile"], "profile")).toEqual(["profile"]);
    // @ts-expect-error 故意传非法值
    expect(markIntroShown([], "nope")).toEqual([]);
  });
});

describe("currentIntroModule", () => {
  const base = {
    activeNav: "workbench",
    mistModalType: null as string | null,
    drawerOpen: false,
    drawerTab: "rules",
    petFirstOpen: false,
  };

  it("雾化设置弹窗优先级最高（greeting/basic 不算介绍模块）", () => {
    expect(
      currentIntroModule({ ...base, activeNav: "analytics", mistModalType: "rules", petFirstOpen: true }),
    ).toBe("rules");
    expect(
      currentIntroModule({ ...base, activeNav: "live", mistModalType: "policy" }),
    ).toBe("policy");
    expect(currentIntroModule({ ...base, mistModalType: "model" })).toBe("model");
    expect(currentIntroModule({ ...base, mistModalType: "greeting" })).toBeNull();
    expect(currentIntroModule({ ...base, mistModalType: "basic" })).toBeNull();
  });

  it("设置抽屉次优先；抽屉开着时不回落导航页映射", () => {
    expect(currentIntroModule({ ...base, drawerOpen: true, drawerTab: "policy" })).toBe("policy");
    expect(currentIntroModule({ ...base, drawerOpen: true, drawerTab: "greeting" })).toBeNull();
    expect(
      currentIntroModule({ ...base, drawerOpen: true, drawerTab: "basic", activeNav: "profile" }),
    ).toBeNull();
  });

  it("宠物首次交互再次优先", () => {
    expect(
      currentIntroModule({ ...base, activeNav: "analytics", mistModalType: null, petFirstOpen: true }),
    ).toBe("pet");
  });

  it("导航页映射：六个介绍页有值，workbench 返回 null", () => {
    expect(currentIntroModule({ ...base, activeNav: "profile" })).toBe("profile");
    expect(currentIntroModule({ ...base, activeNav: "live" })).toBe("live");
    expect(currentIntroModule({ ...base, activeNav: "workbench" })).toBeNull();
  });
});

describe("shouldShowIntro", () => {
  const base = {
    module: "profile" as const,
    shown: [] as IntroModuleId[],
    tourActive: false,
    blocked: false,
  };

  it("四条件真值表：任一不满足即不展示", () => {
    expect(shouldShowIntro(base)).toBe(true);
    expect(shouldShowIntro({ ...base, module: null })).toBe(false);
    expect(shouldShowIntro({ ...base, shown: ["profile"] })).toBe(false);
    expect(shouldShowIntro({ ...base, tourActive: true })).toBe(false);
    expect(shouldShowIntro({ ...base, blocked: true })).toBe(false);
  });
});
