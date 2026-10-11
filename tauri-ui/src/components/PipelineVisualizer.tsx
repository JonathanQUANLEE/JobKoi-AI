import { useMemo, type ReactNode } from "react";
import {
  Search,
  Cpu,
  Clock,
  Send,
  CheckCircle2,
  MapPin,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { type Mode } from "../lib/profileForm";
import { MagicCard } from "./core/MagicBento";

interface PipelineVisualizerProps {
  running: boolean;
  currentIndex: number | null;
  mode: Mode;
  delayMin: string;
  delayMax: string;
  stats: { scanned: number; sent: number; skipped: number };
  currentJob?: {
    title?: string;
    job_name?: string;
    company?: string;
    company_name?: string;
    salary?: string;
    area?: string;
    city?: string;
    active_status?: string;
    match_reason?: string;
    reason?: string;
    [key: string]: any;
  };
  latestSent?: {
    status?: string;
    match_explanation?: string;
    [key: string]: any;
  };
  latestSkip?: {
    detail?: string;
    reason?: string;
    [key: string]: any;
  };
  onOpenDrawer?: () => void;
}

export default function PipelineVisualizer({
  running,
  currentIndex,
  mode,
  delayMin,
  delayMax,
  stats,
  currentJob,
  latestSent,
  latestSkip,
  onOpenDrawer,
}: PipelineVisualizerProps) {
  // 计算转化率
  const rate = useMemo(() => {
    if (!stats.scanned || stats.scanned === 0) return "0%";
    return `${Math.round((stats.sent / stats.scanned) * 100)}%`;
  }, [stats]);

  const jobTitle = currentJob?.title || currentJob?.job_name || "等待捕获岗位...";
  const company = currentJob?.company || currentJob?.company_name || "待定";
  const salary = currentJob?.salary || "-";
  const location = currentJob?.area || currentJob?.city || "-";
  const matchReason =
    currentJob?.match_reason ||
    currentJob?.reason ||
    latestSent?.match_explanation ||
    latestSkip?.detail ||
    "等待意向规则匹配...";

  return (
    <div className="space-y-4">
      {/* 自动化运行管线（Pipeline Stepper） */}
      <MagicCard
        glowColor="245, 158, 11"
        className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm"
        enableTilt={false}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--grid)]">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              自动化执行管线 (Pipeline)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400">
              {mode === "auto" ? "全自动投递" : mode === "review" ? "人工审核模式" : "仅扫描匹配"}
            </span>
          </div>
        </div>

        {/* 四阶段指示流程 */}
        <div className="grid grid-cols-4 gap-2 pt-4 pb-2">
          <PipelineStep
            icon={<Search className="h-3.5 w-3.5" />}
            title="搜索扫描"
            desc="抓取招聘列表"
            status={running ? "done" : "idle"}
          />
          <PipelineStep
            icon={<Cpu className="h-3.5 w-3.5" />}
            title="AI 规则匹配"
            desc="核对意向与关键词"
            status={running ? "active" : "idle"}
          />
          <PipelineStep
            icon={<Clock className="h-3.5 w-3.5" />}
            title="拟人延时"
            desc={`${delayMin}~${delayMax}s 随机停顿`}
            status={running ? "active" : "idle"}
          />
          <PipelineStep
            icon={<Send className="h-3.5 w-3.5" />}
            title="沟通投递"
            desc="打招呼与发简历"
            status={running && stats.sent > 0 ? "done" : "idle"}
          />
        </div>

        {/* 当前处理中岗位卡片 (Live Job Focus Card) */}
        <MagicCard
          glowColor="245, 158, 11"
          className="mt-4 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 transition-all"
          enableTilt={false}
          particleCount={6}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[var(--ink)] truncate max-w-[200px]">
                  {jobTitle}
                </span>
                {salary !== "-" && (
                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                    {salary}
                  </span>
                )}
                {location !== "-" && (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--muted-fg)]">
                    <MapPin className="h-3 w-3 text-stone-500" />
                    <span>{location}</span>
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--muted-fg)] mt-1 flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-stone-500" />
                  <span>{company}</span>
                </span>
                {currentJob?.active_status && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-500/20">
                    {currentJob.active_status}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-[var(--muted-fg)]">序号</div>
              <div className="text-sm font-mono font-bold text-[var(--accent)]">
                {currentIndex ? `#${currentIndex}` : "-"}
              </div>
            </div>
          </div>

          {/* 匹配理由气泡 */}
          <div className="mt-3 rounded-lg border border-[var(--grid)] bg-[var(--paper)]/60 px-3 py-2 text-xs">
            <span className="font-semibold text-amber-400 mr-1.5">比对结论:</span>
            <span className="text-[var(--ink)] leading-relaxed">{matchReason}</span>
          </div>
        </MagicCard>

        {/* 统计漏斗指标 */}
        <div className="grid grid-cols-4 gap-2 pt-4">
          <MetricCell label="已扫描" value={stats.scanned} color="text-[var(--ink)]" />
          <MetricCell label="成功投递" value={stats.sent} color="text-emerald-400" />
          <MetricCell label="规则跳过" value={stats.skipped} color="text-stone-400" />
          <MetricCell label="投递转化率" value={rate} color="text-amber-400" />
        </div>
      </MagicCard>

      {/* 安全合规徽章（SaaSFrame Trust Badge） */}
      <MagicCard
        glowColor="16, 185, 129"
        className="flex items-center justify-between rounded-xl border border-stone-800/80 bg-stone-900/30 px-4 py-3 text-xs text-stone-400"
        enableTilt={false}
        particleCount={4}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
          <span>拟人化风控保护：随机拟真浏览间隔，本地私密会话隔离</span>
        </div>
        {onOpenDrawer && (
          <button
            type="button"
            onClick={onOpenDrawer}
            className="text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            调整风控
          </button>
        )}
      </MagicCard>
    </div>
  );
}

function PipelineStep({
  icon,
  title,
  desc,
  status,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  status: "idle" | "active" | "done";
}) {
  return (
    <div
      className={`rounded-xl border p-2.5 text-center transition-all ${
        status === "active"
          ? "border-amber-500/50 bg-amber-500/10 shadow-sm shadow-amber-500/10"
          : status === "done"
            ? "border-emerald-500/30 bg-emerald-950/20"
            : "border-[var(--grid)] bg-[var(--panel-2)]/50 opacity-60"
      }`}
    >
      <div
        className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
          status === "active"
            ? "bg-amber-500 text-stone-950"
            : status === "done"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
              : "bg-stone-800 text-stone-400"
        }`}
      >
        {status === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : icon}
      </div>
      <div className="mt-1.5 text-xs font-semibold text-[var(--ink)]">{title}</div>
      <div className="text-[10px] text-[var(--muted-fg)] truncate mt-0.5">{desc}</div>
    </div>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <MagicCard
      glowColor="245, 158, 11"
      className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-2.5 text-center"
      enableTilt={true}
      particleCount={4}
      spotlightRadius={180}
    >
      <div className="text-[10px] text-[var(--muted-fg)]">{label}</div>
      <div className={`mt-0.5 text-base font-bold font-mono ${color}`}>{value}</div>
    </MagicCard>
  );
}
