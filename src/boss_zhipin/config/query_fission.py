"""搜索关键词裂变与轮转（2026-10-13 用户拍板：三阶段自适应意图捕获引擎·机制一）。

背景：猎聘/前程无忧此前用一份**静态**默认关键词表搜索（AI Agent / 大模型 /
Python / 软件开发……），与用户当天的求职意图无关。用户在 GUI 输入
"AI agent 实习"后，只有第一个搜索词是他的意图，其余全是泛 Computer 词。

本模块把基准词裂变成三个探索桶（每轮巡航随机洗牌轮换，"每天搜不同的词"）：

- 精准桶（tier1）：方向的精确变体——AI Agent / Agent开发 / 智能体 …
- 技术栈桶（tech）：平台上真实存在岗位的搜索词——RAG / LangChain /
  Prompt工程 …（区别于 intent_lexicon 的匹配词族：那边的词用来"判定标题
  是否相关"，这边的词用来"在搜索框里搜得出岗位"）
- 泛生态桶（pan）：同族大方向——大模型 / 机器学习 / AIGC …

设计原则（防腐三约定）：
1. **复用不复制**：方向×性质的解析直接调 intent_lexicon.parse_intent，
   不另立词族表（两套词表必然打架）；
2. **纯函数**：输入字符串输出列表，无全局状态；
3. **零回归**：未收录的方向（如"水利水电实习"）退化为只搜原词，
   行为与历史完全一致。
"""

from __future__ import annotations

import random
import re

from boss_zhipin.config.intent_lexicon import parse_intent

# 搜索端专属技术栈词（intent_lexicon 的 tier1/pan 负责"匹配"，这里补
# "搜索得出岗位"的实战搜索词）。key 与 intent_lexicon._DIRECTION_LEXICON
# 的方向核心一致。
_SEARCH_TECH_TERMS: dict[str, tuple[str, ...]] = {
    "ai agent": ("RAG", "LangChain", "Prompt工程", "Agent平台", "AI应用开发"),
    "ai": ("RAG", "LangChain", "Prompt工程", "AI应用开发"),
}

# 性质后缀：基准词带"实习"类性质词时，每个裂变词都拼上，保证搜索结果
# 也聚焦实习岗（猎聘/51job 的本地过滤不看职级，搜索词是唯一的第一道闸）。
_NATURE_SUFFIX = " 实习"

# 匹配词 ≠ 搜索词：intent_lexicon 里有几个词是拿来"判定标题相关性"的，
# 单独拿去搜索框会搜出残缺结果（"生成式"搜不出"生成式AI"岗），剔除。
_NOT_SEARCHABLE = frozenset({"生成式", "GPT"})


def generate_fission_keywords(
    base_kw: str,
    *,
    max_terms: int = 8,
    rng: random.Random | None = None,
) -> list[str]:
    """把基准词裂变成搜索关键词列表（基准词永远排第一位）。

    - 命中已知领域（intent_lexicon 词族）：tier1 + tech + pan 三桶合并，
      除基准词外随机洗牌（每轮巡航顺序不同 = 轮转），截断到 max_terms；
    - 未收录方向：安全降级为 ``[base_kw]``（零回归）；
    - 基准词含性质词（实习/暑期/校招…）时，裂变词统一拼接性质后缀。
    """
    base = (base_kw or "").strip()
    if not base:
        return []

    intent = parse_intent(base)
    lexicon = intent["lexicon"]
    if lexicon is None:
        # 方向未收录（如"嵌入式"）：只搜原词，不瞎扩展
        return [base]

    direction = intent["direction"]
    tier1_terms = [t for t in lexicon.get("tier1", ()) if t.strip()]
    tech_terms = [t for t in _SEARCH_TECH_TERMS.get(direction, ()) if t.strip()]
    pan_terms = [
        t
        for t in lexicon.get("pan", ())
        if t.strip() and t not in _NOT_SEARCHABLE
    ]

    # tier1（精准桶）→ tech（技术栈桶）→ pan（泛生态桶）：桶内保序，
    # 桶间优先级固定；三桶合并后再整体洗牌实现轮转。
    suffix = _NATURE_SUFFIX if intent["has_nature"] else ""
    pool: list[str] = []
    for term in [*tier1_terms, *tech_terms, *pan_terms]:
        candidate = f"{term}{suffix}"
        if candidate and candidate not in pool:
            pool.append(candidate)

    shuffler = rng or random
    shuffler.shuffle(pool)

    # 基准词永远第一位（保底最高意图），裂变词跟在后面
    final_list = [base]
    for term in pool:
        if term != base and term.lower() != base.lower():
            final_list.append(term)
        if len(final_list) >= 1 + max_terms:
            break
    return final_list


# 多岗位输入的合法分隔符（2026-10-15）：GUI「目标职位」允许一次输入多个
# 岗位（"AI应用工程师, AI agent实习"）。刻意**不含空格/斜杠/竖线**——
# "AI agent 实习"、"AI/算法工程师" 这类单岗位名内部就带这些字符，按它们
# 切割会把一个好关键词撕成碎片（用户实测事故：整串带逗号直接进
# query 参数，BOSS 按全文匹配搜出的岗位与画像完全无关）。
_LABEL_SEPARATORS_RE = re.compile(r"[,，、;；\n]+")

# ---------- 空格分隔的智能切词兜底（2026-10-17 用户实测痛点） ----------
#
# 大多数用户习惯按空格输入多个岗位（"AI Agent 实习 AI Agent AI 应用工程师"
# 或文科岗"销售 销售管理 客户经理"），极少有人规范打逗号。旧逻辑找不到
# 显式分隔符时把整长串当一个关键词拼进 query 参数——BOSS 全词匹配直接
# 返回 0 条，整轮巡航空转报废。
#
# 切词策略（保守启发式，宁少切不错切——切错的后果是关键词碎片化 0 结果，
# 与不切一样糟，但用户在前端 Tag 输入框里能一眼看出并手动修正）：
# 1. 只对「无显式分隔符的单段」启用；智能产出 ≥2 个岗位短语才采纳，
#    否则原样保留（"AI agent 实习" 这类单岗位名零回归）；
# 2. 岗位短语以「岗位后缀词」收口：中文词以 工程师/实习/经理/专员… 结尾
#    即认为一个完整岗位名结束；拉丁词（AI/Web/Java）永不收口——它们只
#    能做方向前缀；
# 3. 常见岗位起始词（AI/Java/Python…）在当前短语已有内容且下一词是中文
#    时开启新短语——"AI Agent AI 应用工程师" 由此切出 "AI Agent" +
#    "AI 应用工程师" 而不是粘成一坨。

# 岗位后缀：中文 token 以此结尾 = 一个完整岗位名收口
_JOB_SUFFIXES: tuple[str, ...] = (
    "工程师", "架构师", "分析师", "设计师", "研究员", "开发", "研发", "运维",
    "实习", "实习生", "兼职", "校招",
    "专员", "经理", "主管", "总监", "助理", "顾问",
    "运营", "编辑", "策划", "翻译", "审计",
    "管培生", "培训生", "管理", "销售", "客服",
    "老师", "教师", "医生", "护士", "律师", "会计", "文员",
    "员", "师",
)

# 独立成岗的完整词（不以任何后缀结尾，但单独就是一个岗位）
_STANDALONE_JOBS: frozenset[str] = frozenset({
    "产品", "人事", "行政", "财务", "采购", "主播", "记者", "导购",
    "收银", "保安", "保洁", "司机", "快递", "外卖", "店长",
})

# 常见岗位起始词（拉丁）：短语已有内容且下一词是中文时，从它另起一岗
_JOB_START_TOKENS: frozenset[str] = frozenset({
    "ai", "web", "java", "python", "go", "golang", "rust", "php",
    "c", "c++", "c#", ".net", "net", "ios", "android", "harmonyos",
    "hr", "ui", "ux", "3d", "vr", "ar", "devops", "dba",
})

_CJK_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")


def _has_cjk(token: str) -> bool:
    return bool(_CJK_CHAR_RE.search(token))


def _closes_job_phrase(token: str) -> bool:
    """中文 token 是否标志一个完整岗位名收口（后缀结尾或独立成岗）。"""
    return token in _STANDALONE_JOBS or any(
        token.endswith(suffix) for suffix in _JOB_SUFFIXES
    )


def _smart_split_space_separated(segment: str) -> list[str]:
    """对无显式分隔符、含空格的单段做岗位短语切分（纯函数）。

    产出 <2 个短语时返回空列表（调用方保留原文，零回归保护）。
    """
    tokens = [t for t in (segment or "").split() if t]
    if len(tokens) < 2:
        return []

    phrases: list[list[str]] = []
    current: list[str] = []

    for i, token in enumerate(tokens):
        if _has_cjk(token):
            current.append(token)
            if _closes_job_phrase(token):
                phrases.append(current)
                current = []
        else:
            is_start = token.lower() in _JOB_START_TOKENS
            next_is_cjk = i + 1 < len(tokens) and _has_cjk(tokens[i + 1])
            if is_start and current and next_is_cjk:
                # "AI Agent | AI 应用工程师"：岗位起始词开启新短语
                phrases.append(current)
                current = [token]
            else:
                current.append(token)
    if current:
        phrases.append(current)

    if len(phrases) < 2:
        return []
    return [" ".join(p) for p in phrases if p]


def split_search_keywords(raw: str) -> list[str]:
    """把「目标职位」输入切分成关键词列表（纯函数）。

    - "AI应用工程师, AI agent实习," → ["AI应用工程师", "AI agent实习"]
    - "AI应用工程师、大模型；NLP" → 三词（支持中文顿号/分号/换行）
    - 显式分隔符多段：完全尊重用户意图，段内不再二次猜测
    - 无分隔符但含空格：智能切词兜底（"销售 销售管理" → 两词；
      "AI agent 实习" 单岗位名原样保留，零回归）
    - 空串/全分隔符 → []
    """
    raw_str = (raw or "").strip()
    if not raw_str:
        return []
    parts = [p.strip() for p in _LABEL_SEPARATORS_RE.split(raw_str) if p.strip()]
    if not parts:
        return []
    if len(parts) > 1:
        return parts
    smart = _smart_split_space_separated(parts[0])
    return smart if smart else parts


def generate_fission_keywords_for_label(
    raw: str, *, max_terms_per_kw: int = 8, rng: random.Random | None = None
) -> list[str]:
    """多岗位输入的裂变入口：先切分、逐词裂变、合并去重（保序）。

    旧逻辑把整串（含逗号）当基准词：猎聘/51job 的裂变基准被污染，
    第一个搜索词就是搜不出东西的垃圾串。这里每个岗位词独立裂变
    （各自享受 tier1/tech/pan 三桶扩展）；单关键词输入与直接调
    ``generate_fission_keywords`` 完全等价（零回归）。
    """
    merged: list[str] = []
    for kw in split_search_keywords(raw):
        for term in generate_fission_keywords(
            kw, max_terms=max_terms_per_kw, rng=rng
        ):
            if term not in merged:
                merged.append(term)
    return merged


__all__ = [
    "generate_fission_keywords",
    "generate_fission_keywords_for_label",
    "split_search_keywords",
]
