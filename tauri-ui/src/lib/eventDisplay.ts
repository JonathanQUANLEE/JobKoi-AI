import type { ProgressEvent } from "./ipc";

export type EventSeverity = "info" | "success" | "warning" | "error";

export type EventDisplay = {
  time: string;
  title: string;
  summary: string;
  details: string;
  severity: EventSeverity;
};

export function formatEventForDisplay(
  event: ProgressEvent,
  fallbackTime = "",
): EventDisplay {
  const payload = event.payload;
  const index = text(payload.index);
  const title = text(payload.title);
  const detail = text(payload.detail);
  const reason = text(payload.reason);
  const status = text(payload.status);
  const message = text(payload.message);
  const matchExplanation = text(payload.match_explanation);
  const time = event.ts_local || fallbackTime;

  switch (event.kind) {
    case "browser_started":
      return view(time, "浏览器已启动", message || "Chrome 已启动，准备打开 BOSS 页面", payload, "info");
    case "page_opened":
      return view(
        time,
        "页面已打开",
        text(payload.redirected) === "true"
          ? `实际 URL：${text(payload.actual_url) || "-"}（发生重定向）`
          : `实际 URL：${text(payload.actual_url) || "-"}`,
        payload,
        "info",
      );
    case "page_filter":
      return view(
        time,
        "页面筛选",
        message || `${text(payload.group) || "筛选"}=${text(payload.value) || "-"}`,
        payload,
        status === "failed" ? "warning" : "info",
      );
    case "login_ok":
      return view(time, "登录状态确认", "已确认 BOSS 登录状态", payload, "success");
    case "login_required":
      return view(
        time,
        "需要登录",
        message || "BOSS 登录已失效，请在浏览器里扫码登录",
        payload,
        "warning",
      );
    case "job_found":
      return view(
        time,
        `发现岗位${index ? ` #${index}` : ""}`,
        [title, text(payload.company), text(payload.location)].filter(Boolean).join(" / ")
          || text(payload.jd_preview)
          || "已读取岗位详情",
        payload,
        "info",
      );
    case "job_matched":
      return view(time, `扫描命中${index ? ` #${index}` : ""}`, detail || "岗位命中扫描规则", payload, "success");
    case "job_skipped":
      return view(
        time,
        `跳过岗位${index ? ` #${index}` : ""}`,
        [title, detail || reason].filter(Boolean).join("：") || "已跳过该岗位",
        payload,
        "warning",
      );
    case "review_requested":
      return view(time, `等待审核${index ? ` #${index}` : ""}`, "命中规则，等待你确认发送或跳过", payload, "warning");
    case "review_cleared":
      return view(time, `审核已处理${index ? ` #${index}` : ""}`, `决策：${text(payload.decision) || "-"}`, payload, "info");
    case "letter_sent":
      return view(
        time,
        `${statusTitle(status)}${index ? ` #${index}` : ""}`,
        matchExplanation || status || "招呼语处理完成",
        payload,
        status === "sent" || status === "dry_run" ? "success" : "warning",
      );
    case "job_sent":
      return view(
        time,
        "已投递岗位",
        [title, text(payload.company)].filter(Boolean).join(" / ")
          || `本轮第 ${text(payload.sent) || "-"} 份`,
        payload,
        "success",
      );
    case "api_flow_started":
      return view(
        time,
        "API 直读巡航启动",
        `今日已投 ${text(payload.daily_sent) || "0"} 份，开始逐页扫描岗位`,
        payload,
        "info",
      );
    case "api_flow_finished":
      return view(time, "本轮巡航汇总", message || "扫描结束", payload, "info");
    case "api_flow_error":
      return view(time, "搜索接口异常", message || "接口返回异常，已停止翻页", payload, "warning");
    case "captcha_stopped":
      return view(
        time,
        "验证码安全停机",
        `检测到安全验证，已停止：${title || "详见浏览器"}`,
        payload,
        "warning",
      );
    case "feed_exhausted":
      return view(time, "列表已结束", `已处理到第 ${text(payload.total) || "-"} 个岗位`, payload, "info");
    case "limit_reached":
      return view(
        time,
        "安全额度停机",
        message || `今日已投 ${text(payload.current)}/${text(payload.limit)}，已停止`,
        payload,
        "warning",
      );
    case "platform_limit_reached":
      return view(
        time,
        "平台限额停机",
        message || `平台提示今日投递已达上限（${text(payload.matched_text)}）`,
        payload,
        "warning",
      );
    case "loop_ended":
      return view(time, "运行结束", `结束原因：${text(payload.reason) || "-"}`, payload, "info");
    case "error":
      return view(time, "运行错误", message || "运行过程中发生错误", payload, "error");
    default:
      return view(time, event.kind, message || toDetails(payload), payload, "info");
  }
}

export function eventLogLine(event: ProgressEvent, fallbackTime = ""): string {
  const display = formatEventForDisplay(event, fallbackTime);
  return [display.time, display.title, display.summary].filter(Boolean).join(" ");
}

function statusTitle(status: string): string {
  if (status === "sent") return "已发送招呼语";
  if (status === "dry_run") return "Dry-run 命中";
  if (status === "blocked") return "招呼语被拦截";
  return "招呼语处理完成";
}

function view(
  time: string,
  title: string,
  summary: string,
  payload: Record<string, unknown>,
  severity: EventSeverity,
): EventDisplay {
  return {
    time,
    title,
    summary,
    details: toDetails(payload),
    severity,
  };
}

function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function toDetails(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
}
