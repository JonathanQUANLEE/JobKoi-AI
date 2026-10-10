import React from "react";
import { CheckCircle2, Circle, ExternalLink, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { PlatformItem } from "../../lib/ipc";
import type { Lang } from "../../lib/i18n";
import { MagicCard } from "../core/MagicBento";

interface PlatformCardProps {
  platform: PlatformItem;
  isSelected: boolean;
  onSelectPlatform: (id: string) => void;
  sessionSentCount: number;
  cardGlow: string;
  lang?: Lang;
  busy: boolean;
  onLogin: (e: React.MouseEvent, id: string) => void;
}

export default function PlatformCard({
  platform: p,
  isSelected,
  onSelectPlatform,
  sessionSentCount,
  cardGlow,
  lang = "zh",
  busy,
  onLogin,
}: PlatformCardProps) {
  const limit = p.daily_limit || 100;
  const liveTodaySent = (p.today_sent ?? 0) + (p.id === "boss" ? sessionSentCount : 0);
  const percentage = Math.min(100, Math.round((liveTodaySent / limit) * 100));
  const remaining = Math.max(0, limit - liveTodaySent);

  return (
    <MagicCard
      data-platform-card="true"
      onClick={() => p.is_supported && onSelectPlatform(p.id)}
      glowColor={cardGlow}
      enableTilt={p.is_supported}
      enableStars={p.is_supported}
      clickEffect={p.is_supported}
      particleCount={8}
      className={`group relative flex flex-col justify-between rounded-2xl border p-5 sm:p-6 select-none min-h-[230px] sm:min-h-[250px] transition-all ${
        isSelected
          ? "border-amber-500/70 bg-gradient-to-b from-stone-900 to-amber-950/20 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30"
          : p.is_supported
          ? "border-stone-800/90 bg-stone-900/50 hover:border-stone-700 hover:bg-stone-850 cursor-pointer"
          : "border-stone-850/60 bg-stone-950/30 opacity-45 cursor-not-allowed"
      }`}
    >
      <div>
        {/* 卡片顶栏：图标徽标 + 状态 */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-3">
            <div
              className="size-9 sm:size-10 rounded-xl flex items-center justify-center font-bold text-sm text-stone-950 shadow-md"
              style={{ backgroundColor: p.theme_color }}
            >
              {p.name.slice(0, 1)}
            </div>
            <span className="font-bold text-base sm:text-lg text-stone-100 group-hover:text-white tracking-tight">
              {p.name}
            </span>
          </div>

          {p.is_supported ? (
            <span
              className={`text-xs px-3 py-1 rounded-full font-semibold ${
                p.is_logged_in
                  ? "bg-emerald-950/70 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-950/70 text-amber-300 border border-amber-500/30"
              }`}
            >
              {p.is_logged_in ? "已就绪" : "待扫码"}
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-stone-850 text-stone-400 border border-stone-800">
              即将接入
            </span>
          )}
        </div>

        {/* 描述信息 */}
        <p className="text-xs sm:text-[13px] text-stone-300 leading-relaxed mb-3.5 line-clamp-2 min-h-[2.5rem]">
          {p.tagline}
        </p>

        {/* 实时投递统计与进度条 */}
        <div className="space-y-2 mb-3.5 bg-stone-950/80 rounded-xl p-3 border border-stone-800/90 shadow-inner">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-300 flex items-center gap-1.5 font-medium">
              <Send className="size-3.5 text-amber-400" />
              <span>{lang === "en" ? "Today Delivered:" : "今日已投递:"}</span>
            </span>
            <span className="font-mono text-sm font-bold text-amber-300">
              {liveTodaySent}{" "}
              <span className="text-stone-500 text-[11px] font-normal">/ {limit} 份</span>
            </span>
          </div>

          {/* 发光彩色进度条 */}
          <div className="h-1.5 w-full rounded-full bg-stone-850 overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${percentage}%`,
                backgroundColor: p.theme_color || "#00bebd",
                boxShadow: `0 0 8px ${p.theme_color || "#00bebd"}`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-stone-400 pt-0.5">
            <span>
              {p.is_supported ? `已达 ${percentage}% · 剩 ${remaining} 份` : "筹备中"}
            </span>
            <span className="text-emerald-400 font-medium">● 异常断电本地留存</span>
          </div>
        </div>

        {/* 安全与累计标签栏 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[11px] px-2.5 py-1 rounded-xl bg-stone-950/60 text-stone-400 border border-stone-800/80 flex items-center gap-1 font-medium">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span>{lang === "en" ? "Safe & Direct" : "免密安全直连"}</span>
          </span>
          {p.total_sent != null && p.total_sent > 0 && (
            <span className="text-[11px] px-2.5 py-1 rounded-xl bg-stone-950/40 text-stone-400 border border-stone-800/60 font-mono">
              累计投递 {p.total_sent} 份
            </span>
          )}
        </div>
      </div>

      {/* 卡片底栏：操作按钮 */}
      <div className="pt-3.5 border-t border-stone-800/80 flex items-center justify-between">
        <span className="text-xs sm:text-[13px] text-stone-400 flex items-center gap-1.5">
          {isSelected ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-400 font-semibold">当前主平台</span>
            </>
          ) : (
            <>
              <Circle className="h-3.5 w-3.5 text-stone-600" />
              <span>点击选用</span>
            </>
          )}
        </span>

        {p.is_supported && (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => onLogin(e, p.id)}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-400 hover:underline transition-colors px-2.5 py-1 rounded-lg hover:bg-stone-800 cursor-pointer disabled:opacity-40"
            title="重新打开浏览器扫码刷新登录态"
          >
            {p.is_logged_in ? (
              <>
                <RefreshCw className="h-3 w-3" />
                <span>换号/刷新</span>
              </>
            ) : (
              <>
                <ExternalLink className="h-3 w-3 text-amber-400" />
                <span className="text-amber-400 font-semibold">扫码登录</span>
              </>
            )}
          </button>
        )}
      </div>
    </MagicCard>
  );
}
