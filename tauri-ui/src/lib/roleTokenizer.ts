/**
 * 目标职位输入的切词器（2026-10-17 空格输入习惯 0 结果事故）。
 *
 * 与后端 `boss_zhipin.config.query_fission.split_search_keywords` 保持同一套
 * 启发式（显式分隔符优先 → 无分隔符空格串按岗位后缀收口智能切分），两端
 * 测试用例互为镜像——改任何一端必须同步另一端，否则 GUI 预览与实际搜索词
 * 会悄悄分叉。
 *
 * 纯函数、零依赖，便于单测（见 roleTokenizer.test.ts）。
 */

/** 显式分隔符：中文/英文逗号、顿号、分号、换行（与后端 _LABEL_SEPARATORS_RE 一致）。 */
const LABEL_SEPARATORS_RE = /[,，、;；\n]+/;

/** 岗位后缀：中文 token 以此结尾 = 一个完整岗位名收口（与后端 _JOB_SUFFIXES 一致）。 */
const JOB_SUFFIXES = [
  "工程师", "架构师", "分析师", "设计师", "研究员", "开发", "研发", "运维",
  "实习", "实习生", "兼职", "校招",
  "专员", "经理", "主管", "总监", "助理", "顾问",
  "运营", "编辑", "策划", "翻译", "审计",
  "管培生", "培训生", "管理", "销售", "客服",
  "老师", "教师", "医生", "护士", "律师", "会计", "文员",
  "员", "师",
];

/** 独立成岗的完整词（不以任何后缀结尾，但单独就是一个岗位）。 */
const STANDALONE_JOBS = new Set([
  "产品", "人事", "行政", "财务", "采购", "主播", "记者", "导购",
  "收银", "保安", "保洁", "司机", "快递", "外卖", "店长",
]);

/** 常见岗位起始词（拉丁）：短语已有内容且下一词是中文时，从它另起一岗。 */
const JOB_START_TOKENS = new Set([
  "ai", "web", "java", "python", "go", "golang", "rust", "php",
  "c", "c++", "c#", ".net", "net", "ios", "android", "harmonyos",
  "hr", "ui", "ux", "3d", "vr", "ar", "devops", "dba",
]);

const CJK_CHAR_RE = /[\u4e00-\u9fff]/;

function hasCjk(token: string): boolean {
  return CJK_CHAR_RE.test(token);
}

function closesJobPhrase(token: string): boolean {
  if (STANDALONE_JOBS.has(token)) return true;
  return JOB_SUFFIXES.some((suffix) => token.endsWith(suffix));
}

/** 对无显式分隔符、含空格的单段做岗位短语切分；<2 个短语返回 []（保留原文）。 */
export function smartSplitSpaceSeparated(segment: string): string[] {
  const tokens = (segment || "").split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return [];

  const phrases: string[][] = [];
  let current: string[] = [];

  tokens.forEach((token, i) => {
    if (hasCjk(token)) {
      current.push(token);
      if (closesJobPhrase(token)) {
        phrases.push(current);
        current = [];
      }
    } else {
      const isStart = JOB_START_TOKENS.has(token.toLowerCase());
      const nextIsCjk = i + 1 < tokens.length && hasCjk(tokens[i + 1]);
      if (isStart && current.length > 0 && nextIsCjk) {
        phrases.push(current);
        current = [token];
      } else {
        current.push(token);
      }
    }
  });
  if (current.length > 0) phrases.push(current);

  if (phrases.length < 2) return [];
  return phrases.filter((p) => p.length > 0).map((p) => p.join(" "));
}

/**
 * 把「目标职位」输入切分成岗位标签列表（与后端 split_search_keywords 同语义）。
 *
 * - 显式分隔符多段：完全尊重用户意图，段内不再二次猜测
 * - 无分隔符但含空格：智能切词兜底（≥2 个短语才采纳）
 * - "AI agent 实习" 这类单岗位名原样保留（零回归）
 */
export function splitRoleInput(raw: string): string[] {
  const rawStr = (raw || "").trim();
  if (!rawStr) return [];
  const parts = rawStr
    .split(LABEL_SEPARATORS_RE)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  if (parts.length > 1) return parts;
  const smart = smartSplitSpaceSeparated(parts[0]);
  return smart.length > 0 ? smart : parts;
}

/** 序列化标签列表为表单存储的逗号串（后端按显式分隔符切开，零歧义）。 */
export function joinRoleTags(tags: string[]): string {
  return tags
    .map((t) => t.trim())
    .filter(Boolean)
    .join("，");
}
