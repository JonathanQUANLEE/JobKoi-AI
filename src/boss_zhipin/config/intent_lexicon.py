"""Smart 意图分层匹配的词族表与意图解析（2026-10-13 重做匹配算法）。

背景（用户实测怒吼）：旧匹配把 "AI agent 实习" 当一整串正则——标题必须
连续出现这五个字符才投，导致 "AI Agent开发实习生" / "AI Agent 工程师
（暑期实习生）" / "大模型应用实习生" 全被误杀（150 扫 138 规则不匹配）。

业界做法（调研依据）：
- LinkedIn《Learning to Retrieve for Job Matching》(arxiv 2402.13435)：
  把 query 解析成标准化实体（职位/技能/地点）+ 查询扩展（Query
  Expansion），绝不拿原始串做精确匹配；
- Job MatchAI (arxiv 2603.14558)：第一阶段 Query Enrichment——把用户
  输入先做词法扩展再检索。

本模块的落地形态——**方向×性质 二元意图 + 分层降级**（用户原话
"一步一步往下求其次"）：
1. 把关键词解析成「方向核心 + 性质标记」："AI agent 实习" →
   方向 "AI agent"（命中实习词族被剥离）+ has_nature=True；
2. 方向核心查内置方向词族表（当前内置 AI/Agent 领域，含精确变体与
   同族扩展）；未收录的方向退化为 contains——**扩展只增强不缩小**，
   任何输入都不会比 contains 更漏；
3. 分层判定（层级写进 reason，投递日志可解释）：
   - L1 完整意图：Tier1 方向命中 AND 性质词命中
   - L2 强方向：Tier1 方向命中
   - L3 同族+性质：泛方向词族命中 AND 性质词命中
   - L4 泛方向：泛方向词族命中
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# 性质词族（求职领域通用，任何方向输入都适用）
# ---------------------------------------------------------------------------

# 命中即视为"求职性质"约束（实习/校招/应届类）。剥离后剩余部分作为方向核心。
NATURE_PATTERNS: tuple[str, ...] = (
    "实习生", "实习", "暑期", "寒期", "寒假", "暑假",
    "校招", "校园招聘", "应届", "全职实习",
    "Intern", "Trainee", "管培生", "管理培训生", "培训生",
    "见习", "学徒", "兼职",
)

# ---------------------------------------------------------------------------
# 方向词族表（方向核心 → 分层词族）。当前内置 AI/Agent 领域——
# 用户当前求职方向；新增领域在此加条目即可，无词族的方向自动退化
# contains（见 parse_intent 注释）。
# ---------------------------------------------------------------------------

_DIRECTION_LEXICON: dict[str, dict[str, tuple[str, ...]]] = {
    "ai agent": {
        # Tier1：意图方向的精确变体（最强命中）
        "tier1": (
            "AI Agent", "AIAgent", "AI-Agent", "AI_Agent",
            "Agent开发", "Agent工程", "Agent应用", "Agent平台",
            "智能体", "AI智能体",
        ),
        # 泛方向：同族大方向词（L3/L4 层）。裸 "AI" 用词边界匹配
        # （_WORD_BOUNDARY_PATTERNS），覆盖"AI产品/AI方向/AI训练师"等
        # 一切含 AI 前缀的岗位——用户明确"跟 AI 相关的都投"。
        "pan": (
            "AI",
            "人工智能", "机器学习", "深度学习", "大模型", "LLM",
            "AIGC", "NLP", "多模态", "GPT", "生成式", "智能体",
            "AI应用", "AI开发", "AI工程", "AI算法", "AI产品", "AI训练",
        ),
    },
    # "ai" 单独输入时同样享受 AI 泛方向的分层（用户海投倾向："输个 AI，
    # 只要是跟 AI 相关的都能做"）
    "ai": {
        "tier1": ("AI",),
        "pan": (
            "人工智能", "机器学习", "深度学习", "大模型", "LLM",
            "AIGC", "NLP", "多模态", "GPT", "生成式", "智能体",
            "AI Agent", "AI应用", "AI开发", "AI工程", "AI算法",
        ),
    },
}

# 泛方向里需要词边界匹配的英文缩写（避免 "AI" 误伤 "said" / "GPT" 误伤
# "GPTs网站正文" 等极端情况——标题场景基本安全，但严谨为本）
_WORD_BOUNDARY_PATTERNS = ("AI", "LLM", "NLP", "GPT", "AIGC")


def _contains_ci(text: str, needle: str) -> bool:
    """大小写不敏感的 contains。"""
    return needle.lower() in text.lower()


def _squash_ws(text: str) -> str:
    """去掉全部空白（中文标题无空格习惯，用户输入常带空格——归一后比较）。"""
    return re.sub(r"\s+", "", text or "")


def _matches_term(text: str, term: str) -> bool:
    """单个词族词条对标题的命中判定。

    - 英文缩写词（AI/LLM/NLP/GPT/AIGC）用「前后非英文字母」lookaround：
      不能用 \\b——中文在 unicode 正则里也算 \\w，"AI方向"会被 \\bAI\\b
      拒判（2026-10-13 实测踩坑）。lookaround 只挡英文单词内误伤
      （said/GPTs），中文前后缀（AI方向/AI产品）正常命中；
    - 其余词条两侧空白归一后 contains（"AI Agent" 命中 "AI  Agent" 等
      一切空格排版——中文页面的空格排版极随意；连写变体由词族表内
      "AIAgent" 等词条单独覆盖）。
    """
    if term in _WORD_BOUNDARY_PATTERNS:
        escaped = re.escape(term)
        try:
            pattern = rf"(?<![a-zA-Z]){escaped}(?![a-zA-Z])"
            return re.search(pattern, text, re.IGNORECASE) is not None
        except re.error:
            return _contains_ci(_squash_ws(text), _squash_ws(term))
    return _contains_ci(_squash_ws(text), _squash_ws(term))


def parse_intent(keyword: str) -> dict:
    """把用户关键词解析成意图结构。

    Returns::
        {
            "raw": 原始关键词,
            "direction": 剥离性质词后的方向核心（小写）,
            "has_nature": 是否含性质词,
            "nature_hits": [命中的性质词],
            "lexicon": {"tier1": (...), "pan": (...)} | None（未收录方向）,
        }
    """
    raw = (keyword or "").strip()
    low = raw.lower()
    nature_hits = [p for p in NATURE_PATTERNS if _matches_term(low, p)]
    direction = low
    for p in nature_hits:
        direction = direction.replace(p.lower(), " ")
    direction = re.sub(r"\s+", " ", direction).strip()
    # 性质词全剥离后没有剩余（如关键词就是"实习"）→ 方向为空，只按性质判定
    lexicon = None
    if direction:
        lexicon = _DIRECTION_LEXICON.get(direction)
        if lexicon is None:
            # "AI Agent 实习工程师"这种带职位后缀的输入：再做一次前缀探测
            # （词族表 key 的所有词条都出现在方向里即认亲，如 "ai agent 实习工程师"
            # 含 "ai agent"）
            for key, fam in _DIRECTION_LEXICON.items():
                if key in direction:
                    lexicon = fam
                    break
    return {
        "raw": raw,
        "direction": direction,
        "has_nature": bool(nature_hits),
        "nature_hits": nature_hits,
        "lexicon": lexicon,
    }


def classify_text(text: str, intent: dict) -> tuple[bool, str]:
    """对一段文本（岗位标题等）按意图做分层判定。

    Returns::
        (matched, layer_reason)：
        - (True, "L1 完整意图匹配（AI Agent × 实习）") 等分层说明
        - (False, "未命中方向词族：…") 等不命中原因
    """
    if not text:
        return False, "匹配文本为空"
    nature_ok = any(_matches_term(text, p) for p in intent["nature_hits"])
    lexicon = intent["lexicon"]

    # 方向核心未收录词族 → 退化为 contains（扩展只增强不缩小：任何输入
    # 都不会比 contains 更漏；性质词命中时降为非强制加分项）。
    # 空白归一：中文岗位标题不打空格（"测试开发工程师"），而用户输入
    # 常带空格（"测试 开发"）——两边都去掉全部空白再 contains，才匹配得上。
    if lexicon is None:
        direction = intent["direction"]
        if not direction:
            # 关键词只有性质词（如"实习"）→ 命中性质即投
            if nature_ok:
                return True, f"L2 方向匹配（性质词：{'/'.join(intent['nature_hits'])}）"
            return False, "关键词无可解析的方向或性质词"
        if _contains_ci(_squash_ws(text), _squash_ws(direction)):
            if nature_ok:
                return True, f"L1 完整意图匹配（{direction} × {'/'.join(intent['nature_hits'])}）"
            return True, f"L2 方向匹配（{direction}）"
        return False, f"未命中方向词：{direction}"

    tier1_hit = next((t for t in lexicon["tier1"] if _matches_term(text, t)), None)
    pan_hit = next((t for t in lexicon["pan"] if _matches_term(text, t)), None)

    if tier1_hit and nature_ok:
        return True, f"L1 完整意图匹配（{tier1_hit} × {'/'.join(intent['nature_hits'][:2])}）"
    if tier1_hit:
        return True, f"L2 强方向匹配（{tier1_hit}）"
    if pan_hit and nature_ok:
        return True, f"L3 同族匹配（{pan_hit} × {'/'.join(intent['nature_hits'][:2])}）"
    if pan_hit:
        return True, f"L4 泛方向匹配（{pan_hit}）"
    return False, f"未命中方向词族（{intent['direction']}）"


__all__ = [
    "NATURE_PATTERNS",
    "classify_text",
    "parse_intent",
]
