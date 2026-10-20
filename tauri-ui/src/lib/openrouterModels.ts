/**
 * OpenRouter 实时可用模型列表（2026-10-20 用户需求）。
 *
 * 背景：OpenRouter 的免费模型每周都有增删，硬编码的快捷选用 chips 会
 * 过期（实测：v0.8.0 预置的 gemini-2.0-flash-exp:free / llama-3.3-70b
 * 已不再免费）。改为打开 OpenRouter 预设时实时拉取
 * openrouter.ai/api/v1/models（公开端点、CORS 全开放、无需 Key），
 * 筛出「当前 0 元且纯文本对话可用」的模型供点击选用。
 *
 * 国内网络无法直连 OpenRouter 时的降级链：实时 → localStorage 缓存
 * （6 小时）→ 内置兜底列表（跟随发版日快照）。
 */

export type OpenRouterRawModel = {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
};

export type OpenRouterModelsSource = "live" | "cache" | "fallback";

export type OpenRouterModelsResult = {
  models: string[];
  source: OpenRouterModelsSource;
};

const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "jobkoi_openrouter_models_v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时：免费档日更，无需更频繁
const FETCH_TIMEOUT_MS = 8000;

/**
 * 内置兜底列表（2026-10-20 实测快照，按厂商优先级排序）。
 * 仅在「实时拉取失败 且 无缓存」时使用；每个发版日可顺手更新。
 */
export const FALLBACK_OPENROUTER_MODELS: string[] = [
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "minimax/minimax-m3.1-flash:free",
  "thinkingmachines/inkling:free",
  "cohere/north-mini-code:free",
  "xingchen-agi/xing4.0-29b-a4b:free",
];

/** 知名厂商优先（用户视角的可信排序），未列出的排最后。 */
const PROVIDER_PRIORITY = [
  "nvidia/",
  "google/",
  "meta-llama/",
  "deepseek/",
  "qwen/",
  "minimax/",
  "microsoft/",
  "mistralai/",
  "cohere/",
  "thinkingmachines/",
];

/** 按名称排除不适合「对话」的模型（安全分类器 / 审查路由等）。 */
const EXCLUDE_SUBSTRINGS = ["content-safety", "guard", "moderation", "shield"];

function isZeroPrice(model: OpenRouterRawModel): boolean {
  const prompt = Number.parseFloat(model?.pricing?.prompt ?? "-1");
  const completion = Number.parseFloat(model?.pricing?.completion ?? "-1");
  return prompt === 0 && completion === 0;
}

function isTextChatCapable(model: OpenRouterRawModel): boolean {
  const out = model?.architecture?.output_modalities;
  if (Array.isArray(out) && out.length > 0) {
    // 排除音频/图像输出模型（如 google/lyria-3-* 音乐生成，虽 0 元但非对话）
    if (!out.includes("text")) return false;
    if (out.some((m) => m !== "text")) return false;
  }
  const modality = model?.architecture?.modality ?? "";
  if (modality && !modality.startsWith("text->")) return false;
  return true;
}

/** 筛选并排序：免费（0 元）+ 纯文本对话可用 + 知名厂商优先 + 长上下文优先。 */
export function pickChatModels(rawModels: OpenRouterRawModel[]): string[] {
  const picked = rawModels.filter((m) => {
    const id = String(m?.id ?? "");
    if (!id) return false;
    if (id === "openrouter/free") return false; // 平台自动路由元模型，非具体对话模型
    if (EXCLUDE_SUBSTRINGS.some((s) => id.toLowerCase().includes(s))) return false;
    if (!isZeroPrice(m)) return false;
    if (!isTextChatCapable(m)) return false;
    return true;
  });

  const providerScore = (id: string): number => {
    const idx = PROVIDER_PRIORITY.findIndex((p) => id.startsWith(p));
    return idx === -1 ? PROVIDER_PRIORITY.length : idx;
  };

  return picked
    .sort((a, b) => {
      const sa = providerScore(String(a.id));
      const sb = providerScore(String(b.id));
      if (sa !== sb) return sa - sb;
      return (b?.context_length ?? 0) - (a?.context_length ?? 0);
    })
    .map((m) => String(m.id));
}

/** 「换一批」：从有序列表中循环取第 batchIndex 批（每批 batchSize 个）。 */
export function rotateBatch(models: string[], batchIndex: number, batchSize = 6): string[] {
  if (!models.length) return [];
  const batches = Math.max(1, Math.ceil(models.length / batchSize));
  const idx = ((batchIndex % batches) + batches) % batches;
  return models.slice(idx * batchSize, idx * batchSize + batchSize);
}

function readCache(): { models: string[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { models?: string[]; ts?: number };
    if (!Array.isArray(parsed.models) || parsed.models.length === 0) return null;
    if (typeof parsed.ts !== "number") return null;
    return { models: parsed.models.filter((m) => typeof m === "string"), ts: parsed.ts };
  } catch {
    return null;
  }
}

function writeCache(models: string[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ models, ts: Date.now() }));
  } catch {
    // localStorage 不可用（隐私模式等）——缓存层静默降级
  }
}

/**
 * 拉取 OpenRouter 当前可用对话模型。
 * 永不抛异常：失败时按 缓存 → 内置兜底 顺序降级。
 */
export async function fetchOpenRouterChatModels(): Promise<OpenRouterModelsResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(MODELS_ENDPOINT, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { data?: OpenRouterRawModel[] };
    const models = pickChatModels(Array.isArray(data?.data) ? data.data : []);
    if (models.length === 0) throw new Error("empty model list");
    writeCache(models);
    return { models, source: "live" };
  } catch {
    const cached = readCache();
    // 缓存在 TTL 内（6 小时）视为可靠的「最近一次真实列表」；
    // 超龄缓存可能全是已下线模型，宁可退回发版日快照的内置兜底。
    if (cached && Date.now() - cached.ts <= CACHE_TTL_MS) {
      return { models: cached.models, source: "cache" };
    }
    return { models: FALLBACK_OPENROUTER_MODELS, source: "fallback" };
  }
}
