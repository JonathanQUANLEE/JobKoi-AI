import { Download, ExternalLink, RefreshCw, Sparkles, X } from "lucide-react";
import { useCallback } from "react";
import { useRunStore, useT } from "../../store";
import {
  RELEASES_PAGE_URL,
  computePercent,
  downloadAndInstall,
} from "../../lib/updater";
import { openSystemBrowser } from "../../lib/browserUtils";

/**
 * 软件内更新弹窗（2026-10-19 自动更新）。仿 StartConfirmDialog 视觉。
 *
 * 状态机：available（确认）→ downloading（进度条）→ installing（Windows
 * passive 安装器自动退出并拉起新版本）→ 应用被杀；任一步失败进 error。
 * 巡航运行中禁用「立即更新」——投递安全优先于版本更新。
 */
export default function UpdateDialog() {
  const t = useT();
  const dialog = useRunStore((s) => s.updateDialog);
  const running = useRunStore((s) => s.running);
  const setUpdateProgress = useRunStore((s) => s.setUpdateProgress);
  const setUpdateStatus = useRunStore((s) => s.setUpdateStatus);
  const closeUpdateDialog = useRunStore((s) => s.closeUpdateDialog);

  const startUpdate = useCallback(async () => {
    setUpdateStatus("downloading");
    try {
      await downloadAndInstall((p) => setUpdateProgress(p.received, p.total));
      // Windows NSIS passive：此处之后安装器接管（应用退出 → 新版自启）
      setUpdateStatus("installing");
    } catch (err) {
      setUpdateStatus("error", String(err instanceof Error ? err.message : err));
    }
  }, [setUpdateProgress, setUpdateStatus]);

  if (!dialog) return null;

  const percent = computePercent(dialog.received, dialog.total);
  const canClose = dialog.status === "available" || dialog.status === "error";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center select-none animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[6px]" />

      <div className="relative w-[340px] rounded-3xl border border-stone-700/70 bg-stone-950/95 px-7 py-7 shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-200">
        {canClose && (
          <button
            type="button"
            onClick={closeUpdateDialog}
            className="absolute right-3.5 top-3.5 p-1.5 rounded-xl text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
            title={t("update.later")}
          >
            <X className="size-4" />
          </button>
        )}

        {/* 图标区：按状态切换 */}
        <div className="flex items-center justify-center">
          <div className="grid size-20 place-items-center rounded-full border-2 border-amber-400/70 bg-amber-500/5">
            {dialog.status === "available" && <Sparkles className="size-9 text-amber-300" />}
            {dialog.status === "downloading" && <Download className="size-9 text-amber-300 animate-bounce" />}
            {dialog.status === "installing" && <RefreshCw className="size-9 text-amber-300 animate-spin" />}
            {dialog.status === "error" && <X className="size-9 text-red-400" />}
          </div>
        </div>

        {/* 文案区 */}
        <div className="mt-5 text-center space-y-1.5">
          {dialog.status === "available" && (
            <>
              <h3 className="text-base font-bold text-stone-100">{t("update.availableTitle")}</h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                {t("update.availableBody", { version: dialog.version })}
              </p>
              {dialog.notes && (
                <details className="text-left text-[11px] text-stone-500">
                  <summary className="cursor-pointer hover:text-stone-300">{t("update.notesToggle")}</summary>
                  <p className="mt-1.5 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{dialog.notes}</p>
                </details>
              )}
              {running && (
                <p className="text-[11px] text-amber-400/90 leading-relaxed">{t("update.runningWarning")}</p>
              )}
            </>
          )}
          {dialog.status === "downloading" && (
            <>
              <h3 className="text-base font-bold text-stone-100">{t("update.downloading")}</h3>
              {/* 进度条：总量未知走不定态动画条 */}
              {percent !== null ? (
                <div className="mt-3 h-2 rounded-full bg-stone-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              ) : (
                <div className="mt-3 h-2 rounded-full bg-stone-800 overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-amber-400 animate-pulse" />
                </div>
              )}
              <p className="text-[11px] text-stone-500">
                {percent !== null ? `${percent}%` : "…"}
              </p>
            </>
          )}
          {dialog.status === "installing" && (
            <>
              <h3 className="text-base font-bold text-stone-100">{t("update.installingTitle")}</h3>
              <p className="text-xs text-stone-400 leading-relaxed">{t("update.installing")}</p>
            </>
          )}
          {dialog.status === "error" && (
            <>
              <h3 className="text-base font-bold text-stone-100">{t("update.errorTitle")}</h3>
              <p className="text-xs text-stone-400 leading-relaxed break-all">
                {t("update.installFailed", { message: dialog.errorMessage ?? "" })}
              </p>
            </>
          )}
        </div>

        {/* 按钮区 */}
        <div className="mt-6 flex items-center gap-3">
          {dialog.status === "available" && (
            <>
              <button
                type="button"
                className="btn-primary flex-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={running}
                onClick={() => void startUpdate()}
              >
                {t("update.updateNow")}
              </button>
              <button type="button" className="btn-ghost cursor-pointer" onClick={closeUpdateDialog}>
                {t("update.later")}
              </button>
            </>
          )}
          {dialog.status === "error" && (
            <>
              <button
                type="button"
                className="btn-primary flex-1 cursor-pointer"
                onClick={() => void startUpdate()}
              >
                {t("update.retry")}
              </button>
              <button
                type="button"
                className="btn-ghost cursor-pointer flex items-center gap-1"
                onClick={() => void openSystemBrowser(RELEASES_PAGE_URL)}
              >
                <ExternalLink className="size-3" />
                {t("update.manualDownload")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
