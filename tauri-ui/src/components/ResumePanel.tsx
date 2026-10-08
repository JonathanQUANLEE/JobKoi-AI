import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  RefreshCw,
  UploadCloud,
  Star,
  Info,
} from "lucide-react";
import { ipc, type ResumeItem } from "../lib/ipc";
import { useT } from "../store";

/**
 * 我的简历资料库：列出 resume/ 目录里的简历文件，支持设默认简历。
 * 纯本地私密文件管理，不上传外部服务器。
 */
export default function ResumePanel() {
  const t = useT();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await ipc.listResumes();
      setResumes(result.resumes);
      setMessage(null);
    } catch (err) {
      setMessage(t("resume.loadFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setDefault(name: string) {
    setBusy(true);
    setMessage(null);
    try {
      await ipc.setDefaultResume(name);
      await refresh();
      setMessage(t("resume.defaultSet", { name }));
    } catch (err) {
      setMessage(t("resume.setFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--accent)]" />
          <span>{t("panel.resume")}</span>
        </span>
        <button
          className="btn-ghost text-xs flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-[var(--grid)] hover:border-amber-500/40"
          onClick={refresh}
          disabled={busy}
        >
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          <span>{t("resume.refresh")}</span>
        </button>
      </div>

      <p className="text-xs text-[var(--muted-fg)] mb-3 leading-relaxed">
        {t("resume.hint")}
      </p>

      {resumes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--grid)] bg-[var(--panel-2)]/50 p-6 text-center">
          <UploadCloud className="mx-auto h-8 w-8 text-stone-600 mb-2" />
          <p className="text-xs text-[var(--muted-fg)]">{t("resume.empty")}</p>
          <p className="text-[11px] text-stone-500 mt-1">支持格式：PDF、Word (.docx)、PNG/JPG 图片</p>
        </div>
      ) : (
        <div className="space-y-2">
          {resumes.map((item) => (
            <div
              key={item.name}
              className={`group flex items-center justify-between rounded-xl border p-3 transition-all ${
                item.is_default
                  ? "border-amber-500/40 bg-amber-500/5 shadow-sm"
                  : "border-[var(--grid)] bg-[var(--panel-2)] hover:border-stone-700 hover:bg-[var(--panel-hover)]"
              }`}
            >
              <div className="min-w-0 flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                  item.is_default ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-[var(--grid)] bg-stone-900 text-stone-400"
                }`}>
                  <FileText className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-[var(--ink)]">
                      {item.name}
                    </span>
                    {item.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/30">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{t("resume.defaultTag")}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--muted-fg)] mt-0.5">
                    {item.mtime} · {formatSize(item.size)}
                  </div>
                </div>
              </div>

              {!item.is_default && (
                <button
                  className="btn-secondary text-[11px] h-7 px-3 opacity-80 group-hover:opacity-100"
                  onClick={() => setDefault(item.name)}
                  disabled={busy}
                >
                  {t("resume.setDefault")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </section>
  );
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}
