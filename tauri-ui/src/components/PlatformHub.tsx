import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react";
import { ipc, type PlatformItem } from "../lib/ipc";
import type { Lang } from "../lib/i18n";
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
      className={`panel mb-6 ${className}`}
      style={style}
      glowColor="245, 158, 11"
      enableTilt={false}
      enableStars={false}
      enableBorderGlow={true}
    >
      {/* 头部：专业 SaaS 矩阵 */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-sm shadow-sm">
            <Globe className="h-4.5 w-4.5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-stone-100 tracking-tight flex items-center gap-2">
              <span>{lang === "en" ? "Job Platforms Center" : "招聘平台中心"}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-normal">
                {lang === "en" ? "4 Platforms Grid" : "4 个平台矩阵"}
              </span>
            </h2>
            <p className="text-[11px] text-stone-400 mt-0.5">
              {lang === "en" ? "Click to switch active platform · Scan QR code to sync session" : "点击卡片切换当前工作平台 · 手机一键扫码绑定登录态"}
            </p>
          </div>
        </div>

        <button
          onClick={loadPlatforms}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-800 bg-stone-900/60 hover:border-amber-500/40 text-xs text-stone-400 hover:text-stone-200 transition-all select-none cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{lang === "en" ? "Refresh Session" : "刷新凭证状态"}</span>
        </button>
      </div>

      {/* 便当盒卡片网格（Bento Grid 装备专属品牌荧光粒子效果） */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {platforms.map((p) => {
          const isSelected = selectedPlatform === p.id;
          const cardGlow = PLATFORM_GLOW_MAP[p.id] || "245, 158, 11";
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
              className={`group relative flex flex-col justify-between rounded-2xl border p-4.5 select-none ${
                isSelected
                  ? "border-amber-500/70 bg-gradient-to-b from-stone-900 to-amber-950/20 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30"
                  : p.is_supported
                  ? "border-stone-800/90 bg-stone-900/50 hover:border-stone-700 hover:bg-stone-850 cursor-pointer"
                  : "border-stone-850/60 bg-stone-950/30 opacity-45 cursor-not-allowed"
              }`}
            >
              <div>
                {/* 卡片顶栏：图标徽标 + 状态 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="size-7 rounded-lg flex items-center justify-center font-bold text-xs text-stone-900 shadow-sm"
                      style={{ backgroundColor: p.theme_color }}
                    >
                      {p.name.slice(0, 1)}
                    </div>
                    <span className="font-bold text-sm text-stone-100 group-hover:text-white">
                      {p.name}
                    </span>
                  </div>

                  {p.is_supported ? (
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${
                        p.is_logged_in
                          ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-950/60 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {p.is_logged_in ? "已就绪" : "待扫码"}
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
                      即将接入
                    </span>
                  )}
                </div>

                {/* 描述信息 */}
                <p className="text-xs text-stone-400 leading-relaxed mb-3 line-clamp-2">
                  {p.tagline}
                </p>

                {/* 胶囊标签群 */}
                <div className="flex flex-wrap gap-1 mb-3.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-950/60 text-stone-400 border border-stone-800 font-mono">
                    上限: {p.daily_limit}/日
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-950/60 text-stone-400 border border-stone-800">
                    免密存储
                  </span>
                </div>
              </div>

              {/* 卡片底栏：操作按钮 */}
              <div className="pt-2.5 border-t border-stone-800/70 flex items-center justify-between">
                <span className="text-[11px] text-stone-500 flex items-center gap-1.5">
                  {isSelected ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-400 font-medium">当前主平台</span>
                    </>
                  ) : (
                    <>
                      <Circle className="h-3 w-3 text-stone-600" />
                      <span>点击选用</span>
                    </>
                  )}
                </span>

                {p.is_supported && (
                  <button
                    onClick={(e) => handleLogin(e, p.id)}
                    disabled={busy}
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-xl bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-stone-200 font-medium transition-all shadow-sm active:scale-95"
                  >
                    <ExternalLink className="h-3 w-3" />
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
