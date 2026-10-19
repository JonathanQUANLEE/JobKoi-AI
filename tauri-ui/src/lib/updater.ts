/**
 * 软件内自动更新域封装（2026-10-19，tauri-plugin-updater / process）。
 *
 * 设计要点：
 * - 插件 JS API 不在 window.__TAURI__ 全局里（pytauri 只挂核心 API），
 *   一律动态 import——与 DashboardHeader 混合调用模式一致；
 * - store 只持纯数据（updateSlice），Update 活体对象不跨层传递，
 *   downloadAndInstall 内部重新 check() 取活体；
 * - 仅 Windows 走更新链（产品决策：macOS 不进 latest.json，查了也会
 *   TargetNotFound，isWindowsClient 直接短路）。
 */

export interface UpdateInfo {
  version: string;
  notes: string | null;
  date: string | null;
}

export interface DownloadProgress {
  received: number;
  total: number;
}

/** 是否 Windows 客户端（WebView2 的 navigator.platform 可靠返回 Win32）。 */
export function isWindowsClient(): boolean {
  return typeof navigator !== "undefined" && /win/i.test(navigator.platform);
}

/** 检查更新：有更新返回版本信息，无更新返回 null，网络/插件异常抛错。 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
  };
}

/**
 * 下载并安装当前可用更新（Windows NSIS passive：安装器自动退出应用、
 * 装完自动拉起新版本，无需手动 relaunch）。内部重新 check() 取活体。
 */
export async function downloadAndInstall(
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) throw new Error("no-update-available");
  let received = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        received = 0;
        onProgress?.({ received, total });
        break;
      case "Progress":
        received += event.data.chunkLength;
        onProgress?.({ received, total });
        break;
      case "Finished":
        onProgress?.({ received: Math.max(received, total), total });
        break;
    }
  });
}

/** 下载进度百分比；总量未知（total<=0 / 非有限数）返回 null（走不定态进度条）。 */
export function computePercent(received: number, total: number): number | null {
  if (!Number.isFinite(received) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  const pct = Math.floor((received / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

/** 手动重启应用（process 插件；Windows passive 安装链路通常用不到，留作兜底）。 */
export async function restartApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/** GitHub Releases 页（错误态的手动下载入口）。 */
export const RELEASES_PAGE_URL = "https://github.com/JonathanQUANLEE/JobKoi-AI/releases/latest";
