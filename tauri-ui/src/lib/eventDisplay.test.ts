import { describe, expect, it } from "vitest";
import { formatEventForDisplay } from "./eventDisplay";

describe("formatEventForDisplay", () => {
  it("formats skipped jobs with a local timestamp and readable reason", () => {
    const view = formatEventForDisplay({
      kind: "job_skipped",
      ts_local: "2026-06-30 18:30:00",
      payload: {
        index: 7,
        title: "销售实习",
        reason: "profile_filter",
        detail: "命中排除关键词「销售」",
      },
    });

    expect(view.time).toBe("2026-06-30 18:30:00");
    expect(view.title).toBe("跳过岗位 #7");
    expect(view.summary).toBe("销售实习：命中排除关键词「销售」");
    expect(view.severity).toBe("warning");
  });

  it("formats sent letters with match explanation", () => {
    const view = formatEventForDisplay({
      kind: "letter_sent",
      ts_local: "2026-06-30 18:31:00",
      payload: {
        index: 8,
        status: "sent",
        match_explanation: "只看岗位名称命中必须关键词「实习」",
      },
    });

    expect(view.title).toBe("已发送招呼语 #8");
    expect(view.summary).toBe("只看岗位名称命中必须关键词「实习」");
    expect(view.severity).toBe("success");
  });

  it("creates concise fallback details for unknown payloads", () => {
    const view = formatEventForDisplay({
      kind: "page_filter",
      payload: {
        group: "city",
        value: "深圳",
        status: "failed",
        message: "页面筛选失败",
      },
    }, "2026-06-30 18:32:00");

    expect(view.time).toBe("2026-06-30 18:32:00");
    expect(view.title).toBe("页面筛选");
    expect(view.summary).toBe("页面筛选失败");
    expect(view.details).toContain("city");
  });
});
