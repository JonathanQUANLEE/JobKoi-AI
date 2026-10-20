import { describe, expect, it } from "vitest";
import type { ProgressEvent } from "./ipc";
import { buildLiveFeed, currentProcessingJob, lastCruiseSummary, toLiveFeedItem } from "./liveFeed";

function ev(kind: ProgressEvent["kind"], payload: Record<string, unknown> = {}, ts = "2026-10-12 14:00:00"): ProgressEvent {
  return { kind, payload, ts_local: ts };
}

describe("toLiveFeedItem — 事件转活动流条目", () => {
  it("job_processing → live 态条目（正在筛选）", () => {
    const item = toLiveFeedItem(ev("job_processing", { title: "AI 实习", company: "字节" }), 0);
    expect(item?.tone).toBe("live");
    expect(item?.title).toContain("AI 实习");
    expect(item?.detail).toContain("正在打开详情页");
  });

  it("job_skipped 按原因翻译成人话（duplicate=过去已投递过）", () => {
    const item = toLiveFeedItem(ev("job_skipped", { title: "剪辑实习", reason: "duplicate" }), 1);
    expect(item?.tone).toBe("skip");
    expect(item?.detail).toBe("过去已投递过，自动跳过");
    const filtered = toLiveFeedItem(ev("job_skipped", { title: "销售", reason: "filtered_out" }), 2);
    expect(filtered?.detail).toBe("与画像规则不匹配");
  });

  it("job_sent → success 条目（已投递第 N 份）", () => {
    const item = toLiveFeedItem(ev("job_sent", { title: "大模型实习", company: "腾讯", sent: 3 }), 3);
    expect(item?.tone).toBe("success");
    expect(item?.detail).toContain("第 3 份");
  });

  it("api_flow_finished → 汇总 message 直通", () => {
    const item = toLiveFeedItem(ev("api_flow_finished", { message: "本轮扫描 150 个岗位…" }), 4);
    expect(item?.title).toBe("本轮巡航汇总");
    expect(item?.detail).toContain("150");
  });

  it("噪音事件不进时间轴（page_filter 成功 / dry_run / review_cleared）", () => {
    expect(toLiveFeedItem(ev("page_filter", { group: "city", status: "success" }), 5)).toBeNull();
    expect(toLiveFeedItem(ev("letter_sent", { status: "dry_run" }), 6)).toBeNull();
    expect(toLiveFeedItem(ev("review_cleared", {}), 7)).toBeNull();
  });

  it("page_filter 失败进时间轴（warning）", () => {
    const item = toLiveFeedItem(ev("page_filter", { group: "city", status: "failed", message: "页面筛选失败：城市=郑州上海" }), 8);
    expect(item?.tone).toBe("warning");
    expect(item?.detail).toContain("郑州上海");
  });

  it("网申跳过（apply_online）翻译成人话（2026-10-17 守护 Agent）", () => {
    const item = toLiveFeedItem(ev("job_skipped", { title: "校招岗", reason: "apply_online" }), 9);
    expect(item?.tone).toBe("skip");
    expect(item?.detail).toContain("网申岗位");
    const recovered = toLiveFeedItem(ev("job_skipped", { title: "A", reason: "chat_recovery_skip" }), 10);
    expect(recovered?.detail).toContain("Agent 已自愈");
  });

  it("agent_intervene → 守护 Agent 介入条目（info/warn/recovered 三态）", () => {
    const info = toLiveFeedItem(
      ev("agent_intervene", { platform: "boss", level: "info", title: "校招岗", action: "安全跳过", detail: "识别到「立即网申」岗位" }),
      11,
    );
    expect(info?.tone).toBe("info");
    expect(info?.title).toContain("守护 Agent");
    expect(info?.detail).toContain("校招岗");
    expect(info?.detail).toContain("立即网申");

    const recovered = toLiveFeedItem(
      ev("agent_intervene", { platform: "boss", level: "recovered", title: "岗位 A", action: "自愈恢复", detail: "已清理弹窗并返回岗位列表" }),
      12,
    );
    expect(recovered?.tone).toBe("success");

    const warn = toLiveFeedItem(
      ev("agent_intervene", { platform: "boss", level: "warn", title: "岗位 B", action: "研判", detail: "检测到异常" }),
      13,
    );
    expect(warn?.tone).toBe("warning");
  });
});

describe("buildLiveFeed — 时间轴组装", () => {
  it("最新在前 + 上限截断", () => {
    const events = [
      ev("browser_started", {}, "2026-10-12 14:00:00"),
      ev("job_processing", { title: "A" }, "2026-10-12 14:00:01"),
      ev("job_skipped", { title: "A", reason: "duplicate" }, "2026-10-12 14:00:02"),
    ];
    const feed = buildLiveFeed(events);
    expect(feed.length).toBe(3);
    expect(feed[0].kind).toBe("job_skipped"); // 最新在前
    expect(feed[2].kind).toBe("browser_started");
  });
});

describe("platform 维度（三平台并列需求）", () => {
  it("事件带 platform → 条目带平台标识；缺省归 boss", () => {
    const liepinItem = toLiveFeedItem(ev("job_processing", { platform: "liepin", title: "AI 工程师" }), 0);
    expect(liepinItem?.platform).toBe("liepin");
    const bossItem = toLiveFeedItem(ev("job_processing", { title: "AI 实习" }), 1);
    expect(bossItem?.platform).toBe("boss");
  });

  it("未知 platform 值兜底为 boss（防脏数据炸 UI）", () => {
    const item = toLiveFeedItem(ev("job_sent", { platform: "unknown-x", title: "A", sent: 1 }), 0);
    expect(item?.platform).toBe("boss");
  });

  it("channels 过滤：只显示勾选平台的动态（并列勾选的核心）", () => {
    const events = [
      ev("job_sent", { platform: "boss", title: "BOSS 岗", sent: 1 }),
      ev("job_sent", { platform: "liepin", title: "猎聘岗", sent: 1 }),
      ev("job_sent", { platform: "job51", title: "51job 岗", sent: 1 }),
    ];
    const all = buildLiveFeed(events, 200, ["boss", "liepin", "job51"]);
    expect(all.length).toBe(3);
    const onlyBoss = buildLiveFeed(events, 200, ["boss"]);
    expect(onlyBoss.length).toBe(1);
    expect(onlyBoss[0].platform).toBe("boss");
    expect(onlyBoss[0].title).toBe("BOSS 岗");
    // channels 传空数组/undefined = 不过滤全部显示
    expect(buildLiveFeed(events, 200, []).length).toBe(3);
    expect(buildLiveFeed(events).length).toBe(3);
  });

  it("currentProcessingJob 返回 platform（聚光卡平台徽章数据源）", () => {
    const events = [
      ev("job_processing", { platform: "job51", title: "前端实习" }),
    ];
    expect(currentProcessingJob(events)?.platform).toBe("job51");
  });
});

describe("currentProcessingJob — 当前岗位聚光", () => {
  it("返回最后一个 job_processing（脚本正在看的岗位）", () => {
    const events = [
      ev("job_processing", { title: "旧岗位", company: "旧公司" }),
      ev("job_skipped", { title: "旧岗位", reason: "duplicate" }),
      ev("job_processing", { title: "新岗位", company: "新公司", salary: "200/天", location: "深圳" }),
    ];
    const job = currentProcessingJob(events);
    expect(job?.title).toBe("新岗位");
    expect(job?.company).toBe("新公司");
  });

  it("没有岗位事件时返回 null（不崩）", () => {
    expect(currentProcessingJob([])).toBeNull();
    expect(currentProcessingJob([ev("browser_started")])).toBeNull();
  });
});

describe("lastCruiseSummary — 结束横幅", () => {
  it("巡航结束后提取结束原因 + api_flow 汇总人话", () => {
    const events = [
      ev("api_flow_started", { daily_sent: 9 }),
      ev("job_processing", { title: "A" }),
      ev(
        "api_flow_finished",
        { message: "本轮扫描 90 个岗位：新投递 0、已投过跳过 31…（搜索接口风控限流，稍后再试）" },
        "2026-10-12 14:15:50",
      ),
      ev("loop_ended", { reason: "completed" }, "2026-10-12 14:15:50"),
    ];
    const s = lastCruiseSummary(events);
    expect(s?.reason).toBe("本轮巡航已结束");
    expect(s?.message).toContain("90 个岗位");
    expect(s?.time).toContain("14:15:50");
  });

  it("运行中（无 loop_ended）返回 null", () => {
    expect(lastCruiseSummary([ev("job_processing", { title: "A" })])).toBeNull();
    expect(lastCruiseSummary([])).toBeNull();
  });

  it("异常终止 / 手动停止的原因翻译", () => {
    expect(lastCruiseSummary([ev("loop_ended", { reason: "error" })])?.reason).toBe("巡航异常终止");
    expect(lastCruiseSummary([ev("loop_ended", { reason: "cancelled" })])?.reason).toBe("巡航已手动停止");
  });
});
