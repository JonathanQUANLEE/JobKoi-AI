import { describe, expect, it, vi, beforeEach } from "vitest";
import { computePercent, isWindowsClient, checkForUpdate } from "./updater";

describe("computePercent", () => {
  it("正常比例取整", () => {
    expect(computePercent(50, 200)).toBe(25);
    expect(computePercent(199, 200)).toBe(99);
    expect(computePercent(200, 200)).toBe(100);
    expect(computePercent(0, 200)).toBe(0);
  });

  it("越界钳制到 0~100", () => {
    expect(computePercent(300, 200)).toBe(100);
    expect(computePercent(-10, 200)).toBe(0);
  });

  it("总量未知（total<=0）返回 null 走不定态进度条", () => {
    expect(computePercent(100, 0)).toBeNull();
    expect(computePercent(100, -1)).toBeNull();
  });

  it("非有限数返回 null", () => {
    expect(computePercent(NaN, 100)).toBeNull();
    expect(computePercent(100, Infinity)).toBeNull();
  });
});

describe("isWindowsClient", () => {
  it("Win32 平台返回 true", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    expect(isWindowsClient()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("Mac 平台返回 false", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(isWindowsClient()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("checkForUpdate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("check 返回 null（无更新）时映射为 null", async () => {
    vi.doMock("@tauri-apps/plugin-updater", () => ({
      check: vi.fn().mockResolvedValue(null),
    }));
    const { checkForUpdate: fn } = await import("./updater");
    expect(await fn()).toBeNull();
  });

  it("有更新时映射纯数据字段", async () => {
    vi.doMock("@tauri-apps/plugin-updater", () => ({
      check: vi.fn().mockResolvedValue({
        version: "0.7.0",
        body: "修复若干问题",
        date: "2026-10-19T00:00:00Z",
      }),
    }));
    const { checkForUpdate: fn } = await import("./updater");
    expect(await fn()).toEqual({
      version: "0.7.0",
      notes: "修复若干问题",
      date: "2026-10-19T00:00:00Z",
    });
  });

  it("body/date 缺省映射为 null", async () => {
    vi.doMock("@tauri-apps/plugin-updater", () => ({
      check: vi.fn().mockResolvedValue({ version: "0.7.0" }),
    }));
    const { checkForUpdate: fn } = await import("./updater");
    expect(await fn()).toEqual({ version: "0.7.0", notes: null, date: null });
  });

  it("插件异常向上抛（调用方决定静默或提示）", async () => {
    vi.doMock("@tauri-apps/plugin-updater", () => ({
      check: vi.fn().mockRejectedValue(new Error("network")),
    }));
    const { checkForUpdate: fn } = await import("./updater");
    await expect(fn()).rejects.toThrow("network");
  });
});
