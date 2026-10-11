import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./ipc", () => ({
  ipc: {
    getProfile: vi.fn(async () => ({ name: "gui-default", path: "", data: {} })),
    getGreeting: vi.fn(async () => ({ path: "./greetings/default.txt", text: "" })),
  },
}));

import { ipc } from "./ipc";
import { stableStringify, hasUnsavedProfileChanges, FALLBACK_GREETING_TEXT } from "./dashboardHelpers";

const mockedGetProfile = vi.mocked(ipc.getProfile);
const mockedGetGreeting = vi.mocked(ipc.getGreeting);

const DISK_PROFILE = {
  search: { query: "AI agent" },
  send: { mode: "auto", delay_min: 10, delay_max: 60, max_sent: 50, daily_sent_limit: 80 },
};

const FORM_SAME = () =>
  ({
    send: { daily_sent_limit: 80, max_sent: 50, delay_max: 60, delay_min: 10, mode: "auto" },
    search: { query: "AI agent" },
  }) as never;

const FORM_CHANGED = () =>
  ({
    search: { query: "后端开发" },
    send: { mode: "auto", delay_min: 10, delay_max: 60, max_sent: 50, daily_sent_limit: 80 },
  }) as never;

beforeEach(() => {
  mockedGetProfile.mockReset();
  mockedGetGreeting.mockReset();
  mockedGetProfile.mockResolvedValue({ name: "gui-default", path: "", data: DISK_PROFILE });
  mockedGetGreeting.mockResolvedValue({ path: "./greetings/default.txt", text: "" });
});

describe("stableStringify", () => {
  it("对象键序不同、内容相同 → 序列化结果一致", () => {
    expect(stableStringify({ a: 1, b: [2, { c: 3, d: 4 }] })).toBe(
      stableStringify({ b: [2, { d: 4, c: 3 }], a: 1 }),
    );
  });

  it("数组保持顺序（顺序也是内容的一部分）", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it("基础类型与 null 正常序列化", () => {
    expect(stableStringify(3)).toBe("3");
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
  });
});

describe("hasUnsavedProfileChanges", () => {
  it("表单与磁盘一致 → 无修改", async () => {
    await expect(
      hasUnsavedProfileChanges({
        profileName: "gui-default",
        currentProfileData: FORM_SAME,
        greeting: "",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(false);
  });

  it("画像内容不同 → 有修改", async () => {
    await expect(
      hasUnsavedProfileChanges({
        profileName: "gui-default",
        currentProfileData: FORM_CHANGED,
        greeting: "",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(true);
  });

  it("磁盘上没有该画像 → 有修改（必须先保存，后端才能加载）", async () => {
    mockedGetProfile.mockRejectedValue(new Error("not found"));
    await expect(
      hasUnsavedProfileChanges({
        profileName: "brand-new",
        currentProfileData: FORM_SAME,
        greeting: "",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(true);
  });

  it("招呼语文本与磁盘不同 → 有修改", async () => {
    mockedGetGreeting.mockResolvedValue({ path: "./greetings/default.txt", text: "旧招呼语" });
    await expect(
      hasUnsavedProfileChanges({
        profileName: "gui-default",
        currentProfileData: FORM_SAME,
        greeting: "新招呼语",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(true);
  });

  it("磁盘招呼语为空（从未保存）→ 不算修改，避免首启弹窗噪音", async () => {
    mockedGetGreeting.mockResolvedValue({ path: "./greetings/default.txt", text: "" });
    await expect(
      hasUnsavedProfileChanges({
        profileName: "gui-default",
        currentProfileData: FORM_SAME,
        greeting: "",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(false);
  });

  it("表单招呼语为空、磁盘存的就是兜底文案 → 无修改（启动会保存同样的文案）", async () => {
    mockedGetGreeting.mockResolvedValue({ path: "./greetings/default.txt", text: FALLBACK_GREETING_TEXT });
    await expect(
      hasUnsavedProfileChanges({
        profileName: "gui-default",
        currentProfileData: FORM_SAME,
        greeting: "",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(false);
  });

  it("招呼语文件路径不同 → 有修改", async () => {
    mockedGetGreeting.mockResolvedValue({ path: "./greetings/old.txt", text: "" });
    await expect(
      hasUnsavedProfileChanges({
        profileName: "gui-default",
        currentProfileData: FORM_SAME,
        greeting: "",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(true);
  });

  it("招呼语 IPC 失败 → fail-open 不拦截", async () => {
    mockedGetGreeting.mockRejectedValue(new Error("io"));
    await expect(
      hasUnsavedProfileChanges({
        profileName: "gui-default",
        currentProfileData: FORM_SAME,
        greeting: "",
        greetingPath: "./greetings/default.txt",
      }),
    ).resolves.toBe(false);
  });
});
