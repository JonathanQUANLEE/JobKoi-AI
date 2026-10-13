export interface SkillChip {
  id: string;
  name: string;
  short: string;
  desc: string;
  activeColor: string;
  dotColor: string;
}

export const SKILL_CHIPS: SkillChip[] = [
  {
    id: "star",
    name: "逻辑清晰 · 背景与动作闭环",
    short: "逻辑闭环",
    desc: "让每段经历都有起因、具体做法与最终结果，读起来有头有尾",
    activeColor: "bg-amber-500/15 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/20",
    dotColor: "bg-amber-400",
  },
  {
    id: "xyz",
    name: "突出成果 · 增加数据量化",
    short: "数据量化",
    desc: "把经历中的成果换成百分比、金额、人数等具体数字，更有说服力",
    activeColor: "bg-blue-500/15 border-blue-500/50 text-blue-300 ring-1 ring-blue-500/20",
    dotColor: "bg-blue-400",
  },
  {
    id: "ats",
    name: "匹配度强化 · 融入岗位高频词",
    short: "岗位关键词",
    desc: "提取目标岗位 HR 最看重的专业技术词并融入简历，提高初筛通过率",
    activeColor: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/20",
    dotColor: "bg-emerald-400",
  },
  {
    id: "verbs",
    name: "专业表达 · 用词润色精炼",
    short: "用词润色",
    desc: "把“负责/协助”等平淡用词换成“主导/重构/攻坚”等更专业的表达",
    activeColor: "bg-purple-500/15 border-purple-500/50 text-purple-300 ring-1 ring-purple-500/20",
    dotColor: "bg-purple-400",
  },
];

export interface PromptTag {
  label: string;
  prompt: string;
}

export const PROMPT_TAGS: PromptTag[] = [
  { label: "计算机应届·深圳实习", prompt: "我是计算机应届生，帮我找深圳的 AI Agent 实习岗位" },
  { label: "电气自动化·研发岗", prompt: "电气自动化专业，找深圳/广州的智能硬件或制造业研发岗" },
  { label: "文科/社科·不限经验", prompt: "文科专业，找新媒体运营或管培生岗位，要求双休不加班" },
  { label: "切换黑白主题", prompt: "帮我切换到黑白极简高级主题" },
  { label: "加速投递(效率档)", prompt: "帮我切换到效率档，投递得更快一点" },
  { label: "查今日投递统计", prompt: "帮我查询今天各个平台的投递统计数据" },
  { label: "预览岗位匹配", prompt: "预览一下当前列表前 5 个岗位的匹配情况" },
];

export interface AgentPanelProps {
  getCurrentForm: () => Record<string, unknown>;
  onApply: (profileData: Record<string, unknown>) => void;
  onRun: () => void;
  onOpenSettings?: (tab?: "rules" | "policy" | "greeting" | "basic" | "model") => void;
  onExecuteAction?: (action: import("../../lib/ipc").AgentAction) => Promise<void> | void;
}
