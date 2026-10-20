/**
 * 实时巡航监控页的数据转换层（2026-10-12 用户需求）。
 *
 * 把 ProgressEvent 流转换成"活动流时间轴条目"——用户不盯浏览器也能看到
 * 脚本正在干什么（正在筛选哪个岗位 → 这个投过了跳过 → 这个合适已投递）。
 *
 * 设计参照（GitHub 调研 2026-10-12）：
 * - Trigger.dev run 详情页：状态徽章 + 实时 duration + 结构化日志流
 * - automatisch / GitHub Actions：执行步骤垂直时间轴（节点+状态+耗时）
 * - browser-use web-ui：把浏览器自动化转成用户可感知的实时反馈
 *   （他们直播 VNC 画面；我们直播事件流——更适合"用户在忙别的"场景）
 *
 * 纯函数、零依赖，便于单测（tests 见 liveFeed.test.ts）。
 */
import type { EventKind, ProgressEvent } from "./ipc";

export type LiveFeedIcon =
  | "scan"
  | "sent"
  | "skip"
  | "info"
  | "warn"
  | "error"
  | "start"
  | "stop"
  | "login"
  | "filter";

export type LiveFeedTone = "live" | "success" | "skip" | "info" | "warning" | "error";

/** 平台标识（事件带 platform 字段；旧事件缺省归 boss）。 */
export type FeedPlatform = "boss" | "liepin" | "job51" | "zhaopin";

export const PLATFORM_META: Record<string, { name: string; color: string }> = {
  boss: { name: "BOSS", color: "#00bebd" },
  liepin: { name: "猎聘", color: "#ff7033" },
  job51: { name: "51job", color: "#ff5000" },
  zhaopin: { name: "智联", color: "#1976d2" },
};

export type LiveFeedItem = {
  id: string;
  kind: EventKind;
  platform: FeedPlatform;
  icon: LiveFeedIcon;
  tone: LiveFeedTone;
  title: string;
  detail: string;
  time: string;
};

const SKIP_REASON_LABELS: Record<string, string> = {
  duplicate: "过去已投递过，自动跳过",
  already_contacted: "此前已沟通过，跳过",
  contact_unavailable: "「立即沟通」按钮不可用",
  apply_online: "网申岗位（需外部系统投递），已安全跳过",
  chat_recovery_skip: "聊天页异常，Agent 已自愈并跳过",
  filtered_out: "与画像规则不匹配",
  review_skip: "人工审核跳过",
  validation: "招呼语未过校验",
  // 2026-10-20 补齐 API 直读流静默事故（扫 15/投 0/跳 0 全程无下文）暴露
  // 的缺失 reason：任何处理完的岗位都必须有明确去向，禁止静默消失。
  no_button: "详情页未找到「立即沟通」按钮，下轮自动重试",
  detail_open_failed: "详情页打开失败，下轮自动重试",
  detail_redirect: "详情页被平台重定向（反爬），稍后自动重试或切换稳妥模式",
  send_failed: "发送失败（超时/异常），下轮自动重试",
};

function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

/** 单个事件 → 活动流条目；返回 null 表示该事件不进时间轴（噪音过滤）。 */
export function toLiveFeedItem(ev: ProgressEvent, seq: number): LiveFeedItem | null {
  const p = ev.payload;
  // 平台维度（三平台并列需求）：BOSS/猎聘/51job 的事件都带 platform；
  // DOM 流等历史事件缺省归 BOSS。
  const platformRaw = typeof p.platform === "string" && p.platform ? p.platform : "boss";
  const platform = (["boss", "liepin", "job51", "zhaopin"].includes(platformRaw)
    ? platformRaw
    : "boss") as FeedPlatform;
  const base = {
    id: `${ev.ts_local || seq}-${seq}-${ev.kind}`,
    kind: ev.kind,
    platform,
    time: ev.ts_local || "",
  };
  const title = text(p.title);
  const company = text(p.company);
  const jobLabel = [title, company].filter(Boolean).join(" · ");

  switch (ev.kind) {
    case "job_processing":
      return {
        ...base,
        icon: "scan",
        tone: "live",
        title: jobLabel || "正在筛选岗位",
        // 2026-10-20 文案勘误：旧文案「正在比对去重记录与画像规则」让用户
        // 误以为卡在比对（实际比对是瞬时的，耗时在详情页/发送/节流）。
        detail: "正在打开详情页并按画像规则判定…",
      };
    case "job_found":
      return {
        ...base,
        icon: "scan",
        tone: "live",
        title: jobLabel || `岗位 #${text(p.index) || "?"}`,
        detail: "已读取岗位详情，正在判定…",
      };
    case "job_skipped": {
      const reason = text(p.reason);
      return {
        ...base,
        icon: "skip",
        tone: "skip",
        title: title || jobLabel || `岗位 #${text(p.index) || "?"}`,
        detail: SKIP_REASON_LABELS[reason] || text(p.detail) || reason || "已跳过",
      };
    }
    case "job_sent": {
      const actionText =
        platform === "liepin"
          ? "已发送招呼语"
          : platform === "job51"
          ? "已投递简历"
          : "已点击「立即沟通」";
      return {
        ...base,
        icon: "sent",
        tone: "success",
        title: jobLabel || "已投递岗位",
        detail: `本轮第 ${text(p.sent) || "-"} 份，${actionText}`,
      };
    }
    case "letter_sent": {
      const status = text(p.status);
      if (status === "sent") {
        return {
          ...base,
          icon: "sent",
          tone: "success",
          title: `岗位 #${text(p.index) || "?"} 已投递`,
          detail: text(p.match_explanation) || "招呼语已发送",
        };
      }
      if (status === "blocked") {
        return { ...base, icon: "warn", tone: "warning", title: `岗位 #${text(p.index) || "?"}`, detail: "招呼语被安全校验拦截" };
      }
      return null; // dry_run 等中间态不进时间轴
    }
    case "job_matched":
      return { ...base, icon: "sent", tone: "success", title: title || `命中 #${text(p.index)}`, detail: text(p.detail) || "扫描命中" };
    case "api_flow_started":
      return { ...base, icon: "start", tone: "info", title: "巡航已启动", detail: `今日已投 ${text(p.daily_sent) || "0"} 份，开始逐页扫描` };
    case "api_flow_finished":
      return { ...base, icon: "info", tone: "info", title: "本轮巡航汇总", detail: text(p.message) || "扫描结束" };
    case "api_flow_error":
      return { ...base, icon: "warn", tone: "warning", title: "搜索接口异常", detail: text(p.message) || "接口返回异常" };
    case "captcha_stopped":
      return { ...base, icon: "warn", tone: "warning", title: "触发安全验证", detail: title ? `已在 ${title} 处安全停止` : "已按设置安全停止" };
    case "agent_intervene": {
      // 守护 Agent 介入动态（2026-10-17）：level=info 网申跳过等 / warn 异常
      // 研判 / recovered 自愈成功——也进主时间轴，让介入动作在活动流可回溯
      const level = text(p.level);
      const action = text(p.action) || "介入处理";
      const tone = level === "recovered" ? "success" : level === "warn" ? "warning" : "info";
      const jobTitle = text(p.title);
      return {
        ...base,
        icon: level === "recovered" ? "sent" : "warn",
        tone,
        title: `守护 Agent：${action}`,
        detail: [jobTitle, text(p.detail)].filter(Boolean).join(" — "),
      };
    }
    case "limit_reached":
    case "platform_limit_reached":
      return { ...base, icon: "stop", tone: "warning", title: "达到投递上限", detail: text(p.message) || "已安全停机" };
    case "login_ok":
      return { ...base, icon: "login", tone: "info", title: "登录状态确认", detail: "已登录，跳过扫码" };
    case "login_required":
      return { ...base, icon: "warn", tone: "warning", title: "需要扫码登录", detail: text(p.message) || "BOSS 登录已失效" };
    case "browser_started":
      return { ...base, icon: "start", tone: "info", title: "受控浏览器已启动", detail: "正在打开岗位页面…" };
    case "page_opened":
      return { ...base, icon: "info", tone: "info", title: "页面已就绪", detail: text(p.actual_url) || "" };
    case "feed_exhausted":
      return { ...base, icon: "stop", tone: "info", title: "岗位列表已扫完", detail: `共处理 ${text(p.total) || "-"} 个岗位` };
    case "loop_ended": {
      const reason = text(p.reason);
      return {
        ...base,
        icon: "stop",
        tone: reason === "error" ? "error" : "info",
        title: reason === "completed" ? "本轮巡航结束" : reason === "cancelled" ? "巡航已手动停止" : "巡航异常终止",
        detail: "",
      };
    }
    case "error":
      return { ...base, icon: "error", tone: "error", title: "运行错误", detail: text(p.message) || String(p.stage || "") };
    case "page_filter": {
      // 页面筛选只在失败/切批时进流（成功点击太噪）
      const status = text(p.status);
      if (status === "failed") {
        return { ...base, icon: "filter", tone: "warning", title: "页面筛选未点上", detail: text(p.message) || `${text(p.group)}=${text(p.value)}` };
      }
      if (text(p.group) === "city_rotation") {
        return { ...base, icon: "filter", tone: "info", title: "城市批量轮换", detail: text(p.message) || "" };
      }
      return null;
    }
    case "review_requested":
      return { ...base, icon: "scan", tone: "live", title: title || `岗位 #${text(p.index)}`, detail: "等待你在工作台审核确认" };
    case "review_cleared":
      return null;
    default:
      return null;
  }
}

/** 事件流 → 活动流（最新在前，限制条数；channels 传空 = 不过滤全部显示）。 */
export function buildLiveFeed(
  events: ProgressEvent[],
  maxItems = 200,
  channels?: string[],
): LiveFeedItem[] {
  const enabled = channels && channels.length > 0 ? new Set(channels) : null;
  const items: LiveFeedItem[] = [];
  for (let i = events.length - 1; i >= 0 && items.length < maxItems; i -= 1) {
    const item = toLiveFeedItem(events[i], i);
    if (!item) continue;
    if (enabled && !enabled.has(item.platform)) continue;
    items.push(item);
  }
  return items;
}

/**
 * 从事件流提取"当前正在处理的岗位"（最后一个 job_processing / job_found）。
 * 每个终态事件（skipped/sent）之前必有一个 processing/found（两条流都保证），
 * 所以只要从最新往回找第一个即可——它就是脚本正在（或最后）处理的岗位。
 */
export function currentProcessingJob(events: ProgressEvent[]): {
  platform: string;
  title: string;
  company: string;
  salary: string;
  location: string;
} | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev.kind === "job_processing" || ev.kind === "job_found") {
      const platformRaw =
        typeof ev.payload.platform === "string" && ev.payload.platform ? ev.payload.platform : "boss";
      return {
        platform: platformRaw,
        title: text(ev.payload.title),
        company: text(ev.payload.company),
        salary: text(ev.payload.salary),
        location: text(ev.payload.location),
      };
    }
  }
  return null;
}

/**
 * 巡航结束后的醒目摘要（结束横幅数据源，2026-10-12 用户实测：结束原因只
 * 埋在时间轴里一闪而过，用户"莫名其妙就结束了"）。从事件流提取最后的
 * loop_ended（结束原因）与 api_flow_finished（人话汇总），未结束返回 null。
 */
export function lastCruiseSummary(events: ProgressEvent[]): {
  reason: string;
  message: string;
  time: string;
} | null {
  let ended: ProgressEvent | null = null;
  let summary: ProgressEvent | null = null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (!ended && ev.kind === "loop_ended") ended = ev;
    if (!summary && ev.kind === "api_flow_finished") summary = ev;
    if (ended && summary) break;
  }
  if (!ended) return null;
  const reasonMap: Record<string, string> = {
    completed: "本轮巡航已结束",
    cancelled: "巡航已手动停止",
    error: "巡航异常终止",
  };
  const reason = reasonMap[text(ended.payload.reason)] || "巡航已结束";
  return {
    reason,
    message: text(summary?.payload?.message) || "",
    time: ended.ts_local || "",
  };
}
