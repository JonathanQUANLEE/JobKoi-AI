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


def split_search_keywords(raw: str) -> list[str]:
    """把「目标职位」输入切分成关键词列表（纯函数）。

    - "AI应用工程师, AI agent实习," → ["AI应用工程师", "AI agent实习"]
    - "AI应用工程师、大模型；NLP" → 三词（支持中文顿号/分号）
    - 单关键词（内部含空格/斜杠）原样返回：["AI agent 实习"]
    - 空串/全分隔符 → []
    """
    parts = [p.strip() for p in _LABEL_SEPARATORS_RE.split((raw or "").strip())]
    return [p for p in parts if p]


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
