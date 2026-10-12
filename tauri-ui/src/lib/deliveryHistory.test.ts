import { describe, it, expect, beforeEach } from "vitest";
import { buildDemoBriefForDate, buildRealMorningBrief, deliveryHistoryDb } from "./deliveryHistory";

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

describe("buildRealMorningBrief — 真实数据模式早报", () => {
  const dayStr = (offset: number) => {
    const d = new Date(Date.now() - offset * 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  it("有昨日投递：totalSent 真实，回复字段全 0 + hasReplyData=false（不编造回复）", () => {
    const brief = buildRealMorningBrief([
      { date: dayStr(1), bossSent: 10, liepinSent: 5, job51Sent: 2, totalSent: 17 },
    ]);
    expect(brief.totalSent).toBe(17);
    expect(brief.repliedCount).toBe(0);
    expect(brief.replyRate).toBe(0);
    expect(brief.hasReplyData).toBe(false);
    expect(brief.platformBreakdown[0].sent).toBe(10); // BOSS 真实
    expect(brief.platformBreakdown[0].replied).toBe(0); // 回复不编造
    expect(brief.insight).toContain("17");
  });

  it("昨日无投递：洞察文案引导启动巡航，不空引用", () => {
    const brief = buildRealMorningBrief([]);
    expect(brief.totalSent).toBe(0);
    expect(brief.insight).toContain("没有投递记录");
  });

  it("昨日缺失时兜底取窗口最后一天（不崩）", () => {
    const brief = buildRealMorningBrief([
      { date: dayStr(3), bossSent: 1, liepinSent: 0, job51Sent: 0, totalSent: 1 },
    ]);
    expect(brief.totalSent).toBe(1);
    expect(brief.yesterdayDate).toBe(dayStr(3));
  });

  it("指定历史日期（折线图点选回看）：显示那天的真实战报", () => {
    const brief = buildRealMorningBrief(
      [
        { date: dayStr(1), bossSent: 10, liepinSent: 5, job51Sent: 2, totalSent: 17 },
        { date: dayStr(5), bossSent: 3, liepinSent: 0, job51Sent: 1, totalSent: 4 },
      ],
      dayStr(5),
    );
    expect(brief.totalSent).toBe(4);
    expect(brief.yesterdayDate).toBe(dayStr(5));
    expect(brief.insight).toContain("4");
    expect(brief.insight).toContain(dayStr(5)); // 历史日期显式标注
  });

  it("指定日期无记录：不空引用，文案说明该日无投递", () => {
    const brief = buildRealMorningBrief([], "2026-10-01");
    expect(brief.totalSent).toBe(0);
    expect(brief.insight).toContain("没有投递记录");
  });
});

describe("buildDemoBriefForDate — 演示模式历史回看", () => {
  it("按点选日期从演示记录构造战报（含回复数据）", () => {
    const records = deliveryHistoryDb.getRecords();
    const target = records[3]; // 任取一天
    const brief = buildDemoBriefForDate(records, target.date);
    expect(brief.totalSent).toBe(target.totalSent);
    expect(brief.repliedCount).toBe(target.totalReplies);
    expect(brief.hasReplyData).toBe(true);
    expect(brief.yesterdayDate).toBe(target.date);
  });
});
