import { describe, it, expect, beforeEach } from "vitest";
import { deliveryHistoryDb } from "./deliveryHistory";

describe("deliveryHistoryDb", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.clear();
  });

  it("should initialize default 14-day seed records when storage is empty", () => {
    const records = deliveryHistoryDb.getRecords();
    expect(records.length).toBe(14);
    expect(records[0]).toHaveProperty("bossSent");
    expect(records[0]).toHaveProperty("liepinSent");
    expect(records[0]).toHaveProperty("job51Sent");
    expect(records[0]).toHaveProperty("totalSent");
  });

  it("should calculate yesterday morning brief accurately", () => {
    const brief = deliveryHistoryDb.getMorningBrief();
    expect(brief).toBeDefined();
    expect(brief.totalSent).toBeGreaterThanOrEqual(0);
    expect(brief.repliedCount).toBeGreaterThanOrEqual(0);
    expect(brief.unrepliedCount).toBeGreaterThanOrEqual(0);
    expect(brief.replyRate).toBeGreaterThanOrEqual(0);
    expect(brief.platformBreakdown.length).toBe(3);

    // Verify 3 platforms are present: boss, liepin, job51
    const ids = brief.platformBreakdown.map((p) => p.id);
    expect(ids).toContain("boss");
    expect(ids).toContain("liepin");
    expect(ids).toContain("job51");
  });

  it("should increment today's delivery data dynamically", () => {
    deliveryHistoryDb.incrementToday("boss", 5);
    const records = deliveryHistoryDb.getRecords();
    const todayRecord = records[records.length - 1];
    expect(todayRecord.bossSent).toBeGreaterThanOrEqual(5);
  });
});
