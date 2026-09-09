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
    case "feed_exhausted":
      return view(time, "列表已结束", `已处理到第 ${text(payload.total) || "-"} 个岗位`, payload, "info");
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
