import type { ProgressEvent, ProfileData } from "./ipc";
import type { Mode, Scope, MatchMode, RuleForm } from "./profileForm";
import { ipc } from "./ipc";

export const DEFAULT_PROFILE_NAME = "gui-default";
export const DEFAULT_GREETING = "";

export const DEFAULT_RULE: RuleForm = {
  requiredKeywords: "",
  anyKeywords: "后端开发,AI,RAG,大模型",
  excludeKeywords: "销售,客服,培训",
  scope: "title",
  // smart（2026-10-13）：意图分层匹配——关键词解析成「方向×性质」逐步降级
  // （L1 完整意图→L2 强方向→L3 同族+性质→L4 泛方向），绝不整串死匹配。
  match: "smart",
  caseSensitive: false,
};

// 个人情况引导占位词（人与 Agent 真实交流背景与诉求）
export const PLACEHOLDERS = [
  "例：我是电气工程应届生，熟练模电数电，想在深圳找硬件研发岗位，期望月薪 12k，双休...",
  "例：计算机 2026 届应届生，熟练 Python 与后端，想在深圳/杭州找 AI 研发，月薪 12-15k...",
  "例：文科毕业转码，有 1 年前端项目经验，熟练 Vue/React，想找广州或远程开发，不加班...",
  "例：3 年新媒体运营经验，擅长内容策划与用户增长，想去杭州电商公司，期望月薪 15k...",
  "例：会计学专业专升本，有初级会计证，想在成都找双休的财务分析或管培生...",
];

// 输入框内个人背景快捷添加标签
export const BACKGROUND_TAGS = [
  "2026/2027应届",
  "计算机/软件",
  "智能硬件/电气",
  "1-3年经验",
  "期望双休不加班",
  "意向深圳/广州",
  "期望月薪15k+",
];

// 顾问对话示例：求职者真实背景与诉求案例
export const JOBSEEKER_SITUATION_BATCHES = [
  [
    {
      role: "电气工程应届",
      tag: "智能硬件双休",
      userText: "我是电气工程及自动化应届生，熟练模电数电与PLC，想在深圳或广州找硬件研发或电气工程师，期望月薪10-13k，双休不加班。",
      city: "深圳,广州,东莞",
      query: "硬件研发工程师",
    },
    {
      role: "计算机26届",
      tag: "AI应用研发",
      userText: "我是计算机专业2026届应届生，熟悉Python、FastAPI和常见大模型Agent，想在深圳找AI后端研发岗位，期望月薪12-16k。",
      city: "深圳,杭州,北京",
      query: "Python后端工程师",
    },
    {
      role: "文科转码求职",
      tag: "前端开发不卷",
      userText: "文科专业转码，有1年前端自学和实战经验，熟练Vue3与React，想在广州找初级前端或全栈开发岗位，抗拒无效加班。",
      city: "广州,深圳",
      query: "前端开发工程师",
    },
    {
      role: "3年经验产品",
      tag: "B端SaaS高薪",
      userText: "我有3年互联网产品经理经验，主导过B端SaaS与用户增长业务，想在深圳或上海寻找产品经理机会，期望月薪20k+。",
      city: "深圳,上海,北京",
      query: "产品经理",
    },
  ],
  [
    {
      role: "双休文职运营",
      tag: "新媒体策划",
      userText: "新闻传播专业毕业1年，擅长文案策划与小红书运营，想在广州或成都找双休不加班的新媒体运营，期望薪资7-9k。",
      city: "广州,成都,深圳",
      query: "新媒体运营",
    },
    {
      role: "大模型实习生",
      tag: "985硕校招",
      userText: "985研二在读，人工智能多模态大模型方向，想在北京或上海找算法日常实习或校招实习，支持转正优先。",
      city: "北京,上海,深圳",
      query: "大模型算法工程师",
    },
    {
      role: "财务分析会计",
      tag: "双休正规名企",
      userText: "财务管理专业毕业2年，有初级会计证，想在深圳找正规双休企业做总账会计或财务分析，期望月薪9-11k。",
      city: "深圳,广州,上海",
      query: "财务会计",
    },
    {
      role: "智能制造管培",
      tag: "精益生产大厂",
      userText: "工业工程应届毕业生，英语六级，想在珠三角寻找智能制造或精益生产管培生岗位，要求规范管理大厂。",
      city: "深圳,东莞,广州",
      query: "生产管理管培生",
    },
  ],
  [
    {
      role: "全栈开发远程",
      tag: "弹性工作制",
      userText: "全栈工程师，熟悉Node.js与React/Next.js，想找支持远程办公或弹性工作制的科技团队，期望月薪18k。",
      city: "深圳,杭州",
      query: "全栈开发工程师",
    },
    {
      role: "科技出海商务",
      tag: "海外大客户BD",
      userText: "2年海外商务BD经验，英语流利，想看深圳科技出海或跨境科技公司的大客户销售拓展岗位，底薪12k+提成。",
      city: "深圳,广州,上海",
      query: "海外商务BD",
    },
    {
      role: "UI/UX体验设计",
      tag: "Figma杭州",
      userText: "UI/UX设计师2年经验，熟练Figma与设计系统构建，想在杭州找注重设计体验的互联网团队，期望月薪14-17k。",
      city: "杭州,上海,深圳",
      query: "UI设计师",
    },
    {
      role: "机械结构工程",
      tag: "硬件助理工程师",
      userText: "机械设计制造专业应届本科，熟练SolidWorks与CAD，想在东莞或深圳找结构工程师或硬件助理岗位，双休。",
      city: "东莞,深圳,广州",
      query: "结构工程师",
    },
  ],
];

// 快捷平台列表定义
export const PLATFORM_SHORTCUTS = [
  { id: "boss", name: "BOSS直聘", color: "#00bebd", desc: "主力平台 · 150/日", ready: true },
  { id: "liepin", name: "猎聘网", color: "#ff7033", desc: "中高端猎头 · 100/日", ready: true },
  { id: "job51", name: "前程无忧", color: "#ff5000", desc: "传统名企 · 40/日", ready: true },
  { id: "zhaopin", name: "智联招聘", color: "#1976d2", desc: "国企央企 · 筹备中", ready: false },
];

export function extractFallbackProfile(text: string) {
  const cities: string[] = [];
  const cityKeywords = ["深圳", "广州", "北京", "上海", "杭州", "成都", "武汉", "南京", "西安", "东莞", "苏州", "长沙", "重庆", "全国"];
  for (const c of cityKeywords) {
    if (text.includes(c)) cities.push(c);
  }

  let query = "目标岗位";
  const jobRoles = [
    { key: "硬件研发", label: "硬件研发工程师" },
    { key: "电气", label: "电气工程师" },
    { key: "Python", label: "Python后端工程师" },
    { key: "后端", label: "后端开发工程师" },
    { key: "前端", label: "前端开发工程师" },
    { key: "大模型", label: "大模型算法工程师" },
    { key: "算法", label: "算法工程师" },
    { key: "产品经理", label: "产品经理" },
    { key: "运营", label: "新媒体运营" },
    { key: "会计", label: "财务会计" },
    { key: "财务", label: "财务分析" },
    { key: "管培生", label: "管培生" },
    { key: "全栈", label: "全栈工程师" },
    { key: "测试", label: "测试开发工程师" },
    { key: "结构", label: "结构工程师" },
  ];
  for (const r of jobRoles) {
    if (text.includes(r.key)) {
      query = r.label;
      break;
    }
  }
  if (query === "目标岗位") {
    const cleaned = text.replace(/我是|想在|想找|期望|寻找/g, " ").trim();
    const parts = cleaned.split(/[\s,，。]+/);
    if (parts.length > 0 && parts[0].length >= 2) {
      query = parts[0].slice(0, 10);
    }
  }

  const exclusions = ["销售", "客服", "劳务派遣", "外包", "培训"];

  return {
    query,
    cities: cities.join(","),
    anyKeywords: query,
    excludeKeywords: exclusions.join(","),
  };
}

export function joinKeywords(value: unknown, fallback: string): string {
  return Array.isArray(value) ? value.map(String).join(",") : fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asString(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

export function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asMode(value: unknown, fallback: Mode): Mode {
  return value === "scan" || value === "review" || value === "auto" ? value : fallback;
}

export function asScope(value: unknown, fallback: Scope): Scope {
  return value === "title" || value === "description" || value === "title_description" || value === "location" || value === "all"
    ? value
    : fallback;
}

export function asMatchMode(value: unknown, fallback: MatchMode): MatchMode {
  return value === "contains" || value === "regex" || value === "exact" || value === "smart"
    ? value
    : fallback;
}

export function latestPayload(events: ProgressEvent[], kind: ProgressEvent["kind"]) {
  return [...events].reverse().find((event) => event.kind === kind)?.payload;
}

export function latestJob(events: ProgressEvent[]) {
  return [...events].reverse().find((event) => event.kind === "job_found")?.payload;
}

export function summarizeEvents(events: ProgressEvent[]) {
  return events.reduce(
    (acc, event) => {
      // scanned：DOM 流发 job_found，API 直读流发 job_processing（2026-10-12
      // 实测事故：API 流只发 job_processing，旧逻辑只认 job_found → 巡航结束
      // 弹窗"扫描 0"但汇总 330——两条流的事件都计入）
      if (event.kind === "job_found" || event.kind === "job_processing") acc.scanned += 1;
      if (event.kind === "job_skipped") acc.skipped += 1;
      // sent：DOM 流发 letter_sent(status=sent)，API 直读流发 job_sent
      if (
        (event.kind === "letter_sent" && event.payload.status === "sent") ||
        event.kind === "job_sent"
      ) {
        acc.sent += 1;
      }
      return acc;
    },
    { scanned: 0, skipped: 0, sent: 0 },
  );
}

/**
 * 按平台拆分的实时计数（实时巡航页四平台通道卡并列显示用）。
 * 事件带 platform 字段（boss/liepin/job51）；旧事件缺省归 boss。
 */
export function summarizeEventsByPlatform(
  events: ProgressEvent[],
): Record<string, { scanned: number; sent: number; skipped: number }> {
  const result: Record<string, { scanned: number; sent: number; skipped: number }> = {};
  const bucket = (platform: unknown) => {
    const key = typeof platform === "string" && platform ? platform : "boss";
    if (!result[key]) result[key] = { scanned: 0, sent: 0, skipped: 0 };
    return result[key];
  };
  for (const event of events) {
    const b = bucket(event.payload.platform);
    if (event.kind === "job_found" || event.kind === "job_processing") b.scanned += 1;
    if (event.kind === "job_skipped") b.skipped += 1;
    if (
      (event.kind === "letter_sent" && event.payload.status === "sent") ||
      event.kind === "job_sent"
    ) {
      b.sent += 1;
    }
  }
  return result;
}

export function formatJobLine(payload: Record<string, unknown> | undefined): string {
  if (!payload) return "-";
  const title = asString(payload.title, "");
  const company = asString(payload.company, "");
  const location = asString(payload.location, "");
  return [title, company, location].filter(Boolean).join(" / ") || "-";
}

export function toRepoRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^.*?\/greetings\//, "./greetings/");
}

export function formatLocalTime(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 启动巡航时招呼语为空的高情商兜底文案（与 useJobBotRuntime.startRun 的口径一致）。 */
export const FALLBACK_GREETING_TEXT =
  "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流！";

/** 递归键序稳定的 JSON 序列化：对象键排序后再拼接，"内容相同、键序不同"的两个对象结果一致。 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * 表单是否有未保存到磁盘的修改（启动前知情确认弹窗的判据）。
 *
 * 与 startRun 启动时自动保存的口径完全一致：比较 buildProfileData 生成的
 * 画像数据与磁盘 getProfile、招呼语文本/文件路径与磁盘 getGreeting。
 * - 画像读不到（从未保存过/名称不存在）→ 视为有修改：先保存，后端才能加载；
 * - 招呼语文件为空（从未保存过）→ 不算修改，避免首次启动弹窗噪音；
 * - 招呼语 IPC 异常 → 不拦截（fail-open，交给原有流程兜底）。
 */
export async function hasUnsavedProfileChanges(opts: {
  profileName: string;
  currentProfileData: () => ProfileData;
  greeting: string;
  greetingPath: string;
}): Promise<boolean> {
  const name = opts.profileName.trim() || DEFAULT_PROFILE_NAME;
  try {
    const disk = await ipc.getProfile(name);
    if (stableStringify(disk.data) !== stableStringify(opts.currentProfileData())) {
      return true;
    }
  } catch {
    return true;
  }
  try {
    const { path, text } = await ipc.getGreeting();
    const formPath = opts.greetingPath.trim() || "./greetings/default.txt";
    if (toRepoRelativePath(path) !== formPath) return true;
    const formText = opts.greeting.trim() || FALLBACK_GREETING_TEXT;
    if (text && text.trim() !== formText) return true;
  } catch {
    /* 招呼语读取失败不拦截巡航 */
  }
  return false;
}
