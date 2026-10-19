import { useEffect } from "react";
import { useRunStore } from "../store";
import { checkForUpdate, isWindowsClient } from "../lib/updater";

/**
 * 启动静默更新检查（2026-10-19 自动更新）。
 *
 * - 仅生产构建 + Windows 客户端（dev 会话不查，避免开发时被打扰；
 *   macOS 不进 latest.json，查了必 TargetNotFound）；
 * - 启动后延迟 3s（等窗口稳定）静默 check 一次：有更新才弹窗，
 *   无更新/网络失败完全静默——大陆访问 GitHub 不稳，绝不能弹错打扰用户。
 */
export function useUpdateChecker() {
  const openUpdateDialog = useRunStore((s) => s.openUpdateDialog);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!isWindowsClient()) return;
    const timer = setTimeout(() => {
      checkForUpdate()
        .then((info) => {
          if (info) openUpdateDialog(info);
        })
        .catch(() => {
          /* 静默失败：手动检查入口在「关于与帮助」页 */
        });
    }, 3000);
    return () => clearTimeout(timer);
  }, [openUpdateDialog]);
}
