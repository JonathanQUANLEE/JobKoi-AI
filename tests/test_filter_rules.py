from __future__ import annotations

import pytest

from boss_zhipin.config.filter_rules import (
    FilterConfigError,
    JobPosting,
    explain_posting_match,
    match_posting,
    match_rule_group,
)


def _job(**overrides) -> JobPosting:
    data = {
        "title": "AI后端开发实习生",
        "company": "深圳相一智能科技",
        "location": "深圳",
        "salary": "200-300/天",
        "tags": ["Python", "MySQL"],
        "boss_name": "杨先生",
        "boss_active_status": "刚刚活跃",
        "education": "本科",
        "description": "负责 API 开发与数据库读写，欢迎大三实习。",
        "detail_url": "https://example.test/job/1",
    }
    data.update(overrides)
    return JobPosting(**data)


def test_required_rule_requires_every_keyword():
    result = match_rule_group(
        _job(),
        {
            "enabled": True,
            "scope": "title",
            "match": "contains",
            "keywords": ["AI", "实习"],
        },
    )

    assert result.matched is True
    assert result.matched_keywords == ["AI", "实习"]


def test_any_rule_accepts_one_keyword():
    result = match_rule_group(
        _job(title="后端开发实习生"),
        {
            "enabled": True,
            "scope": "title",
            "match": "contains",
            "keywords": ["Go", "后端开发"],
        },
        require_all=False,
    )

    assert result.matched is True
    assert result.matched_keywords == ["后端开发"]


def test_disabled_rule_group_is_ignored():
    result = match_posting(
        _job(title="销售实习生"),
        {
            "title": {
                "required": {"enabled": False, "keywords": ["后端开发"]},
            }
        },
    )

    assert result.matched is True
    assert result.stage == "matched"


def test_exclude_wins_before_positive_rules():
    result = match_posting(
        _job(title="后端开发实习生 销售系统"),
        {
            "title": {
                "exclude": {"enabled": True, "keywords": ["销售"]},
                "required": {"enabled": True, "keywords": ["实习"]},
                "any": {"enabled": True, "keywords": ["后端开发"]},
            }
        },
    )

    assert result.matched is False
    assert result.stage == "exclude"
    assert "销售" in result.reason


def test_regex_is_case_insensitive_by_default():
    result = match_rule_group(
        _job(title="AI全栈开发实习生"),
        {
            "enabled": True,
            "scope": "title",
            "match": "regex",
            "keywords": [r"ai.*实习"],
        },
    )

    assert result.matched is True
    assert result.matched_keywords == [r"ai.*实习"]


def test_exact_match_requires_whole_scope_text():
    result = match_rule_group(
        _job(title="后端开发实习生"),
        {
            "enabled": True,
            "scope": "title",
            "match": "exact",
            "keywords": ["后端开发"],
        },
    )

    assert result.matched is False


def test_scope_defaults_to_title():
    result = match_rule_group(
        _job(title="后端开发实习生", description="销售客服"),
        {
            "enabled": True,
            "match": "contains",
            "keywords": ["销售"],
        },
    )

    assert result.matched is False


def test_all_scope_combines_structured_fields():
    result = match_rule_group(
        _job(company="广州脉德柯斯技术", location="深圳宝安区"),
        {
            "enabled": True,
            "scope": "all",
            "match": "contains",
            "keywords": ["深圳宝安区", "广州脉德柯斯技术"],
        },
    )

    assert result.matched is True


def test_title_description_scope_combines_only_title_and_description():
    result = match_rule_group(
        _job(
            title="后端开发实习生",
            description="负责 RAG 应用开发",
            company="AI 科技公司",
            location="深圳",
        ),
        {
            "enabled": True,
            "scope": "title_description",
            "match": "contains",
            "keywords": ["后端开发", "RAG"],
        },
    )

    assert result.matched is True
    assert result.matched_keywords == ["后端开发", "RAG"]

    company_result = match_rule_group(
        _job(
            title="后端开发实习生",
            description="负责接口开发",
            company="AI 科技公司",
            location="深圳",
        ),
        {
            "enabled": True,
            "scope": "title_description",
            "match": "contains",
            "keywords": ["AI 科技公司"],
        },
    )

    assert company_result.matched is False


def test_invalid_regex_reports_config_error():
    with pytest.raises(FilterConfigError, match="正则"):
        match_rule_group(
            _job(),
            {
                "enabled": True,
                "scope": "title",
                "match": "regex",
                "keywords": ["["],
            },
        )


def test_match_posting_reports_required_failure():
    result = match_posting(
        _job(title="后端开发工程师"),
        {
            "title": {
                "required": {"enabled": True, "keywords": ["实习"]},
                "any": {"enabled": True, "keywords": ["后端开发"]},
            }
        },
    )

    assert result.matched is False
    assert result.stage == "required"
    assert "实习" in result.reason


def test_explain_posting_match_reports_chinese_keyword_details():
    result = explain_posting_match(
        _job(title="AI开发实习生"),
        {
            "title": {
                "required": {"enabled": True, "scope": "title", "keywords": ["实习"]},
                "any": {
                    "enabled": True,
                    "scope": "title",
                    "keywords": ["后端开发", "AI", "RAG"],
                },
                "exclude": {"enabled": True, "scope": "title", "keywords": ["销售"]},
            }
        },
    )

    assert result["matched"] is True
    assert result["scope"] == "title"
    assert result["scope_label"] == "只看岗位名称"
    assert result["required"]["matched"] == ["实习"]
    assert result["any"]["matched"] == ["AI"]
    assert result["any"]["missing"] == ["后端开发", "RAG"]
    assert result["exclude"]["matched"] == []
    assert "命中必须关键词「实习」" in result["explanation"]
    assert "方向关键词「AI」" in result["explanation"]


def test_explain_posting_match_keeps_multiple_scope_groups():
    result = explain_posting_match(
        _job(title="AI开发实习生", boss_active_status="刚刚活跃"),
        {
            "title": {
                "required": {"enabled": True, "scope": "title", "keywords": ["实习"]},
                "any": {"enabled": True, "scope": "title", "keywords": ["AI"]},
            },
            "boss_active": {
                "any": {
                    "enabled": True,
                    "scope": "boss",
                    "keywords": ["今日活跃", "刚刚活跃"],
                }
            },
        },
    )

    assert result["matched"] is True
    assert "只看岗位名称命中必须关键词「实习」" in result["explanation"]
    assert "BOSS 信息命中方向关键词「刚刚活跃」" in result["explanation"]
