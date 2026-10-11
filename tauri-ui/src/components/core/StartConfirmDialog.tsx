import { FilePenLine, X } from "lucide-react";
import { useRunStore, useT } from "../../store";

/**
 * 启动前未保存修改确认浮层（方案 1 知情确认，2026-10-12 用户拍板）。
 *
 * 触发条件：useJobBotRuntime.startRun 检测到表单 ≠ 磁盘（hasUnsavedProfileChanges）。
 * 语义：startRun 原本就会在启动前自动保存表单——本浮层只是把这件事告知用户，
 * 消除"忘点保存、修改会丢"的担忧。行为零变化。
 * - 保存并开始 → resolve(true)，继续原有启动流程（自动保存随之发生）
 * - 取消 / 关闭浮层 → resolve(false)，留在原地继续编辑
 */
export default function StartConfirmDialog() {
  const t = useT();
  const startConfirm = useRunStore((s) => s.startConfirm);
  const resolveStartConfirm = useRunStore((s) => s.resolveStartConfirm);

  if (!startConfirm) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center select-none animate-in fade-in duration-200">
      {/* 全屏背景模糊遮罩 */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[6px]" />

      {/* 中央确认卡片 */}
      <div className="relative w-[340px] rounded-3xl border border-stone-700/70 bg-stone-950/95 px-7 py-7 shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-200">
        {/* 右上角关闭（等同取消） */}
        <button
          type="button"
          onClick={() => resolveStartConfirm(false)}
          className="absolute right-3.5 top-3.5 p-1.5 rounded-xl text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          title={t("startConfirm.cancel")}
        >
          <X className="size-4" />
        </button>

        {/* 图标区 */}
        <div className="flex items-center justify-center">
          <div className="grid size-20 place-items-center rounded-full border-2 border-amber-400/70 bg-amber-500/5">
            <FilePenLine className="size-9 text-amber-300" />
          </div>
        </div>

        {/* 文案区 */}
        <div className="mt-5 text-center space-y-1.5">
          <h3 className="text-base font-bold text-stone-100">{t("startConfirm.title")}</h3>
          <p className="text-xs text-stone-400 leading-relaxed">{t("startConfirm.body")}</p>
        </div>

        {/* 按钮区 */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            className="btn-primary flex-1 cursor-pointer"
            onClick={() => resolveStartConfirm(true)}
          >
            {t("startConfirm.saveAndStart")}
          </button>
          <button
            type="button"
            className="btn-ghost cursor-pointer"
            onClick={() => resolveStartConfirm(false)}
          >
            {t("startConfirm.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
