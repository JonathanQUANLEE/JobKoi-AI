import { HugeiconsIcon } from "@hugeicons/react";
import { CpuIcon, SparklesIcon as HugeSparklesIcon } from "@hugeicons/core-free-icons";

interface PolishShowcaseProps {
  onInsertSample: () => void;
}

export default function PolishShowcase({ onInsertSample }: PolishShowcaseProps) {
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-5 space-y-4 shadow-lg">
      <div className="flex items-center justify-between pb-3.5 border-b border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <HugeiconsIcon icon={CpuIcon} size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-stone-200">简历诊断与经历精修</h3>
            <p className="text-[11px] text-stone-400">已就绪 4 组专业改写技能包，等待输入或拖入简历体验</p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          算法引擎待命
        </span>
      </div>

      {/* 4 大技能包说明卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
            <span className="size-1.5 rounded-full bg-amber-400" />
            <span>经历逻辑闭环</span>
          </div>
          <p className="text-[11px] text-stone-400 leading-relaxed">
            每段经历都补齐"背景是啥、具体怎么做、最终结果如何"，根除“只写干了什么，不写怎么做和成果”的逻辑硬伤。
          </p>
        </div>

        <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-blue-300 text-xs">
            <span className="size-1.5 rounded-full bg-blue-400" />
            <span>成果数据量化</span>
          </div>
          <p className="text-[11px] text-stone-400 leading-relaxed">
            把“做了什么”换成“做成了什么、有多少提升”，用百分比、金额、人数等具体数字呈现成效。
          </p>
        </div>

        <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-emerald-300 text-xs">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>岗位关键词融入</span>
          </div>
          <p className="text-[11px] text-stone-400 leading-relaxed">
            对齐目标岗位的高频技能词汇，让简历更容易通过公司系统的机器初筛。
          </p>
        </div>

        <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-purple-300 text-xs">
            <span className="size-1.5 rounded-full bg-purple-400" />
            <span>用词专业升级</span>
          </div>
          <p className="text-[11px] text-stone-400 leading-relaxed">
            淘汰“负责/参与/协助”等被动乏力词汇，自动升级为“主导/重构/攻坚/优化”等高主动性动词。
          </p>
        </div>
      </div>

      {/* 经典前后改写案例对比 */}
      <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800/90 space-y-2">
        <div className="text-[11px] font-bold text-stone-300 flex items-center justify-between">
          <span>改写效果透视 (Before vs After)</span>
          <span className="text-[10px] text-stone-500 font-mono">优化效果示范</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/30 text-rose-300/80 leading-relaxed">
            <span className="font-bold text-rose-400 block mb-0.5">改写前（平庸且缺乏说服力）：</span>
            “负责公司电商系统的开发和日常维护，修改了一些 SQL 慢查询，系统运行良好。”
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 text-emerald-300/90 leading-relaxed">
            <span className="font-bold text-emerald-400 block mb-0.5">改写后（注入技能包后）：</span>
            “<strong className="text-white">主导</strong>电商核心用户中心架构重构（Spring Boot + Redis），<strong className="text-white">深度调优 12 条高频核心 SQL 索引</strong>，将 P99 响应耗时<strong className="text-emerald-400">降低 42%</strong>，平稳承载日均 <strong className="text-emerald-400">10万+</strong> 高并发访问。”
          </div>
        </div>
      </div>

      {/* 操作引导 */}
      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-200">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={HugeSparklesIcon} size={16} className="text-amber-400 shrink-0" />
          <span>在左侧粘贴简历经历文本，或点击「上传简历文件」导入即可开始</span>
        </div>
        <button
          type="button"
          onClick={onInsertSample}
          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-all cursor-pointer shrink-0"
        >
          一键填入示例经历体验
        </button>
      </div>
    </div>
  );
}
