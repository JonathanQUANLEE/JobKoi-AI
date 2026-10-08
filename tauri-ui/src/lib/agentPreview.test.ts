import { describe, expect, it } from "vitest";
import { summarizeAgentProfile } from "./agentPreview";

const profile = {
  search: { query: "AI Agent实习", start_url: "" },
  page_filters: {
    strict: false,
    city: { enabled: true, values: ["深圳"] },
    education: { enabled: false, values: [] },
    boss_active: { enabled: false, values: [] },
  },
  filters: {
    title: {
      required: { enabled: false, keywords: [] },
      any: { enabled: true, keywords: ["AI Agent", "大模型"] },
      exclude: { enabled: true, keywords: ["销售", "客服"] },
    },
  },
  send: {
    mode: "scan",
    greeting_file: "./greetings/default.txt",
    delay_min: 10,
    delay_max: 60,
    max_sent: 30,
    daily_sent_limit: 50,
    stop_on_captcha: true,
  },
  state: {},
};

describe("summarizeAgentProfile", () => {
  it("提取用户需要确认的关键字段", () => {
    const summary = summarizeAgentProfile(profile);
    expect(summary).not.toBeNull();
    expect(summary!.mode).toBe("scan");
    expect(summary!.query).toBe("AI Agent实习");
    expect(summary!.cities).toBe("深圳");
    expect(summary!.anyKeywords).toBe("AI Agent, 大模型");
    expect(summary!.excludeKeywords).toBe("销售, 客服");
    expect(summary!.maxSent).toBe("30");
    expect(summary!.dailyLimit).toBe("50");
  });

  it("空列表字段显示占位符", () => {
    const summary = summarizeAgentProfile({ send: { mode: "scan" } });
    expect(summary!.cities).toBe("");
    expect(summary!.anyKeywords).toBe("");
    expect(summary!.maxSent).toBe("-");
  });

  it("null / undefined / 非对象返回 null", () => {
    expect(summarizeAgentProfile(null)).toBeNull();
    expect(summarizeAgentProfile(undefined)).toBeNull();
  });

  it("坏形状不抛异常（后端已净化，这里只做兜底）", () => {
    const summary = summarizeAgentProfile({ search: "broken", send: 42 });
    expect(summary).not.toBeNull();
    expect(summary!.mode).toBe("scan");
    expect(summary!.query).toBe("-");
  });
});
