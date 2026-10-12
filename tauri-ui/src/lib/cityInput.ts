/**
 * 意向城市输入的宽容解析与白名单归一（防静默失效 + 防崩）。
 *
 * 背景（2026-10-12 用户拍板）：城市是自由文本输入，用户可能用空格、顿号、
 * 分号、斜杠等任意方式分隔（"深圳 广州"），旧逻辑只按英文/中文逗号切分——
 * 粘连成一个永远匹配不上的关键词，城市筛选静默失效。这里统一收口：
 *
 * 1. 多分隔符宽容切分：中英文逗号/顿号/分号/斜杠/竖线/空格/换行全当分隔符；
 * 2. 白名单归一：常用城市去"市"后缀（"深圳市"→"深圳"），大小写不敏感匹配；
 * 3. 垃圾拦截：不含中文/字母的段（emoji、纯符号）、超长段（>8 字符）丢弃；
 * 4. 上限保护：最多 20 个（BOSS 页面筛选每批最多 4 个会自动轮换，见
 *    page_filter_ctrl.get_platform_city_chunks），去重保序。
 *
 * 冷门城市（不在白名单但长度合法）保留原样——平台页面点击不到会警告跳过、
 * 本地规则兜底，不会崩；强行丢弃反而会误删用户的真实意向。
 */

/** 常用城市白名单（BOSS 开站主力城市 + 现有 COMMON_CITIES 全集），用于归一与自动补全。 */
export const CITY_WHITELIST: readonly string[] = [
  "全国",
  "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京", "苏州", "东莞",
  "重庆", "天津", "西安", "长沙", "郑州", "青岛", "合肥", "福州", "厦门", "昆明",
  "大连", "沈阳", "哈尔滨", "济南", "佛山", "宁波", "无锡", "温州", "珠海", "中山",
  "惠州", "贵阳", "南昌", "太原", "石家庄", "兰州", "南宁", "常州", "泉州", "南通",
  "嘉兴", "烟台", "唐山", "徐州", "汕头", "洛阳", "乌鲁木齐",
];

/** 单个城市段的最大长度：中国城市名最长 4 字（乌鲁木齐/石家庄），留 2 字余量到 6；
 * 超过视为垃圾文本（如把整句话粘进输入框："我想在城市找工作"），丢弃。
 * 例外：能被白名单粘连拆分完全覆盖的超长段（"郑州上海深圳北京"）不算垃圾。 */
const MAX_CITY_LEN = 6;
/** 解析后的城市数量上限：防滥用，超出截断（BOSS 投递时本来就会按 4 个/批轮换）。 */
const MAX_CITY_COUNT = 20;

/** 全部分隔符：中英文逗号、顿号、分号、斜杠、竖线（含全角｜／）、空白（含全角空格/换行/制表符）。 */
const SEPARATOR_RE = /[,，、;；/／|｜\s]+/;

/** 白名单的小写索引（大小写不敏感归一用）。 */
const CITY_LOOKUP: ReadonlyMap<string, string> = new Map(
  CITY_WHITELIST.map((c) => [c.toLowerCase(), c]),
);

/** 城市名之间可能残留的行政连接单字："郑州市上海"、"广东省深圳"。 */
const ADMIN_JOINER_CHARS = new Set(["市", "省"]);

/** 白名单按长度降序（贪心最长匹配用，"南京"不能抢先吃掉"南宁"的边缘场景）。 */
const CITIES_BY_LENGTH_DESC: readonly string[] = [...CITY_WHITELIST]
  .filter((c) => c !== "全国")
  .sort((a, b) => b.length - a.length);

/**
 * 无分隔粘连拆分："郑州上海"→["郑州","上海"]（2026-10-12 用户实测事故）。
 *
 * 用户连空格都不打直接连输城市名，任何分隔符方案都切不开——只能在白名单里
 * 做**贪心最长前缀匹配**：从左到右每一步找一个白名单城市当前缀，允许跳过
 * 市/省 等行政连接单字。要求**完全覆盖**整个 token 才算拆分成功；拆不完
 * （"昆山"、"我想去深圳"）返回 null 保留原样，绝不误拆。
 */
function splitConcatenatedCities(token: string): string[] | null {
  const result: string[] = [];
  let i = 0;
  while (i < token.length) {
    if (ADMIN_JOINER_CHARS.has(token[i])) {
      i += 1;
      continue;
    }
    const hit = CITIES_BY_LENGTH_DESC.find((city) => token.startsWith(city, i));
    if (!hit) return null;
    result.push(hit);
    i += hit.length;
  }
  return result.length >= 1 ? result : null;
}

/**
 * 判断单个城市段是否含有效文本字符：必须含中文或英文字母。
 * emoji / 纯符号拦下；长度校验挪到 parseCityList（拆分豁免需要更细的顺序）。
 */
function hasCityText(token: string): boolean {
  return !!token && /[\u4e00-\u9fa5a-zA-Z]/.test(token);
}

/** 归一化单个城市段：白名单命中（含去"市"后缀重试）→ 标准名；否则原样保留。 */
function normalizeCityToken(token: string): string {
  const direct = CITY_LOOKUP.get(token.toLowerCase());
  if (direct) return direct;
  // "深圳市"→"深圳"、"广州市"→"广州"（仅当去掉后缀后命中白名单才归一）
  if (token.endsWith("市") && token.length > 2) {
    const stripped = token.slice(0, -1);
    const hit = CITY_LOOKUP.get(stripped.toLowerCase());
    if (hit) return hit;
  }
  return token;
}

/**
 * 宽容解析城市串 → 标准城市数组（去重保序）。
 *
 * 典型输入全防：
 * - "深圳 广州"（空格分隔）→ ["深圳", "广州"]
 * - "郑州上海"（无分隔粘连，2026-10-12 实测事故）→ ["郑州", "上海"]（白名单贪心拆分）
 * - "郑州上海深圳北京"（超长粘连）→ 4 城全拆出（拆分豁免长度限制）
 * - "深圳，广州、东莞;上海｜北京/杭州"（混合分隔符）→ 各自独立
 * - "深圳市" → ["深圳"]（白名单归一）
 * - "🔥🔥🔥" / "我想在深圳广州找工作"（拆不动 + 超长）→ []（垃圾拦截）
 * - "全国" + 其他城市 → ["全国"]（全国含一切，语义上等于清空具体城市）
 */
export function parseCityList(raw: string | null | undefined): string[] {
  const text = (raw || "").trim();
  if (!text) return [];

  const tokens = text
    .split(SEPARATOR_RE)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: string[] = [];
  const pushAll = (cities: string[]): boolean => {
    // 返回是否已达数量上限（外层据此 break）
    for (const c of cities) {
      if (!out.includes(c)) out.push(c);
      if (out.length >= MAX_CITY_COUNT) return true;
    }
    return false;
  };

  let hasNationwide = false;
  for (const token of tokens) {
    if (!hasCityText(token)) continue; // emoji / 纯符号
    if (token === "全国") {
      hasNationwide = true;
      continue;
    }
    // 1) 白名单直接命中（含去"市"归一）
    const normalized = normalizeCityToken(token);
    if (normalized !== token) {
      if (pushAll([normalized])) break;
      continue;
    }
    // 2) 无分隔粘连拆分（拆分成功豁免长度限制："郑州上海深圳北京"）
    const parts = splitConcatenatedCities(token);
    if (parts) {
      if (pushAll(parts)) break;
      continue;
    }
    // 3) 拆不动：长度合法的冷门城市保留（"昆山"），超长垃圾丢弃
    if (token.length <= MAX_CITY_LEN) {
      if (pushAll([token])) break;
    }
  }
  // "全国"与具体城市并存时，"全国"语义优先（全国含一切，与"全国"按钮清空逻辑一致）
  if (hasNationwide) return ["全国"];
  return out;
}

/**
 * 宽容解析 → 标准逗号串（表单值格式）。空输入返回 ""。
 * "深圳 广州" → "深圳,广州"；解析后为空返回 ""（城市筛选关闭，不会崩）。
 */
export function normalizeCityInput(raw: string | null | undefined): string {
  return parseCityList(raw).join(",");
}

/**
 * 输入框自动补全建议：取城市串**最后一段**作为查询前缀，返回白名单中
 * 以其为前缀（或包含）的城市，排除已选中的。最多 5 条。
 */
export function suggestCities(raw: string | null | undefined): string[] {
  const text = (raw || "").trim();
  if (!text) return [];
  const selected = new Set(parseCityList(text));
  if (selected.has("全国")) return [];
  const segments = text.split(SEPARATOR_RE).filter(Boolean);
  const query = segments[segments.length - 1] || "";
  if (!query || query.length > MAX_CITY_LEN) return [];
  const q = query.toLowerCase();
  const hits: string[] = [];
  for (const city of CITY_WHITELIST) {
    if (city === "全国") continue;
    if (selected.has(city)) continue;
    if (city.toLowerCase().startsWith(q) || city.toLowerCase().includes(q)) {
      hits.push(city);
      if (hits.length >= 5) break;
    }
  }
  return hits;
}

/** 输入框 blur 时追加一个建议城市（或快捷点选）：基于宽容解析合并，去重保序。 */
export function appendCity(raw: string | null | undefined, city: string): string {
  const list = parseCityList(raw);
  const normalized = normalizeCityToken(city);
  if (normalized === "全国") return "全国";
  if (!list.includes(normalized)) list.push(normalized);
  return list.slice(0, MAX_CITY_COUNT).join(",");
}

/** 切换一个城市：已选则移除，未选则追加（快捷 chips 点击用）。 */
export function toggleCityInList(raw: string | null | undefined, city: string): string {
  if (city === "全国") return ""; // "全国" = 清空具体城市（历史语义保留）
  const list = parseCityList(raw).filter((c) => c !== "全国");
  const normalized = normalizeCityToken(city);
  const idx = list.indexOf(normalized);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(normalized);
  }
  return list.slice(0, MAX_CITY_COUNT).join(",");
}
