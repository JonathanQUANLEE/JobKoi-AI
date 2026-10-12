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
  /** false = 回复数据不可得（真实模式：三平台无回复检测），前端回复相关区域显示「建设中」 */
  hasReplyData?: boolean;
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

let memoryStore: Record<string, string> = {};

function getStored(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {}
  return memoryStore[key] || null;
}

function setStored(key: string, val: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryStore[key] = val;
}

export const deliveryHistoryDb = {
  getRecords(): DayDeliveryRecord[] {
    try {
      const raw = getStored(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DayDeliveryRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    const seeded = generateSeedRecords();
    setStored(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  },

  saveRecords(records: DayDeliveryRecord[]): void {
    setStored(STORAGE_KEY, JSON.stringify(records));
  },

  /**
   * 重置为 0 真实数据起步
   */
  resetToZero(): DayDeliveryRecord[] {
    const list: DayDeliveryRecord[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = formatDateKey(d);
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      list.push({
        date: dateStr,
        label: `${m}-${day}`,
        weekday: WEEKDAYS[d.getDay()],
        bossSent: 0,
        liepinSent: 0,
        job51Sent: 0,
        totalSent: 0,
        bossReplies: 0,
        liepinReplies: 0,
        job51Replies: 0,
        totalReplies: 0,
      });
    }
    deliveryHistoryDb.saveRecords(list);
    return list;
  },

  /**
   * 恢复演示参考数据
   */
  restoreDemoData(): DayDeliveryRecord[] {
    const seeded = generateSeedRecords();
    deliveryHistoryDb.saveRecords(seeded);
    return seeded;
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
      hasReplyData: true, // 演示数据自带编造的回复字段
    };
  },
};

/**
 * 真实数据模式早报：从后端按天聚合的真实投递数据构造。
 *
 * 诚实性红线（2026-10-12 用户拍板"不能骗用户"）：三平台没有回复检测能力，
 * 回复相关字段一律 0 + hasReplyData=false，前端展示层显示「回复统计建设中」，
 * 绝不用编造数字冒充真实回复。
 */
export function buildRealMorningBrief(
  days: { date: string; bossSent: number; liepinSent: number; job51Sent: number; totalSent: number }[],
): MorningBrief {
  const now = new Date();
  const todayStr = formatDateKey(now);
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = formatDateKey(yesterday);
  // 满窗口末位兜底：昨天数据缺失（如刚部署当天）时取最后一天，避免早报空引用
  const yesterdayRecord = days.find((r) => r.date === yesterdayStr) || days[days.length - 1];

  const totalSent = yesterdayRecord?.totalSent || 0;
  const bossSent = yesterdayRecord?.bossSent || 0;
  const liepinSent = yesterdayRecord?.liepinSent || 0;
  const job51Sent = yesterdayRecord?.job51Sent || 0;

  let insight: string;
  if (totalSent <= 0) {
    insight =
      "昨日没有投递记录。HR 通常在上午集中筛选简历，建议今早启动一轮巡航抢占先机。";
  } else {
    const platformParts = [
      bossSent > 0 ? `BOSS ${bossSent}` : "",
      liepinSent > 0 ? `猎聘 ${liepinSent}` : "",
      job51Sent > 0 ? `51job ${job51Sent}` : "",
    ]
      .filter(Boolean)
      .join(" / ");
    insight = `昨日真实投递 ${totalSent} 份（${platformParts}）。回复率统计暂未开放（平台未提供回复数据），可在「招聘平台中心」查看 BOSS 未读消息。`;
  }

  return {
    todayDate: todayStr,
    yesterdayDate: yesterdayRecord ? yesterdayRecord.date : yesterdayStr,
    generatedAt: "09:00",
    totalSent,
    repliedCount: 0,
    unrepliedCount: 0,
    replyRate: 0,
    platformBreakdown: [
      { id: "boss", name: "BOSS 直聘", sent: bossSent, replied: 0, rate: 0, color: "#00bebd" },
      { id: "liepin", name: "猎聘 Liepin", sent: liepinSent, replied: 0, rate: 0, color: "#ff7033" },
      { id: "job51", name: "前程无忧 51job", sent: job51Sent, replied: 0, rate: 0, color: "#ff5000" },
    ],
    insight,
    actionAdvice:
      "今日早晨 09:00 前后是招聘者集中上线筛选简历的时段，建议启动巡航优先拉满早间批次。",
    hasReplyData: false,
  };
}
