import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, RefreshCw, X, FileText, CheckSquare, AlertTriangle } from "lucide-react";
import { ipc, type PlatformItem } from "../lib/ipc";
import type { Lang } from "../lib/i18n";
import { useRunStore } from "../store";
import { MagicCard } from "./core/MagicBento";
import PlatformCard from "./platform/PlatformCard";
import DeliveryHistoryModal from "./analytics/DeliveryHistoryModal";

/** IPC 兜底超时：后端正常毫秒级返回；一旦挂死，前端 12s 后显式报错（不再静默空白）。 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s 无响应）`)), ms),
    ),
  ]);
}

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
  // 平台列表加载状态：不再静默空白——失败/超时要在界面上明说，并给重试按钮
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const [platformsError, setPlatformsError] = useState<string | null>(null);

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
    setPlatformsLoading(true);
    setPlatformsError(null);
    try {
      // 12s 兜底超时：后端正常毫秒级；挂死时把错误浮出水面而不是无限空白
      const res = await withTimeout(ipc.listPlatforms(), 12_000, "加载平台列表");
      if (res && res.platforms) {
        setPlatforms(res.platforms);
      } else {
        setPlatformsError("后端返回了空的平台列表");
      }
    } catch (err) {
      // 不再塞硬编码假数据（会显示假的"已就绪"误导用户）——如实展示错误
      const detail = String(err);
      console.error("[PlatformHub] 加载平台列表失败:", detail);
      setPlatformsError(detail);
    } finally {
      setPlatformsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlatforms();
  }, [loadPlatforms]);

  // 登录确认轮询器：open_platform_login 现在秒回（不等扫码），
  // 这里每 4s 轻量探测一次登录态；成功即自动关浏览器 + 中央大字 + 刷新卡片。
  const loginPollRef = useRef<number | null>(null);
  const stopLoginPoll = useCallback(() => {
    if (loginPollRef.current != null) {
      window.clearInterval(loginPollRef.current);
      loginPollRef.current = null;
    }
  }, []);
  useEffect(() => stopLoginPoll, [stopLoginPoll]);

  const startLoginPoll = useCallback(
    (platformId: string) => {
      stopLoginPoll();
      let attempts = 0;
      loginPollRef.current = window.setInterval(async () => {
        attempts += 1;
        if (attempts > 120) {
          stopLoginPoll(); // 4s × 120 = 8 分钟上限
          return;
        }
        try {
          const st = await withTimeout(
            ipc.checkLoginStatus(platformId),
            10_000,
            "登录状态探测",
          );
          if (st && st.logged_in) {
            stopLoginPoll();
            // 登录成功：cookie 已写入持久化 profile，自动关掉登录浏览器
            try {
              await ipc.shutdownBrowser();
            } catch {
              /* 关闭失败不阻塞提示 */
            }
            // FaceID 式反馈：圆圈 → 绿色对勾 + 叮一声 → 1.5s 后自动淡出
            useRunStore.getState().updateLoginOverlay({ status: "success" });
            window.setTimeout(() => {
              useRunStore.getState().hideLoginOverlay();
              useRunStore.getState().showCenterToast("检测到您已登录 · 认证成功", {
                tone: "success",
                duration: 2200,
              });
            }, 1500);
            await loadPlatforms();
          }
        } catch {
          /* 单次探测失败/超时：继续下一轮，不打扰用户 */
        }
      }, 4000);
    },
    [stopLoginPoll, loadPlatforms],
  );

  async function handleLogin(e: React.MouseEvent, platformId: string) {
    e.stopPropagation();
    setBusy(true);
    setMessage(`正在拉起「${platformId}」登录页，请稍候...`);
    try {
      const res = await withTimeout(
        ipc.openPlatformLogin(platformId),
        30_000,
        "打开登录页",
      );
      if (res.status === "error") {
        setMessage(`提示: ${res.message || "拉起失败"}`);
        return;
      }
      if (res.logged_in) {
        // 打开时就探测到已登录（如 cookie/session 有效，页面自动跳过登录页）
        // → 自动关掉登录浏览器（优雅退出保 cookie 落盘）→ 刷新卡片状态
        setBusy(true);
        try {
          await withTimeout(ipc.shutdownBrowser(), 10_000, "关闭登录浏览器");
        } catch {
          /* 关闭失败不阻塞提示 */
        }
        useRunStore.getState().showCenterToast("检测到您已登录 · 认证成功", {
          tone: "success",
          duration: 2200,
        });
        setMessage(`「${platformId}」已登录成功，状态已刷新！`);
        await loadPlatforms();
        return;
      }
      // 打开成功、等扫码 → FaceID 式全屏引导浮层（背景模糊+圆圈扫描动画）
      useRunStore.getState().showLoginOverlay(platformId);
      setMessage(`已打开「${platformId}」登录页，请在浏览器扫码；登录成功会自动识别。`);
      startLoginPoll(platformId);
    } catch (err) {
      // 把技术报错翻译成人话：连接类错误多半是浏览器被关/旧进程残留，重试即可
      const raw = String(err);
      let friendly: string;
      if (/ConnectionRefused|拒绝网络连接|Failed to connect|10061|1225/i.test(raw)) {
        friendly =
          "浏览器连接已断开（可能刚被关闭或旧进程残留）。请再点一次「换号/刷新」，系统会关掉旧会话并弹出一个全新的登录窗口。";
      } else if (/超时/.test(raw)) {
        friendly = "打开登录页超时，浏览器启动较慢或被占用。请再点一次「换号/刷新」重试。";
      } else {
        friendly = `打开登录页失败，请重试一次换号/刷新。原始错误：${raw}`;
      }
      setMessage(friendly);
      // 若 FaceID 浮层还开着，把失败状态同步进去（圆圈变红叉+原因）
      useRunStore.getState().updateLoginOverlay({ status: "error", message: friendly });
      window.setTimeout(() => useRunStore.getState().hideLoginOverlay(), 3200);
      useRunStore.getState().notify({
        type: "error",
        text: friendly,
        source: "换号登录",
      });
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

        {/* 平台卡片网格（空态必须有可见反馈，绝不静默空白） */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {platforms.length === 0 && platformsLoading && (
            <div className="col-span-full flex items-center justify-center py-14 text-sm text-stone-400 gap-2">
              <RefreshCw className="size-4 animate-spin text-amber-400" />
              <span>正在加载平台状态...</span>
            </div>
          )}
          {platforms.length === 0 && !platformsLoading && (
            <div className="col-span-full flex flex-col items-center justify-center gap-2.5 py-12 px-4 rounded-2xl border border-amber-500/25 bg-amber-500/5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle className="size-4" />
                <span>{platformsError ? "平台状态加载失败" : "暂无平台数据"}</span>
              </div>
              {platformsError && (
                <p className="text-xs text-stone-400 break-all max-w-xl text-center">
                  {platformsError}
                </p>
              )}
              <button
                type="button"
                onClick={() => loadPlatforms()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 cursor-pointer transition-all"
              >
                <RefreshCw className="size-3.5" />
                <span>重试加载</span>
              </button>
            </div>
          )}
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
