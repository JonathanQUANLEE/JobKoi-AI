/**
 * 历史投递数据持久化与早报计算引擎 (Local-First Delivery History & Morning Brief)
 * 严格按照三大主流平台（BOSS直聘、猎聘、前程无忧）进行多维统计与昨日投递早报生成。
 */

export interface DayDeliveryRecord {
  date: string; // "YYYY-MM-DD"
  label: string; // "04-12"
  weekday: string; // "周三"
  bossSent: number;
  liepinSent: number;
  job51Sent: number;
  totalSent: number;
  bossReplies: number;
  liepinReplies: number;
  job51Replies: number;
  totalReplies: number;
}

export interface MorningBrief {
  todayDate: string;
  yesterdayDate: string;
  generatedAt: string;
  totalSent: number;
  repliedCount: number;
  unrepliedCount: number;
  replyRate: number; // 百分比，如 25.8
  platformBreakdown: {
    id: "boss" | "liepin" | "job51";
    name: string;
    sent: number;
    replied: number;
    rate: number;
    color: string;
  }[];
  insight: string;
  actionAdvice: string;
}

const STORAGE_KEY = "jobhunter_delivery_history_v1";

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * 种子数据生成：如果用户首次使用，预先填充过去 14 天的平滑测试轨迹
 */
function generateSeedRecords(): DayDeliveryRecord[] {
  const list: DayDeliveryRecord[] = [];
  const now = new Date();

  // 14 天前的基线
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = formatDateKey(d);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    // 模拟有起伏波动的自然投递与回复
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const bossSent = isWeekend ? Math.floor(40 + Math.random() * 25) : Math.floor(95 + Math.random() * 45);
    const liepinSent = isWeekend ? Math.floor(15 + Math.random() * 15) : Math.floor(45 + Math.random() * 35);
    const job51Sent = isWeekend ? Math.floor(5 + Math.random() * 10) : Math.floor(15 + Math.random() * 18);
    const totalSent = bossSent + liepinSent + job51Sent;

    // 回复数（回复 vs 没回复）
    const bossReplies = Math.round(bossSent * (0.22 + Math.random() * 0.1));
    const liepinReplies = Math.round(liepinSent * (0.18 + Math.random() * 0.08));
    const job51Replies = Math.round(job51Sent * (0.14 + Math.random() * 0.08));
    const totalReplies = bossReplies + liepinReplies + job51Replies;

    list.push({
      date: dateStr,
      label: `${m}-${day}`,
      weekday: WEEKDAYS[d.getDay()],
      bossSent,
      liepinSent,
      job51Sent,
      totalSent,
      bossReplies,
      liepinReplies,
      job51Replies,
      totalReplies,
    });
  }
  return list;
}

export const deliveryHistoryDb = {
  getRecords(): DayDeliveryRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DayDeliveryRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    const seeded = generateSeedRecords();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    } catch {}
    return seeded;
  },

  saveRecords(records: DayDeliveryRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {}
  },

  /**
   * 追加或累加当天的投递数据
   */
  incrementToday(platformId: "boss" | "liepin" | "job51", count = 1): void {
    const records = deliveryHistoryDb.getRecords();
    const todayStr = formatDateKey(new Date());
    const existing = records.find((r) => r.date === todayStr);

    if (existing) {
      if (platformId === "boss") existing.bossSent += count;
      if (platformId === "liepin") existing.liepinSent += count;
      if (platformId === "job51") existing.job51Sent += count;
      existing.totalSent = existing.bossSent + existing.liepinSent + existing.job51Sent;
    } else {
      const now = new Date();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      records.push({
        date: todayStr,
        label: `${m}-${day}`,
        weekday: WEEKDAYS[now.getDay()],
        bossSent: platformId === "boss" ? count : 0,
        liepinSent: platformId === "liepin" ? count : 0,
        job51Sent: platformId === "job51" ? count : 0,
        totalSent: count,
        bossReplies: 0,
        liepinReplies: 0,
        job51Replies: 0,
        totalReplies: 0,
      });
    }
    deliveryHistoryDb.saveRecords(records);
  },

  /**
   * 计算昨日投递早报数据（于今日早上 9:00 或使用时呈现）
   */
  getMorningBrief(): MorningBrief {
    const records = deliveryHistoryDb.getRecords();
    const now = new Date();
    const todayStr = formatDateKey(now);

    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = formatDateKey(yesterday);

    const yesterdayRecord = records.find((r) => r.date === yesterdayStr) || records[records.length - 2] || records[0];

    const totalSent = yesterdayRecord?.totalSent || 0;
    const repliedCount = yesterdayRecord?.totalReplies || 0;
    const unrepliedCount = Math.max(0, totalSent - repliedCount);
    const replyRate = totalSent > 0 ? Number(((repliedCount / totalSent) * 100).toFixed(1)) : 0;

    const bossSent = yesterdayRecord?.bossSent || 0;
    const bossReplies = yesterdayRecord?.bossReplies || 0;
    const liepinSent = yesterdayRecord?.liepinSent || 0;
    const liepinReplies = yesterdayRecord?.liepinReplies || 0;
    const job51Sent = yesterdayRecord?.job51Sent || 0;
    const job51Replies = yesterdayRecord?.job51Replies || 0;

    const platformBreakdown = [
      {
        id: "boss" as const,
        name: "BOSS 直聘",
        sent: bossSent,
        replied: bossReplies,
        rate: bossSent > 0 ? Number(((bossReplies / bossSent) * 100).toFixed(1)) : 0,
        color: "#00bebd",
      },
      {
        id: "liepin" as const,
        name: "猎聘 Liepin",
        sent: liepinSent,
        replied: liepinReplies,
        rate: liepinSent > 0 ? Number(((liepinReplies / liepinSent) * 100).toFixed(1)) : 0,
        color: "#ff7033",
      },
      {
        id: "job51" as const,
        name: "前程无忧 51job",
        sent: job51Sent,
        replied: job51Replies,
        rate: job51Sent > 0 ? Number(((job51Replies / job51Sent) * 100).toFixed(1)) : 0,
        color: "#ff5000",
      },
    ];

    let insight = "昨日投递整体稳健，HR 回复主要集中在午后 14:00~16:30，高匹配度岗位响应敏捷。";
    if (replyRate >= 25) {
      insight = "🔥 昨日回复率表现亮眼（>25%）！BOSS 直聘即时互动意向强烈，简历画像与市场热招高度吻合。";
    } else if (replyRate < 15) {
      insight = "昨日部分岗位响应平缓，建议通过“AI 简历精修”微调首段工作业绩，提升 HR 打开率。";
    }

    const actionAdvice =
      "今日早晨 09:00 是招聘者上线筛选黄金窗口期，建议优先拉满 BOSS 直聘与猎聘的早间巡航批次。";

    return {
      todayDate: todayStr,
      yesterdayDate: yesterdayRecord ? yesterdayRecord.date : yesterdayStr,
      generatedAt: "09:00",
      totalSent,
      repliedCount,
      unrepliedCount,
      replyRate,
      platformBreakdown,
      insight,
      actionAdvice,
    };
  },
};
