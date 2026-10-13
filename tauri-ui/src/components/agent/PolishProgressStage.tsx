import { X, TrendingUp, CheckCircle } from "lucide-react";
import LatticeLoader from "../core/LatticeLoader";

interface PolishProgressStageProps {
  diagnoseStatus: "working" | "done" | "error";
  progressPercent: number;
  elapsedSeconds: number;
  estimatedSeconds: number;
  currentStageIndex: number;
  onCancel: () => void;
}

export default function PolishProgressStage({
  diagnoseStatus,
  progressPercent,
  elapsedSeconds,
  estimatedSeconds,
  currentStageIndex,
  onCancel,
}: PolishProgressStageProps) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-stone-900/90 p-5 space-y-4 shadow-xl animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <LatticeLoader
            status={diagnoseStatus}
            label="AI 简历精修正在深度诊断..."
            doneLabel="精修完成"
            errorLabel="诊断异常"
            pattern="orbit"
            grid={3}
            shape="round"
            doneColor="#22c55e"
            errorColor="#ef4444"
            cellSize={6}
            gap={2}
            fontSize={13}
            step={90}
            glow={true}
            glowColor="rgba(245, 158, 11, 0.4)"
            showTimer={true}
          />
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-all cursor-pointer"
        >
          <X className="size-3" />
          <span>取消本次诊断</span>
        </button>
      </div>

      {/* 核心动态进度条与估时感知 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-stone-200 flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-amber-400" />
            <span>正在执行诊断流水线 ({progressPercent}%)</span>
          </span>
          <span className="text-[11px] font-mono text-amber-400">
            已耗时 {elapsedSeconds}s ·{" "}
            {elapsedSeconds > 15
              ? "云端免费模型正在排队生成中，即将就绪..."
              : `预计还需 ~${estimatedSeconds}s`}
          </span>
        </div>

        {/* 进度条槽 */}
        <div className="w-full h-2 rounded-full bg-stone-950 border border-stone-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 4 阶段流水线步进器 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div
          className={`p-2 rounded-xl border flex flex-col justify-between ${
            currentStageIndex >= 0
              ? "bg-stone-950 border-emerald-500/30 text-emerald-300"
              : "bg-stone-950/40 border-stone-800 text-stone-500"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">1. 简历扫描</span>
            {currentStageIndex > 0 ? (
              <CheckCircle className="size-3 text-emerald-400" />
            ) : (
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>
          <span className="text-[10px] text-stone-400">本地算法提取指标</span>
        </div>

        <div
          className={`p-2 rounded-xl border flex flex-col justify-between ${
            currentStageIndex >= 1
              ? "bg-stone-950 border-emerald-500/30 text-emerald-300"
              : "bg-stone-950/40 border-stone-800 text-stone-500"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">2. 优化重点注入</span>
            {currentStageIndex > 1 ? (
              <CheckCircle className="size-3 text-emerald-400" />
            ) : currentStageIndex === 1 ? (
              <span className="size-2 rounded-full bg-blue-400 animate-ping" />
            ) : null}
          </div>
          <span className="text-[10px] text-stone-400">按勾选的优化重点融合</span>
        </div>

        <div
          className={`p-2 rounded-xl border flex flex-col justify-between ${
            currentStageIndex >= 2
              ? "bg-stone-950 border-amber-500/40 text-amber-300"
              : "bg-stone-950/40 border-stone-800 text-stone-500"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">3. 经历重构</span>
            {currentStageIndex > 2 ? (
              <CheckCircle className="size-3 text-emerald-400" />
            ) : currentStageIndex === 2 ? (
              <span className="size-2 rounded-full bg-amber-400 animate-ping" />
            ) : null}
          </div>
          <span className="text-[10px] text-stone-400">大模型生成对比</span>
        </div>

        <div
          className={`p-2 rounded-xl border flex flex-col justify-between ${
            currentStageIndex >= 3
              ? "bg-stone-950 border-purple-500/40 text-purple-300"
              : "bg-stone-950/40 border-stone-800 text-stone-500"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">4. 卡片组装</span>
            {progressPercent === 100 ? (
              <CheckCircle className="size-3 text-purple-400" />
            ) : currentStageIndex === 3 ? (
              <span className="size-2 rounded-full bg-purple-400 animate-ping" />
            ) : null}
          </div>
          <span className="text-[10px] text-stone-400">Bullet Points 排版</span>
        </div>
      </div>
    </div>
  );
}
