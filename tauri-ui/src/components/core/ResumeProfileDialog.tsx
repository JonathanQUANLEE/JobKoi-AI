import { Sparkles, X } from "lucide-react";
import { summarizeAgentProfile } from "../../lib/agentPreview";

interface ResumeProfileDialogProps {
  /** parse_resume_to_profile 返回的 profile（snake_case，与 BuiltProfileData 同构） */
  profile: Record<string, unknown>;
  /** LLM 的提炼依据说明（reply） */
  reasoning?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 简历 → 求职画像一键同步确认弹窗（2026-10-17 P2）。
 *
 * PRD 原话："弹出提示询问用户：已基于您的简历自动提炼求职意向，是否
 * 一键同步至求职画像？"——确认后前端 hydrateFromProfile 回填表单，
 * 用户不用再手敲学历/岗位/技能关键词。
 */
export default function ResumeProfileDialog({
  profile,
  reasoning,
  onConfirm,
  onClose,
}: ResumeProfileDialogProps) {
  const preview = summarizeAgentProfile(profile);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center select-none animate-in fade-in duration-200">
      {/* 全屏背景模糊遮罩 */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[6px]" onClick={onClose} />

      {/* 中央确认卡片 */}
      <div className="relative w-[400px] max-w-[92vw] rounded-3xl border border-stone-700/70 bg-stone-950/95 px-7 py-7 shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3.5 top-3.5 p-1.5 rounded-xl text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          title="暂不同步"
        >
          <X className="size-4" />
        </button>

        {/* 图标区 */}
        <div className="flex items-center justify-center">
          <div className="grid size-20 place-items-center rounded-full border-2 border-amber-400/70 bg-amber-500/5">
            <Sparkles className="size-9 text-amber-300" />
          </div>
        </div>

        {/* 文案区 */}
        <div className="mt-5 text-center space-y-1.5">
          <h3 className="text-base font-bold text-stone-100">已基于你的简历提炼出求职意向</h3>
          <p className="text-xs text-stone-400 leading-relaxed">
            是否一键同步至求职画像？同步后可在「求职画像」页继续微调。
          </p>
        </div>

        {/* 提炼结果预览（关键字段一眼可确认） */}
        {preview && (
          <div className="mt-4 space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
            <PreviewRow label="目标岗位" value={preview.query} />
            <PreviewRow label="意向城市" value={preview.cities || "未识别（默认全国轮换）"} />
            <PreviewRow label="核心技能" value={preview.anyKeywords || "-"} />
            <PreviewRow label="排除方向" value={preview.excludeKeywords || "-"} />
            <PreviewRow
              label="投递模式"
              value={preview.mode === "auto" ? "自动投递" : preview.mode === "review" ? "人工审核" : "仅扫描（安全默认）"}
            />
          </div>
        )}

        {/* LLM 提炼依据（让用户知道画像从哪来，可信任） */}
        {reasoning && (
          <p className="mt-3 text-[11px] text-stone-500 leading-relaxed px-1">
            提炼依据：{reasoning}
          </p>
        )}

        {/* 按钮区 */}
        <div className="mt-6 flex items-center gap-3">
          <button type="button" className="btn-primary flex-1 cursor-pointer" onClick={onConfirm}>
            一键同步至求职画像
          </button>
          <button type="button" className="btn-ghost cursor-pointer" onClick={onClose}>
            暂不
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-stone-500 shrink-0 w-16">{label}</span>
      <span className="text-stone-200 min-w-0 break-words flex-1">{value || "-"}</span>
    </div>
  );
}
