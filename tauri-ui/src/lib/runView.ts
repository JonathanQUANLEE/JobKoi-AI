import type { ProgressEvent } from "./ipc";

export function latestPayloadForJob(
  events: ProgressEvent[],
  kind: ProgressEvent["kind"],
  job: Record<string, unknown> | undefined,
) {
  const index = typeof job?.index === "number" ? job.index : undefined;
  return [...events].reverse().find((event) => {
    if (event.kind !== kind) return false;
    if (index === undefined) return true;
    return event.payload.index === index;
  })?.payload;
}
