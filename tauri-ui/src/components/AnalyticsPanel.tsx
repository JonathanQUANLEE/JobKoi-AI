import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Search,
  Eye,
  Zap,
  ListOrdered,
  Terminal,
  Copy,
} from "lucide-react";
import type { ProgressEvent } from "../lib/ipc";
import type { Mode } from "../lib/profileForm";
import type { DrawerTab } from "./SettingsDrawer";
import PipelineVisualizer from "./PipelineVisualizer";
import { formatEventForDisplay } from "../lib/eventDisplay";
import { formatLocalTime } from "../lib/dashboardHelpers";
import { useT } from "../store";
import { MagicCard } from "./core/MagicBento";

interface AnalyticsPanelProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  running: boolean;
  currentIndex: number | null;
  delayMin: string;
  delayMax: string;
  stats: { scanned: number; sent: number; skipped: number };
  currentJob?: Record<string, unknown>;
  latestSent?: Record<string, unknown>;
  latestSkip?: Record<string, unknown>;
  events: ProgressEvent[];
  logs: string[];
  statusText: string;
  message: string | null;
  onOpenDrawer: (tab: DrawerTab) => void;
  onCopyLogs: () => void;
}

export default function AnalyticsPanel({
  mode,
  setMode,
  running,
  currentIndex,
  delayMin,
  delayMax,
  stats,
  currentJob,
  latestSent,
  latestSkip,
  events,
  logs,
  statusText,
  message,
  onOpenDrawer,
  onCopyLogs,
}: AnalyticsPanelProps) {
  const t = useT();
  const [consoleTab, setConsoleTab] = useState<"pipeline" | "logs">("pipeline");
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* 可视化自动化执行管线大屏 */}
      <PipelineVisualizer
        running={running}
        currentIndex={currentIndex}
        mode={mode}
        delayMin={delayMin}
        delayMax={delayMax}
        stats={stats}
        currentJob={currentJob}
        latestSent={latestSent}
        latestSkip={latestSkip}
        onOpenDrawer={() => onOpenDrawer("policy")}
      />

      {/* 模式选择与巡航控制卡片 */}
      <MagicCard
        glowColor="245, 158, 11"
        className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm"
        enableTilt={false}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--grid)]">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">巡航模式选择与控制</span>
          <span className={running ? "status-on" : "status-idle"}>{statusText}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <ModeButton
            active={mode === "scan"}
            icon={<Search className="h-4 w-4" />}
            title={t("mode.scan.title")}
            desc={t("mode.scan.desc")}
            onClick={() => setMode("scan")}
          />
          <ModeButton
            active={mode === "review"}
            icon={<Eye className="h-4 w-4" />}
            title={t("mode.review.title")}
            desc={t("mode.review.desc")}
            onClick={() => setMode("review")}
          />
          <ModeButton
            active={mode === "auto"}
            icon={<Zap className="h-4 w-4" />}
            title={t("mode.auto.title")}
            desc={t("mode.auto.desc")}
            onClick={() => setMode("auto")}
          />
        </div>

        {mode === "auto" && (
          <div className="risk-box mt-3">
            {t("warning.auto")}
          </div>
        )}

        {message && <div className="mt-3 message-line">{message}</div>}
      </MagicCard>

      {/* 实时事件流水与终端运行日志 */}
      <MagicCard
        glowColor="59, 130, 246"
        className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm"
        enableTilt={false}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--grid)]">
          <div className="flex gap-4 text-xs font-bold">
            <button
              type="button"
              className={`flex items-center gap-1.5 pb-1 transition-all ${
                consoleTab === "pipeline"
                  ? "border-b-2 border-amber-500 text-amber-400"
                  : "text-stone-400 hover:text-stone-200"
              }`}
              onClick={() => setConsoleTab("pipeline")}
            >
              <ListOrdered className="h-3.5 w-3.5" />
              <span>实时事件流水 ({events.length})</span>
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 pb-1 transition-all ${
                consoleTab === "logs"
                  ? "border-b-2 border-amber-500 text-amber-400"
                  : "text-stone-400 hover:text-stone-200"
              }`}
              onClick={() => setConsoleTab("logs")}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>终端运行日志 ({logs.length})</span>
            </button>
          </div>
          <button className="btn-ghost text-xs py-0.5 px-2 flex items-center gap-1" onClick={onCopyLogs}>
            <Copy className="h-3 w-3" />
            <span>{t("button.copyLogs")}</span>
          </button>
        </div>

        <div className="mt-3">
          {consoleTab === "pipeline" ? (
            <div className="event-list h-96">
              {events.length === 0 ? (
                <p className="empty-text">{t("empty.events")}</p>
              ) : (
                events.slice(-150).map((event, index) => <EventRow key={`${event.kind}-${index}`} event={event} />)
              )}
            </div>
          ) : (
            <pre ref={logRef} className="log-box h-96">{logs.length ? logs.join("\n") : t("empty.logs")}</pre>
          )}
        </div>
      </MagicCard>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon?: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? "mode-button active" : "mode-button"}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className={active ? "text-amber-400" : "text-stone-400"}>{icon}</span>}
        <span className="block text-sm font-semibold">{title}</span>
      </div>
      <span className="block text-xs text-[var(--muted-fg)]">{desc}</span>
    </button>
  );
}

function EventRow({ event }: { event: ProgressEvent }) {
  const display = formatEventForDisplay(event, formatLocalTime());
  return (
    <div className={`event-row ${display.severity}`}>
      <div className="event-meta">
        <span className="event-time">{display.time || "-"}</span>
        <span className="event-title">{display.title}</span>
      </div>
      <div className="event-body">
        <span className="event-summary">{display.summary}</span>
        {display.details && <span className="event-details">{display.details}</span>}
      </div>
    </div>
  );
}
