import { useEffect, useState } from "react";
import { useRunStore, useT } from "../../../store";
import { checkForUpdate } from "../../../lib/updater";

interface AboutTabProps {
  isMonochrome: boolean;
  /** 点击"再次引导"后顺手关掉设置弹窗，让欢迎卡立刻出现。 */
  onClose?: () => void;
}

export default function AboutTab({ isMonochrome, onClose }: AboutTabProps) {
  const t = useT();
  const requestTourReset = useRunStore((s) => s.requestTourReset);
  const showCenterToast = useRunStore((s) => s.showCenterToast);
  const openUpdateDialog = useRunStore((s) => s.openUpdateDialog);
  const [version, setVersion] = useState<string>("…");
  const [checking, setChecking] = useState(false);

  // 真实版本号：编译期烧进 binary（tauri.conf.json version，CI 由 tag 注入）
  useEffect(() => {
    let cancelled = false;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        if (!cancelled) setVersion("—");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const info = await checkForUpdate();
      if (info) {
        openUpdateDialog(info);
      } else {
        showCenterToast(t("update.upToDate"));
      }
    } catch (err) {
      showCenterToast(
        t("update.checkFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] flex items-center gap-3.5">
        <img src="/favicon.png" alt="Logo" className="size-10 rounded-xl border border-pink-400/30" />
        <div>
          <div className="font-bold text-sm text-stone-100">JobKoi-AI · 全智能求职锦鲤助手</div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            {t("about.versionLine", { version })}
          </div>
        </div>
      </div>

      <div className="space-y-2 text-stone-400 leading-relaxed text-[11px]">
        <p>JobKoi-AI 专为求职者打造，深度融合大模型顾问诊断、多招聘平台直连与智能投递风控。</p>
        <p>支持平台：BOSS 直聘、猎聘、前程无忧、智联招聘。</p>
      </div>

      <div className="pt-3 border-t border-[var(--grid)] flex items-center justify-between text-[11px] text-stone-500">
        <span>© 2026 JobKoi-AI (JonathanQUANLEE). 保留所有权利。</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              // 再次引导（2026-10-14 用户需求）：重置当前账号的引导状态，
              // 关掉设置弹窗后欢迎卡立即出现，可完整重走一遍三步流程。
              requestTourReset();
              onClose?.();
            }}
            className={`hover:underline cursor-pointer ${isMonochrome ? "text-zinc-300 hover:text-white" : "text-amber-400"}`}
          >
            再次走一遍新手引导
          </button>
          <button
            type="button"
            onClick={() => void handleCheckUpdate()}
            disabled={checking}
            className={`hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isMonochrome ? "text-zinc-300 hover:text-white" : "text-amber-400"}`}
          >
            {checking ? t("update.checking") : t("update.checkNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
