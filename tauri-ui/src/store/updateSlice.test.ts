import { describe, expect, it } from "vitest";
import { useRunStore } from "./index";

/** 用组合后的完整 store 测 updateSlice 状态机（slice 均为纯函数，无副作用）。 */
const S = () => useRunStore.getState();

describe("updateSlice 状态机", () => {
  it("初始无弹窗", () => {
    expect(S().updateDialog).toBeNull();
  });

  it("openUpdateDialog → available 态", () => {
    S().openUpdateDialog({ version: "0.7.0", notes: "n" });
    const d = S().updateDialog;
    expect(d?.status).toBe("available");
    expect(d?.version).toBe("0.7.0");
    expect(d?.notes).toBe("n");
    expect(d?.received).toBe(0);
    expect(d?.total).toBe(0);
    expect(d?.errorMessage).toBeNull();
    S().closeUpdateDialog();
  });

  it("downloading 态：进度更新不动版本字段", () => {
    S().openUpdateDialog({ version: "0.7.0", notes: null });
    S().setUpdateStatus("downloading");
    S().setUpdateProgress(1024, 4096);
    const d = S().updateDialog;
    expect(d?.status).toBe("downloading");
    expect(d?.received).toBe(1024);
    expect(d?.total).toBe(4096);
    expect(d?.version).toBe("0.7.0");
    S().closeUpdateDialog();
  });

  it("error 态：错误信息落位", () => {
    S().openUpdateDialog({ version: "0.7.0", notes: null });
    S().setUpdateStatus("downloading");
    S().setUpdateStatus("error", "download failed");
    expect(S().updateDialog?.errorMessage).toBe("download failed");
    S().closeUpdateDialog();
  });

  it("installing 态后 closeUpdateDialog 清空", () => {
    S().openUpdateDialog({ version: "0.7.0", notes: null });
    S().setUpdateStatus("installing");
    expect(S().updateDialog?.status).toBe("installing");
    S().closeUpdateDialog();
    expect(S().updateDialog).toBeNull();
  });

  it("弹窗未开时 setUpdateProgress/setUpdateStatus 不产生状态（不误开弹窗）", () => {
    S().closeUpdateDialog();
    S().setUpdateProgress(1, 2);
    S().setUpdateStatus("downloading");
    expect(S().updateDialog).toBeNull();
  });
});
