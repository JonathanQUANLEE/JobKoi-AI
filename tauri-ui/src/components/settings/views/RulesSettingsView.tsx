import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";

interface RulesSettingsViewProps {
  localRule: string;
  setLocalRule: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function RulesSettingsView({
  localRule,
  setLocalRule,
  onSave,
  onClose,
}: RulesSettingsViewProps) {
  return (
    <div className="py-4 space-y-5">
      <div className="mist-setting-row">
        <label className="text-xs font-semibold text-stone-200">
          排除词 / 避坑标签 (包含这些词的岗位直接跳过)
        </label>
        <p className="text-[11px] text-stone-400 leading-relaxed">
          用逗号或空格隔开。例如：<code className="text-amber-300 font-mono">外包 电话销售 培训 单休 大小周 夜班</code>
        </p>
        <textarea
          rows={3}
          value={localRule}
          onChange={(e) => setLocalRule(e.target.value)}
          placeholder="例如：外包, 催收, 兼职, 电话销售, 招转培, 单休, 大小周"
          className="mist-input font-mono text-xs leading-relaxed"
        />
      </div>

      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
        <HugeiconsIcon icon={InformationCircleIcon} size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong>贴心提示</strong>：目标岗位、期望城市与薪资范围已经在【求职画像】中由 AI 顾问为你自动打理，这里只需填写你“最不想去的公司类型或讨厌的关键词”即可，无需重复配置复杂专业条件。
        </div>
      </div>

      <div className="pt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-white transition-all cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          保存过滤偏好
        </button>
      </div>
    </div>
  );
}
