"""关键词裂变轮转测试（2026-10-13 三阶段引擎·机制一 + 2026-10-15 多岗位切分）。"""
from __future__ import annotations

import random

from boss_zhipin.config.query_fission import (
    generate_fission_keywords,
    generate_fission_keywords_for_label,
    split_search_keywords,
)


def test_empty_base_returns_empty():
    assert generate_fission_keywords("") == []
    assert generate_fission_keywords("   ") == []


def test_unknown_direction_degrades_to_base_only():
    """零回归：未收录方向（水利水电）只搜原词，行为与历史一致。"""
    assert generate_fission_keywords("水利水电实习") == ["水利水电实习"]


def test_base_keyword_always_first():
    kws = generate_fission_keywords("AI agent 实习", rng=random.Random(42))
    assert kws[0] == "AI agent 实习"
    assert len(kws) >= 2


def test_known_direction_fissions_into_three_buckets():
    """AI agent 方向裂变出 精准/技术栈/泛生态 三桶词（固定 rng + 大 cap 保确定性）。"""
    kws = generate_fission_keywords("AI agent 实习", max_terms=30, rng=random.Random(1))
    joined = " ".join(kws)
    # 精准桶：智能体（tier1 变体，带实习后缀）
    assert "智能体 实习" in kws
    # 技术栈桶：RAG / LangChain / Prompt工程
    assert "RAG 实习" in kws and "LangChain 实习" in kws and "Prompt工程 实习" in kws
    # 泛生态桶：大模型 / 机器学习（pan 词条）
    assert "大模型 实习" in kws and "机器学习 实习" in kws
    # 全部带性质后缀（基准词含"实习"）
    assert all(kw.endswith("实习") for kw in kws)
    assert "智能体 实习" in joined


def test_nature_suffix_absent_when_base_has_no_nature():
    kws = generate_fission_keywords("AI agent", rng=random.Random(7))
    assert kws[0] == "AI agent"
    # 无性质词 → 裂变词不拼"实习"
    assert all(not kw.endswith("实习") for kw in kws)


def test_no_duplicates_and_respects_cap():
    kws = generate_fission_keywords("AI agent 实习", max_terms=5, rng=random.Random(3))
    assert len(kws) == 6  # base + 5
    assert len(set(kws)) == len(kws)
    # base 不会因大小写变体重复
    lower_set = {kw.lower() for kw in kws}
    assert len(lower_set) == len(kws)


def test_rotation_shuffles_order_across_runs():
    """轮转：不同 rng 种子产出不同顺序（每天搜的词序不一样）。"""
    a = generate_fission_keywords("AI agent 实习", rng=random.Random(1))
    b = generate_fission_keywords("AI agent 实习", rng=random.Random(2))
    assert a[0] == b[0] == "AI agent 实习"
    assert a != b  # 除基准词外顺序随机


def test_plain_ai_direction_also_fissions():
    kws = generate_fission_keywords("AI 实习", max_terms=30, rng=random.Random(5))
    assert kws[0] == "AI 实习"
    assert len(kws) >= 3
    assert "机器学习 实习" in kws


# ---------- 多岗位输入切分（2026-10-15：目标职位一次输入多个岗位） ----------


def test_split_search_keywords_basic_comma():
    assert split_search_keywords("AI应用工程师, AI agent实习,") == [
        "AI应用工程师",
        "AI agent实习",
    ]


def test_split_search_keywords_chinese_separators():
    """顿号/分号/换行都是合法分隔符（中文输入习惯）。"""
    assert split_search_keywords("AI应用工程师、大模型；NLP\nRAG") == [
        "AI应用工程师",
        "大模型",
        "NLP",
        "RAG",
    ]


def test_split_search_keywords_keeps_single_keyword_intact():
    """单关键词内部的空格/斜杠绝不能切开（"AI agent 实习" 是一个岗位名）。"""
    assert split_search_keywords("AI agent 实习") == ["AI agent 实习"]
    assert split_search_keywords("AI/算法工程师") == ["AI/算法工程师"]


def test_split_search_keywords_empty_and_garbage():
    assert split_search_keywords("") == []
    assert split_search_keywords(",, 、；") == []


# ---------- 空格智能切词兜底（2026-10-17：空格输入习惯 0 结果事故） ----------


def test_split_space_separated_mixed_roles():
    """PRD 经典案例：混合拉丁+中文后缀的长串按岗位短语切开。"""
    assert split_search_keywords("AI Agent 实习 AI Agent AI 应用工程师") == [
        "AI Agent 实习",
        "AI Agent",
        "AI 应用工程师",
    ]


def test_split_space_separated_liberal_arts_roles():
    """PRD 文科案例：销售/销售管理/客户经理 各自成词。"""
    assert split_search_keywords("销售 销售管理 客户经理") == [
        "销售",
        "销售管理",
        "客户经理",
    ]


def test_split_space_separated_two_simple_roles():
    assert split_search_keywords("Java 开发 Python 后端") == [
        "Java 开发",
        "Python 后端",
    ]


def test_split_single_multiword_role_still_intact():
    """零回归：单个含空格岗位名（无第二个收口词）原样保留。"""
    assert split_search_keywords("AI agent 实习") == ["AI agent 实习"]
    assert split_search_keywords("资深 算法工程师") == ["资深 算法工程师"]
    assert split_search_keywords("AI Agent") == ["AI Agent"]


def test_split_explicit_separator_wins_over_smart_split():
    """显式分隔符多段：完全尊重用户意图，段内不再二次猜测。"""
    assert split_search_keywords("AI agent 实习, 水利水电实习") == [
        "AI agent 实习",
        "水利水电实习",
    ]


def test_split_slash_never_splits():
    """斜杠从不作为切分依据（"AI/算法工程师" 是一个岗位名）。"""
    assert split_search_keywords("AI/算法工程师") == ["AI/算法工程师"]


def test_fission_for_label_splits_and_fissions_each():
    """多岗位逐词裂变：两个基准词都保留，各自带变体，无逗号整串残留。"""
    kws = generate_fission_keywords_for_label(
        "AI agent 实习, 水利水电实习", rng=random.Random(42)
    )
    assert "AI agent 实习" in kws
    assert "水利水电实习" in kws  # 未收录方向安全降级为只搜原词
    assert len(kws) >= 3  # 已收录方向带出变体
    assert all("," not in kw for kw in kws)


def test_fission_for_label_single_keyword_equals_legacy():
    """零回归：单关键词输入与旧 generate_fission_keywords 完全等价。"""
    raw = "AI agent 实习"
    legacy = generate_fission_keywords(raw, rng=random.Random(7))
    new = generate_fission_keywords_for_label(raw, rng=random.Random(7))
    assert new == legacy


def test_fission_for_label_dedupes_across_keywords():
    """同族关键词的裂变变体去重（"AI agent" 与 "AI" 的 pan 桶大量重叠）。"""
    kws = generate_fission_keywords_for_label(
        "AI agent 实习, AI 实习", rng=random.Random(1)
    )
    assert len(kws) == len(set(kws))
    assert "AI agent 实习" in kws and "AI 实习" in kws
