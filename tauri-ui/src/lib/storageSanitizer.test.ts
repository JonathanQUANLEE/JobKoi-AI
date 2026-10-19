import { describe, expect, it, beforeEach } from "vitest";
import { sanitizeStorageOnStartup, CURRENT_STORAGE_VERSION } from "./storageSanitizer";
import pkg from "../../package.json";

describe("storageSanitizer", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    // @ts-expect-error Mocking window in node
    globalThis.window = { localStorage: mockStorage };
    // @ts-expect-error Mocking localStorage in node
    globalThis.localStorage = mockStorage;
  });

  it("版本守卫：CURRENT_STORAGE_VERSION 与 package.json version 一致", () => {
    // 发版忘改 storageSanitizer 的硬编码版本时，此测试红——防止版本
    // 隔离逻辑静默失效。
    expect(CURRENT_STORAGE_VERSION).toBe(pkg.version);
  });

  it("版本迭代时清空开发期堆积的通知日志", () => {
    const fakeLogs = Array.from({ length: 25 }, (_, i) => ({
      id: `log_${i}`,
      text: `Test log ${i}`,
    }));
    localStorage.setItem("jobhunter_audit_notifications_v1", JSON.stringify(fakeLogs));

    sanitizeStorageOnStartup();

    expect(localStorage.getItem("jobhunter_audit_notifications_v1")).toBeNull();
    expect(localStorage.getItem("jobkoi_app_storage_version")).toBe(
      CURRENT_STORAGE_VERSION
    );
  });

  it("同版本重复启动不清空任何数据", () => {
    localStorage.setItem("jobkoi_app_storage_version", CURRENT_STORAGE_VERSION);
    localStorage.setItem(
      "jobhunter_audit_notifications_v1",
      JSON.stringify([{ id: "a", text: "keep me" }])
    );

    sanitizeStorageOnStartup();

    expect(localStorage.getItem("jobhunter_audit_notifications_v1")).not.toBeNull();
  });

  it("任何情况下都不触碰用户的 GitHub 登录态（含开发者本人）", () => {
    // 2026-10-19 审查决策：localStorage 不进安装包，新用户不可能继承
    // 开发者身份；反之拦截会把自己人（开发者本人）永远踢出正式版。
    localStorage.setItem(
      "jobhunter_github_user_v1",
      JSON.stringify({ login: "JonathanQUANLEE", name: "Dev" })
    );
    localStorage.setItem("jobkoi_star_unlocked", "true");

    sanitizeStorageOnStartup();

    expect(localStorage.getItem("jobhunter_github_user_v1")).not.toBeNull();
    expect(localStorage.getItem("jobkoi_star_unlocked")).toBe("true");
  });

  it("版本迭代时不整段清除管家对话历史（用户资产，逐条过滤在 agentSlice）", () => {
    const chat = [
      { role: "user", content: "帮我投深圳的实习" },
      { role: "assistant", content: "好的，已生成配置" },
      { role: "assistant", content: "出错了：模型响应失败 [timeout]" },
    ];
    localStorage.setItem("jobhunter_copilot_chat_history_v1", JSON.stringify(chat));

    sanitizeStorageOnStartup();

    // storageSanitizer 不碰对话历史——破损消息由 agentSlice 过滤，
    // 正常消息必须原样保留。
    expect(localStorage.getItem("jobhunter_copilot_chat_history_v1")).not.toBeNull();
  });
});
