import { describe, expect, it } from "vitest";
import { latestPayloadForJob } from "./runView";
import type { ProgressEvent } from "./ipc";

describe("latestPayloadForJob", () => {
  it("does not show a skipped reason from a previous job on the current job", () => {
    const events: ProgressEvent[] = [
      {
        kind: "job_found",
        payload: { index: 1, title: "Golang" },
      },
      {
        kind: "job_skipped",
        payload: { index: 1, detail: "只看岗位名称缺少必须关键词「实习」" },
      },
      {
        kind: "job_found",
        payload: { index: 2, title: "AI应用研究员（实习生）" },
      },
      {
        kind: "letter_sent",
        payload: { index: 2, status: "sent" },
      },
    ];

    expect(latestPayloadForJob(events, "job_skipped", { index: 2 })).toBeUndefined();
    expect(latestPayloadForJob(events, "letter_sent", { index: 2 })?.status).toBe("sent");
  });
});
