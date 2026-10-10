interface GreetingSettingsViewProps {
  localGreeting: string;
  setLocalGreeting: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function GreetingSettingsView({
  localGreeting,
  setLocalGreeting,
  onSave,
  onClose,
}: GreetingSettingsViewProps) {
  return (
    <div className="py-4 space-y-4">
      <div className="mist-setting-row">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200">
            招呼语内容 (支持动态变量插入)
          </label>
          <span className="text-[11px] text-stone-400 font-mono">
            可用变量: {"{name}"} 姓名 · {"{job}"} 岗位名
          </span>
        </div>
        <textarea
          rows={4}
          value={localGreeting}
          onChange={(e) => setLocalGreeting(e.target.value)}
          placeholder="您好！看到贵司正在招聘{job}岗位，我的专业与技能非常契合，这是我的简历，期待能与您进一步沟通交流！"
          className="mist-input text-xs leading-relaxed"
        />
      </div>

      {/* 快速选用推荐高回复率模板 */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-stone-400">
          精选高情商开箱模板 (点击快速填入)：
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() =>
              setLocalGreeting(
                "您好！看到贵司在招{job}岗位，我对贵司的发展非常向往。我的专业背景与核心技能高度契合，附上我的详细简历，期待与您深入沟通！"
              )
            }
            className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left text-[11px] text-stone-300 transition-all cursor-pointer"
          >
            <span className="font-bold text-emerald-400 block mb-0.5">诚恳求职模板 (应届 / 实习)</span>
            <p className="line-clamp-2 text-stone-400">突出向往与背景契合度，措辞谦逊专业...</p>
          </button>

          <button
            type="button"
            onClick={() =>
              setLocalGreeting(
                "您好，关注到贵司的{job}职位。我有扎实的工程落地与项目经验，深耕核心技术栈，希望能协助贵团队达成业务目标，期待进一步交流！"
              )
            }
            className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left text-[11px] text-stone-300 transition-all cursor-pointer"
          >
            <span className="font-bold text-amber-400 block mb-0.5">经验实战模板 (社招 / 跳槽)</span>
            <p className="line-clamp-2 text-stone-400">强调落地成果与技术积累，直奔主题...</p>
          </button>
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
          className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          保存招呼语
        </button>
      </div>
    </div>
  );
}
