/** agent 生成的 profile → 预览卡摘要（纯函数，便于单测）。
 *
 * 输入是与 profileForm 的 BuiltProfileData 同构的 snake_case dict
 * （后端 sanitize_profile 的产物）；输出只挑用户需要确认的关键字段。 */

export type AgentPreviewSummary = {
  mode: string;
  query: string;
  cities: string;
  anyKeywords: string;
  excludeKeywords: string;
  maxSent: string;
  dailyLimit: string;
};

export function summarizeAgentProfile(
  profile: Record<string, unknown> | null | undefined,
): AgentPreviewSummary | null {
  if (!profile || typeof profile !== "object") return null;

  const search = asRecord(profile.search);
  const pageFilters = asRecord(profile.page_filters);
  const filters = asRecord(asRecord(profile.filters).title);
  const send = asRecord(profile.send);

  return {
    mode: asString(send.mode, "scan"),
    query: asString(search.query, "-") || "-",
    cities: joinList(asRecord(pageFilters.city).values),
    anyKeywords: joinList(asRecord(filters.any).keywords),
    excludeKeywords: joinList(asRecord(filters.exclude).keywords),
    maxSent: asString(send.max_sent, "-"),
    dailyLimit: asString(send.daily_sent_limit, "-"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function joinList(value: unknown): string {
  return Array.isArray(value) ? value.map(String).filter(Boolean).join(", ") : "";
}
