"""Smart 意图分层匹配测试（2026-10-13 匹配算法重做）。

用例来源：用户实测怒吼清单——"AI Agent 的实习工程师 / AI Agent 的开发
实习生 / AI Agent 工程师（暑期实习生）/ AI应用开发工程师 / 大模型应用
实习生 / AI 产品培训生都应该投，一个都不许错过"。

旧的 regex 整串匹配把这些全杀了（150 扫 138 规则不匹配）。
"""

from __future__ import annotations

from boss_zhipin.config.filter_rules import match_posting
from boss_zhipin.config.intent_lexicon import classify_text, parse_intent
from boss_zhipin.config.rule_models import JobPosting

# 用户画像 gui-default.yml 的 smart any 规则（2026-10-13 迁移后）
SMART_FILTERS = {
    "title": {
        "any": {
            "enabled": True,
            "scope": "title",
            "match": "smart",
            "keywords": ["AI agent 实习"],
        },
        "exclude": {
            "enabled": True,
            "scope": "title",
            "match": "contains",
            "keywords": ["销售", "客服", "劳务派遣", "外包", "培训讲师", "培训机构", "招生", "课程顾问"],
        },
    }
}


def _posting(title: str) -> JobPosting:
    return JobPosting(title=title)


# ---------------------------------------------------------------------------
# 用户点名的岗位：全部必须投
# ---------------------------------------------------------------------------

MUST_MATCH = [
    ("AI Agent 实习工程师", "L1", "完整串命中，最高层"),
    ("AI Agent开发实习生", "L1", "agent 和实习之间隔了开发（用户点名被误杀）"),
    ("AI Agent 工程师（暑期实习生）", "L1", "隔了 工程师（暑期（用户点名被误杀）"),
    ("AI Agent应用开发工程师", "L2", "强方向、无实习（用户明确要投）"),
    ("大模型应用实习生", "L3", "同族方向+性质（用户点名被误杀）"),
    ("AIGC算法实习生", "L3", "同族方向+性质"),
    ("AI应用开发工程师", "L4", "泛方向（用户明确要投）"),
    ("人工智能训练师实习生", "L3", "同族方向+性质"),
    ("机器学习平台开发（暑期实习）", "L3", "同族方向+性质"),
]

MUST_SKIP = [
    ("Java开发实习生", "方向不符（Java 非 AI 族）"),
    ("Web前端工程师", "方向不符"),
    ("销售专员", "exclude 命中"),
    ("客服专员", "exclude 命中"),
    ("某培训机构课程顾问", "exclude 命中"),
    # 课程顾问 = 教育机构销售岗（2026-10-13 实测漏网：exclude 收窄后
    # "AI培训方向"字样绕过"培训机构"——补"课程顾问"堵住，且不伤管培生）
    ("课程顾问（AI培训方向）", "exclude 命中（课程顾问）"),
]

# 用户特批：培训生/管培生是好岗位，exclude 从裸"培训"改成"培训讲师/
# 培训机构/招生"后，这些必须能投（旧 exclude 会误杀）
MUST_MATCH_AFTER_EXCLUDE_FIX = [
    "AI产品培训生",
    "管理培训生（AI方向）",
]


def test_smart_matches_all_user_named_jobs():
    """用户点名的每个岗位都必须投，且 reason 里写明分层。"""
    for title, expect_layer, why in MUST_MATCH:
        result = match_posting(_posting(title), SMART_FILTERS)
        assert result.matched, f"应投却被跳过: {title}（{why}）"
        assert expect_layer in result.reason, (
            f"{title}: 期望层级 {expect_layer}，实际 reason={result.reason}"
        )


def test_smart_skips_irrelevant_and_excluded():
    for title, why in MUST_SKIP:
        result = match_posting(_posting(title), SMART_FILTERS)
        assert not result.matched, f"不应投却投了: {title}（{why}）"


def test_exclude_fix_unblocks_trainee_positions():
    """exclude 从裸「培训」收敛为「培训讲师/培训机构/招生」后，管培生/
    培训生不再被误杀（用户明确：AI 产品培训生也投）。"""
    for title in MUST_MATCH_AFTER_EXCLUDE_FIX:
        result = match_posting(_posting(title), SMART_FILTERS)
        assert result.matched, f"培训生岗位被误杀: {title}（用户明确要投）"


def test_smart_layer_reasons_are_explainable():
    """reason 必须带 L1-L4 分层说明（投递日志可解释性）。"""
    result = match_posting(_posting("AI Agent开发实习生"), SMART_FILTERS)
    assert result.matched
    assert "L1" in result.reason and "完整意图" in result.reason


def test_smart_falls_back_to_contains_for_unknown_direction():
    """未收录词族的方向（如 嵌入式）退化为 contains——扩展只增强不缩小。"""
    filters = {
        "title": {
            "any": {
                "enabled": True,
                "scope": "title",
                "match": "smart",
                "keywords": ["嵌入式 实习"],
            }
        }
    }
    assert match_posting(_posting("嵌入式软件开发实习生"), filters).matched
    assert match_posting(_posting("嵌入式硬件工程师"), filters).matched
    assert not match_posting(_posting("Java后端工程师"), filters).matched


def test_smart_multi_keyword_any_semantics():
    """多关键词 any：任一意图命中即投。"""
    filters = {
        "title": {
            "any": {
                "enabled": True,
                "scope": "title",
                "match": "smart",
                "keywords": ["AI agent 实习", "测试 开发"],
            }
        }
    }
    assert match_posting(_posting("AI Agent开发实习生"), filters).matched
    assert match_posting(_posting("测试开发工程师"), filters).matched
    assert not match_posting(_posting("产品经理"), filters).matched


def test_parse_intent_structure():
    intent = parse_intent("AI agent 实习")
    assert intent["direction"] == "ai agent"
    assert intent["has_nature"] is True
    assert intent["lexicon"] is not None
    # 性质词全剥离后 direction 不含"实习"
    assert "实习" not in intent["direction"]


def test_parse_intent_direction_with_job_suffix():
    """带职位后缀的输入（AI Agent 实习工程师）也能认亲词族。"""
    intent = parse_intent("AI Agent 实习工程师")
    assert intent["lexicon"] is not None
    hit, layer = classify_text("AI Agent开发实习生", intent)
    assert hit and "L1" in layer


def test_classify_text_layers():
    intent = parse_intent("AI agent 实习")
    assert classify_text("AI Agent 实习工程师", intent)[1].startswith("L1")
    assert classify_text("AI Agent平台开发", intent)[1].startswith("L2")
    assert classify_text("大模型应用实习生", intent)[1].startswith("L3")
    assert classify_text("AI产品经理", intent)[1].startswith("L4")
    assert not classify_text("Java后端实习生", intent)[0]
