"""搜索 API 流标题预过滤判定函数测试。"""
from __future__ import annotations

from boss_zhipin.website_oper.dispatch.search_api_flow import _can_prescreen_by_title


def test_pure_title_scope_allows_prescreen():
    filters = {
        "title": {
            "any": {"enabled": True, "scope": "title", "match": "contains", "keywords": ["ai agent"]},
            "exclude": {"enabled": True, "scope": "title", "match": "contains", "keywords": ["销售"]},
        }
    }
    assert _can_prescreen_by_title(filters) is True


def test_card_only_scopes_allow_prescreen():
    filters = {
        "company": {"required": {"enabled": True, "scope": "company", "keywords": ["腾讯"]}},
        "location": {"any": {"enabled": True, "scope": "location", "keywords": ["深圳"]}},
    }
    assert _can_prescreen_by_title(filters) is True


def test_description_scope_blocks_prescreen():
    filters = {
        "title": {"any": {"enabled": True, "scope": "title_description", "keywords": ["分布式"]}},
    }
    assert _can_prescreen_by_title(filters) is False


def test_all_scope_blocks_prescreen():
    filters = {
        "title": {"any": {"enabled": True, "scope": "all", "keywords": ["go"]}},
    }
    assert _can_prescreen_by_title(filters) is False


def test_empty_filters_allow_prescreen():
    assert _can_prescreen_by_title({}) is True


def test_disabled_rule_ignored():
    filters = {
        "title": {"any": {"enabled": False, "scope": "description", "keywords": ["x"]}},
    }
    assert _can_prescreen_by_title(filters) is True