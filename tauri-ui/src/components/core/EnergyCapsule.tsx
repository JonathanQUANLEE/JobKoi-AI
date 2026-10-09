import { useEffect, useState, useMemo, type FC } from "react";
import { Zap, Sparkles, CheckCircle2 } from "lucide-react";
import "./EnergyCapsule.css";

export interface EnergyCapsuleProps {
  /** 进度百分比 0 ~ 100 */
  progress: number;
  /** 状态文本描述 */
  statusText?: string;
  /** 是否处于充能加载中 */
  isCharging?: boolean;
  /** 自定义外层样式类 */
  className?: string;
}

export const EnergyCapsule: FC<EnergyCapsuleProps> = ({
  progress,
  statusText,
  isCharging = true,
  className = "",
}) => {
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const isMaxed = clampedProgress >= 100;

  // 胶囊内部游动的荧光粒子数据
  const particles = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${10 + i * 11}%`,
      top: `${20 + (i % 3) * 25}%`,
      delay: `${(i * 0.2).toFixed(2)}s`,
    }));
  }, []);

  return (
    <div className={`energy-capsule-container ${className}`}>
      {/* 顶部指示栏：额度与能量充盈状态 */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
          <Zap className={`size-3.5 ${isCharging ? "animate-bounce text-[#00ff88]" : "text-emerald-500"}`} />
          <span>
            {isMaxed ? (
              <span className="flex items-center gap-1 text-[#00ff88]">
                <Sparkles className="size-3" />
                <span>能量充盈拉满</span>
              </span>
            ) : (
              <span>资产能量胶囊充盈中</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <span className={`font-bold text-sm ${isMaxed ? "text-[#00ff88] scale-105" : "text-emerald-300"} transition-all`}>
            {clampedProgress}%
          </span>
          {isMaxed && (
            <CheckCircle2 className="size-3.5 text-[#00ff88] animate-in zoom-in-50 duration-200" />
          )}
        </div>
      </div>

      {/* 核心荧光绿能量胶囊主体 */}
      <div className="energy-capsule-track">
        <div
          className={`energy-capsule-fill ${isMaxed ? "energy-capsule-max" : ""}`}
          style={{ width: `${clampedProgress}%` }}
        >
          {/* 内部浮动光粒子 */}
          {particles.map((p) => (
            <span
              key={p.id}
              className="energy-particle"
              style={{
                left: p.left,
                top: p.top,
                animationDelay: p.delay,
              }}
            />
          ))}
        </div>
      </div>

      {/* 底部详细状态说明 */}
      {statusText && (
        <div className="flex items-center justify-between text-[11px] text-emerald-300/80 px-1 pt-0.5">
          <span className="truncate">{statusText}</span>
          <span className="text-[10px] text-emerald-500 font-mono shrink-0 ml-2">
            NEON FLUID BUFFER
          </span>
        </div>
      )}
    </div>
  );
};

export default EnergyCapsule;
