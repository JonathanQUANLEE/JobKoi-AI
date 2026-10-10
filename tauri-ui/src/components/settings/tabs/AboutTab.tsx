interface AboutTabProps {
  isMonochrome: boolean;
}

export default function AboutTab({ isMonochrome }: AboutTabProps) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] flex items-center gap-3.5">
        <img src="/favicon.png" alt="Logo" className="size-10 rounded-xl border border-pink-400/30" />
        <div>
          <div className="font-bold text-sm text-stone-100">JobHunter 求职助手</div>
          <div className="text-[11px] text-stone-400 mt-0.5">全平台智能巡航 · Offer 尊享版 v0.2.0</div>
        </div>
      </div>

      <div className="space-y-2 text-stone-400 leading-relaxed text-[11px]">
        <p>JobHunter 专为求职者打造，深度融合大模型顾问诊断、多招聘平台直连与智能投递风控。</p>
        <p>支持平台：BOSS 直聘、猎聘、前程无忧、智联招聘。</p>
      </div>

      <div className="pt-3 border-t border-[var(--grid)] flex items-center justify-between text-[11px] text-stone-500">
        <span>© 2026 JobHunter. 保留所有权利。</span>
        <button
          type="button"
          onClick={() => alert("当前已是最新版本 v0.2.0")}
          className={`hover:underline cursor-pointer ${isMonochrome ? "text-zinc-300 hover:text-white" : "text-amber-400"}`}
        >
          检查更新
        </button>
      </div>
    </div>
  );
}
