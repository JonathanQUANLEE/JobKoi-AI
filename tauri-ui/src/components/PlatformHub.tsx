import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Circle,
  X,
  ShieldCheck,
  Send,
} from "lucide-react";
import { ipc, type PlatformItem } from "../lib/ipc";
import type { Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import { MagicCard } from "./core/MagicBento";

const PLATFORM_GLOW_MAP: Record<string, string> = {
  boss: "0, 190, 189",     // BOSS 直聘 翡翠青
  liepin: "255, 112, 51",  // 猎聘 活力橙
  job51: "255, 80, 0",     // 前程无忧 赤焰橙
  zhaopin: "25, 118, 210", // 智联招聘 商务蓝
};

interface PlatformHubProps {
  selectedPlatform: string;
  onSelectPlatform: (platformId: string) => void;
  lang?: Lang;
  className?: string;
  style?: React.CSSProperties;
}

export default function PlatformHub({
  selectedPlatform,
  onSelectPlatform,
  lang = "zh",
  className = "",
  style,
}: PlatformHubProps) {
  const [platforms, setPlatforms] = useState<PlatformItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const events = useRunStore((s) => s.events);
  const sessionSentCount = events.filter(
    (e) => e.kind === "letter_sent" && (e.payload?.status === "sent" || e.payload?.status === "dry_run")
  ).length;

  const loadPlatforms = useCallback(async () => {
    try {
      const res = await ipc.listPlatforms();
      if (res && res.platforms) {
        setPlatforms(res.platforms);
      }
    } catch {
      setPlatforms([
        {
          id: "boss",
          name: "BOSS 直聘",
          tagline: "互联网与高薪岗主力 · 每日限额 150",
          daily_limit: 150,
          theme_color: "#00bebd",
          is_supported: true,
          is_logged_in: true,
          status_text: "已就绪 (免密免登)",
        },
        {
          id: "liepin",
          name: "猎聘 Liepin",
          tagline: "中高端名企与猎头 · 每日限额 100",
          daily_limit: 100,
          theme_color: "#ff7033",
          is_supported: true,
          is_logged_in: true,
          status_text: "已就绪 (免密免登)",
        },
        {
          id: "job51",
          name: "前程无忧 51job",
          tagline: "传统名企与制造业 · 每日限额 40",
          daily_limit: 40,
          theme_color: "#ff5000",
          is_supported: true,
          is_logged_in: true,
          status_text: "已就绪 (免密免登)",
        },
        {
          id: "zhaopin",
          name: "智联招聘 (筹备中)",
          tagline: "国企央企与校招 · 即将开放",
          daily_limit: 50,
          theme_color: "#1976d2",
          is_supported: false,
          is_logged_in: false,
          status_text: "筹备中",
        },
      ]);
    }
  }, []);

  useEffect(() => {
    loadPlatforms();
  }, [loadPlatforms]);

  async function handleLogin(e: React.MouseEvent, platformId: string) {
    e.stopPropagation();
    setBusy(true);
    setMessage(`正在拉起「${platformId}」浏览器，请稍候扫码...`);
    try {
      const res = await ipc.openPlatformLogin(platformId);
      if (res.status === "error") {
        setMessage(`提示: ${res.message || "拉起失败"}`);
      } else {
        setMessage(`已成功打开「${platformId}」浏览器窗口，请在弹窗扫码登录！`);
      }
      setTimeout(loadPlatforms, 5000);
    } catch (err) {
      setMessage(`异常: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <MagicCard
      className={`panel mb-6 p-5 sm:p-6 lg:p-7 ${className}`}
      style={style}
      glowColor="245, 158, 11"
      enableTilt={false}
      enableStars={false}
      enableBorderGlow={true}
    >
      {/* 头部：专业 SaaS 矩阵 */}
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-stone-800">
        <div className="flex items-center gap-3.5">
          <div className="size-9 sm:size-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-sm shadow-sm">
            <Globe className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-stone-100 tracking-tight flex items-center gap-2.5">
              <span>{lang === "en" ? "Job Platforms Center" : "招聘平台中心"}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">
                {lang === "en" ? `${platforms.length} Platforms Grid` : `${platforms.length} 个平台矩阵`}
              </span>
            </h2>
            <p className="text-xs sm:text-[13px] text-stone-400 mt-0.5">
              {lang === "en" ? "Click to switch active platform · Scan QR code to sync session" : "点击卡片切换当前工作平台 · 手机一键扫码绑定登录态"}
            </p>
          </div>
        </div>

        <button
          onClick={loadPlatforms}
          className="flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2 rounded-full border border-stone-800 bg-stone-900/60 hover:border-amber-500/40 text-xs sm:text-[13px] text-stone-400 hover:text-stone-200 transition-all select-none cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{lang === "en" ? "Refresh Session" : "刷新凭证状态"}</span>
        </button>
      </div>

      {/* 便当盒卡片网格（自适应宽屏栅格，卡片加大加宽，清晰呈现每日限额） */}
      <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4">
        {platforms.map((p) => {
          const isSelected = selectedPlatform === p.id;
          const cardGlow = PLATFORM_GLOW_MAP[p.id] || "245, 158, 11";
          const baseTodaySent = p.today_sent ?? 0;
          const liveTodaySent = isSelected ? Math.max(baseTodaySent, baseTodaySent + sessionSentCount) : baseTodaySent;
          const limit = p.daily_limit || 150;
          const percentage = Math.min(100, Math.round((liveTodaySent / limit) * 100));
          const remaining = Math.max(0, limit - liveTodaySent);
          return (
            <MagicCard
              key={p.id}
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

                {/* 实时投递统计与进度条（断电/重启自动恢复，实时正向反馈） */}
                <div className="space-y-2 mb-3.5 bg-stone-950/80 rounded-xl p-3 border border-stone-800/90 shadow-inner">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-300 flex items-center gap-1.5 font-medium">
                      <Send className="size-3.5 text-amber-400" />
                      <span>{lang === "en" ? "Today Delivered:" : "今日已投递:"}</span>
                    </span>
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {liveTodaySent} <span className="text-stone-500 text-[11px] font-normal">/ {limit} 份</span>
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
                    <span>{p.is_supported ? `已达 ${percentage}% · 剩 ${remaining} 份` : "筹备中"}</span>
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
                    onClick={(e) => handleLogin(e, p.id)}
                    disabled={busy}
                    className="flex items-center gap-1.5 text-xs sm:text-[13px] px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-stone-200 font-semibold transition-all shadow-sm active:scale-95"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{p.is_logged_in ? "打开窗口" : "手机扫码"}</span>
                  </button>
                )}
              </div>
            </MagicCard>
          );
        })}
      </div>

      {message && (
        <div className="mt-3.5 flex items-center justify-between rounded-xl bg-amber-950/40 border border-amber-500/30 px-4 py-2.5 text-xs text-amber-200">
          <span>{message}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-stone-400 hover:text-white ml-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </MagicCard>
  );
}
