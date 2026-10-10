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
    name: "STAR 闭环改写",
    short: "STAR 闭环",
    desc: "情境(S) + 任务(T) + 行动(A) + 成果(R) 严密逻辑闭环",
    activeColor: "bg-amber-500/15 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/20",
    dotColor: "bg-amber-400",
  },
  {
    id: "xyz",
    name: "Google X-Y-Z 量化",
    short: "X-Y-Z 量化",
    desc: "通过做 [Z]，达成 [X] 成果，以 [Y] 指标精准衡量",
    activeColor: "bg-blue-500/15 border-blue-500/50 text-blue-300 ring-1 ring-blue-500/20",
    dotColor: "bg-blue-400",
  },
  {
    id: "ats",
    name: "ATS 关键词穿透",
    short: "ATS 穿透",
    desc: "覆盖目标岗位高频技术词，消除机筛解析盲区",
    activeColor: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/20",
    dotColor: "bg-emerald-400",
  },
  {
    id: "verbs",
    name: "强动词能量升级",
    short: "强动词升级",
    desc: "淘汰'负责/参与'平庸词，升级为'主导/重构/攻坚'",
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
  { label: "查今日投递统计", prompt: "帮我查询今天各个平台的投递统计数据" },
  { label: "预览岗位匹配", prompt: "预览一下当前列表前 5 个岗位的匹配情况" },
];

export interface AgentPanelProps {
  getCurrentForm: () => Record<string, unknown>;
  onApply: (profileData: Record<string, unknown>) => void;
  onRun: () => void;
  onOpenSettings?: (tab?: "rules" | "policy" | "greeting" | "basic" | "model") => void;
}
