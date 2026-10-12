"""关键词裂变轮转测试（2026-10-13 三阶段引擎·机制一）。"""
from __future__ import annotations

import random

from boss_zhipin.config.query_fission import generate_fission_keywords


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
