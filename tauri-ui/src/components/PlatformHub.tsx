import { useCallback, useEffect, useState } from "react";
import { Globe, RefreshCw, X, FileText, CheckSquare } from "lucide-react";
import { ipc, type PlatformItem } from "../lib/ipc";
import type { Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import { MagicCard } from "./core/MagicBento";
import PlatformCard from "./platform/PlatformCard";
import DeliveryHistoryModal from "./analytics/DeliveryHistoryModal";

const PLATFORM_GLOW_MAP: Record<string, string> = {
  boss: "0, 190, 189", // BOSS 直聘 翡翠青
  liepin: "255, 112, 51", // 猎聘 活力橙
  job51: "255, 80, 0", // 前程无忧 赤焰橙
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

  // 选中的多平台投递列表（支持 BOSS + 猎聘等同时勾选）
  const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("jobhunter_enabled_platforms");
      return saved ? JSON.parse(saved) : ["boss"];
    } catch {
      return ["boss"];
    }
  });

  // 投递明细历史记录弹窗
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPlatform, setHistoryPlatform] = useState("");

  const events = useRunStore((s) => s.events);
  const sessionSentCount = events.filter(
    (e) =>
      e.kind === "letter_sent" &&
      (e.payload?.status === "sent" || e.payload?.status === "dry_run")
  ).length;

  const handleToggleEnabled = (id: string) => {
    setEnabledPlatforms((prev) => {
      const next = prev.includes(id)
        ? prev.length > 1
          ? prev.filter((p) => p !== id)
          : prev
        : [...prev, id];
      try {
        localStorage.setItem("jobhunter_enabled_platforms", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleOpenRecords = (pId: string = "") => {
    setHistoryPlatform(pId);
    setHistoryModalOpen(true);
  };

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
      } else if (res.logged_in) {
        // 扫码已成功（后端等到了登录态并已自动关闭浏览器）→ 刷新状态 + 中央大字提示
        setMessage(`「${platformId}」已登录成功，状态已刷新！`);
        useRunStore.getState().showCenterToast("检测到您已登录 · 认证成功", {
          tone: "success",
          duration: 2200,
        });
        await loadPlatforms();
      } else {
        setMessage(`已打开「${platformId}」登录页，请在浏览器扫码；完成后点「刷新状态」。`);
      }
      setTimeout(loadPlatforms, 5000);
    } catch (err) {
      setMessage(`异常: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const enabledNames = platforms
    .filter((p) => enabledPlatforms.includes(p.id))
    .map((p) => p.name);

  return (
    <>
      <MagicCard
        className={`panel mb-6 p-5 sm:p-6 lg:p-7 ${className}`}
        style={style}
        glowColor="245, 158, 11"
        enableTilt={false}
        enableStars={false}
        enableBorderGlow={true}
      >
        {/* 头部：专业 SaaS 矩阵 */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-stone-800">
          <div className="flex items-center gap-3.5">
            <div className="size-9 sm:size-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-sm shadow-sm">
              <Globe className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-100 tracking-tight flex items-center gap-2.5">
                <span>{lang === "en" ? "Job Platforms Center" : "招聘平台中心"}</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  4 大主流直聘
                </span>
                {enabledPlatforms.length > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                    <CheckSquare className="size-3 text-emerald-400" />
                    <span>已勾选 {enabledPlatforms.length} 个巡航平台 ({enabledNames.join(" + ")})</span>
                  </span>
                )}
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                {lang === "en"
                  ? "Unified delivery hub. Choose your target platforms and start automated cruising."
                  : "全平台多合一聚合中心：勾选启用的投递平台（支持同时勾选多平台），点击左侧启动即可自动投递沟通。"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenRecords("")}
              className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 px-3 py-1.5 rounded-xl font-semibold cursor-pointer transition-all shadow-sm shadow-amber-500/10"
              title="打开全平台投递历史明细抽屉"
            >
              <FileText className="size-3.5" />
              <span>查看投递明细记录</span>
            </button>
            <button
              type="button"
              onClick={loadPlatforms}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors px-3 py-1.5 rounded-xl border border-stone-850 hover:bg-stone-850 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">刷新状态</span>
            </button>
          </div>
        </div>

        {/* 状态与通知条 */}
        {message && (
          <div className="mb-4 flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="text-stone-400 hover:text-stone-200 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* 平台卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {platforms.map((p) => {
            const isSelected = selectedPlatform === p.id;
            const isEnabled = enabledPlatforms.includes(p.id);
            const cardGlow = PLATFORM_GLOW_MAP[p.id] || "245, 158, 11";
            return (
              <PlatformCard
                key={p.id}
                platform={p}
                isSelected={isSelected}
                isEnabled={isEnabled}
                onSelectPlatform={onSelectPlatform}
                onToggleEnabled={handleToggleEnabled}
                onViewRecords={handleOpenRecords}
                sessionSentCount={sessionSentCount}
                cardGlow={cardGlow}
                lang={lang}
                busy={busy}
                onLogin={handleLogin}
              />
            );
          })}
        </div>
      </MagicCard>

      {/* 投递历史明细记录弹窗 */}
      <DeliveryHistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          loadPlatforms();
        }}
        initialPlatform={historyPlatform}
      />
    </>
  );
}
