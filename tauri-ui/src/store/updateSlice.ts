/** 更新弹窗状态（2026-10-19 自动更新）。仿 noticeSlice 的 startConfirm 模式：
 * store 持状态，全局挂载的 UpdateDialog 订阅渲染；Update 活体对象不进 store。 */
import type { StateCreator } from "zustand";
import type { RunStore } from "./types";

export type UpdateStatus = "available" | "downloading" | "installing" | "error";

export interface UpdateDialogState {
  status: UpdateStatus;
  version: string;
  notes: string | null;
  received: number;
  total: number;
  errorMessage: string | null;
}

export interface UpdateSlice {
  updateDialog: UpdateDialogState | null;
  openUpdateDialog: (info: { version: string; notes: string | null }) => void;
  setUpdateProgress: (received: number, total: number) => void;
  setUpdateStatus: (status: UpdateStatus, errorMessage?: string | null) => void;
  closeUpdateDialog: () => void;
}

export const createUpdateSlice: StateCreator<
  RunStore,
  [],
  [],
  UpdateSlice
> = (set) => ({
  updateDialog: null,
  openUpdateDialog: (info) =>
    set({
      updateDialog: {
        status: "available",
        version: info.version,
        notes: info.notes,
        received: 0,
        total: 0,
        errorMessage: null,
      },
    }),
  setUpdateProgress: (received, total) =>
    set((state) =>
      state.updateDialog
        ? { updateDialog: { ...state.updateDialog, received, total } }
        : state,
    ),
  setUpdateStatus: (status, errorMessage = null) =>
    set((state) =>
      state.updateDialog
        ? { updateDialog: { ...state.updateDialog, status, errorMessage } }
        : state,
    ),
  closeUpdateDialog: () => set({ updateDialog: null }),
});
