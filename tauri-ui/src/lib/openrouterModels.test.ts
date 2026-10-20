/**
 * OpenRouter 实时模型列表单元测试（2026-10-20 用户需求）。
 *
 * 覆盖：0 元筛选、非对话模型排除（音频输出/安全分类器/元路由）、
 * 厂商优先级排序、换一批循环翻页、拉取失败的三级降级链
 * （实时 → 缓存 → 内置兜底）、缓存写入。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_OPENROUTER_MODELS,
  fetchOpenRouterChatModels,
  pickChatModels,
  rotateBatch,
  type OpenRouterRawModel,
} from "./openrouterModels";

const freeChat = (id: string, ctx = 1000000): OpenRouterRawModel => ({
  id,
  name: id,
  context_length: ctx,
  pricing: { prompt: "0", completion: "0" },
  architecture: { modality: "text->text", input_modalities: ["text"], output_modalities: ["text"] },
});

const paid = (id: string): OpenRouterRawModel => ({
  id,
  pricing: { prompt: "0.000001", completion: "0.000002" },
  architecture: { modality: "text->text", output_modalities: ["text"] },
});

describe("pickChatModels", () => {
  it("只保留 0 元模型，剔除付费模型", () => {
    const ids = pickChatModels([freeChat("nvidia/a:free"), paid("openai/gpt-9")]);
    expect(ids).toEqual(["nvidia/a:free"]);
  });

  it("排除音频/图像输出模型（0 元的音乐生成等非对话模型）", () => {
    const lyria: OpenRouterRawModel = {
      id: "google/lyria-3-pro-preview",
      pricing: { prompt: "0", completion: "0" },
      architecture: { modality: "text->audio", output_modalities: ["text", "audio"] },
    };
    const ids = pickChatModels([freeChat("nvidia/a:free"), lyria]);
    expect(ids).toEqual(["nvidia/a:free"]);
  });

  it("排除安全分类器与平台元路由模型", () => {
    const ids = pickChatModels([
      freeChat("nvidia/nemotron-3.5-content-safety:free"),
      freeChat("openrouter/free"),
      freeChat("nvidia/ok:free"),
    ]);
    expect(ids).toEqual(["nvidia/ok:free"]);
  });

  it("知名厂商优先，同厂商内长上下文优先", () => {
    const ids = pickChatModels([
      freeChat("unknown-vendor/x:free", 500000),
      freeChat("google/b:free", 262144),
      freeChat("google/a:free", 1048576),
      freeChat("nvidia/c:free", 100000),
    ]);
    expect(ids).toEqual(["nvidia/c:free", "google/a:free", "google/b:free", "unknown-vendor/x:free"]);
  });

  it("无 output_modalities 字段的旧形态模型按 modality 兜底判定", () => {
    const legacy: OpenRouterRawModel = {
      id: "meta-llama/legacy:free",
      pricing: { prompt: "0", completion: "0" },
      architecture: { modality: "text->text" },
    };
    expect(pickChatModels([legacy])).toEqual(["meta-llama/legacy:free"]);
  });
});

describe("rotateBatch", () => {
  it("按批次大小切分，batchIndex 越界时循环回卷", () => {
    const models = ["a", "b", "c", "d", "e", "f", "g"];
    expect(rotateBatch(models, 0, 6)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(rotateBatch(models, 1, 6)).toEqual(["g"]);
    // 越界循环：batch 2 → 回到 batch 0
    expect(rotateBatch(models, 2, 6)).toEqual(["a", "b", "c", "d", "e", "f"]);
    // 负数也归一
    expect(rotateBatch(models, -1, 6)).toEqual(["g"]);
  });

  it("空列表返回空", () => {
    expect(rotateBatch([], 0)).toEqual([]);
  });
});

describe("fetchOpenRouterChatModels", () => {
  // vitest 默认 node 环境无 localStorage（生产环境为 Tauri webview，存在），
  // 用内存 Map 桩提供确定性缓存行为。
  const storage = new Map<string, string>();
  const localStorageStub = {
    getItem: (key: string) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => void storage.clear(),
  };

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", localStorageStub);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("实时拉取成功：返回 live 列表并写入缓存", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            freeChat("nvidia/live-a:free"),
            freeChat("google/live-b:free"),
            paid("openai/paid"),
          ],
        }),
      }),
    );
    const res = await fetchOpenRouterChatModels();
    expect(res.source).toBe("live");
    expect(res.models).toEqual(["nvidia/live-a:free", "google/live-b:free"]);
    // 缓存已写入：断网后可读取
    const raw = localStorage.getItem("jobkoi_openrouter_models_v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).models).toContain("nvidia/live-a:free");
  });

  it("拉取失败：6 小时内的缓存生效（source=cache）", async () => {
    localStorage.setItem(
      "jobkoi_openrouter_models_v1",
      JSON.stringify({ models: ["cached/model:free"], ts: Date.now() - 60_000 }),
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));
    const res = await fetchOpenRouterChatModels();
    expect(res.source).toBe("cache");
    expect(res.models).toEqual(["cached/model:free"]);
  });

  it("拉取失败且无缓存：内置兜底列表生效（source=fallback）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));
    const res = await fetchOpenRouterChatModels();
    expect(res.source).toBe("fallback");
    expect(res.models).toEqual(FALLBACK_OPENROUTER_MODELS);
  });

  it("拉取失败且缓存已过期：宁可退回发版日快照也不用陈年缓存", async () => {
    localStorage.setItem(
      "jobkoi_openrouter_models_v1",
      JSON.stringify({ models: ["stale/model:free"], ts: Date.now() - 7 * 24 * 60 * 60 * 1000 }),
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));
    const res = await fetchOpenRouterChatModels();
    expect(res.source).toBe("fallback");
    expect(res.models).toEqual(FALLBACK_OPENROUTER_MODELS);
  });

  it("接口返回空列表视为失败，走降级链", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    );
    const res = await fetchOpenRouterChatModels();
    expect(res.source).toBe("fallback");
  });
});
