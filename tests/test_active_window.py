"""活跃窗口（三阶段引擎·机制三 2026-10-13）测试。

覆盖：
1. wapi 卡片 → JobPosting 的活跃状态映射（activeTimeDesc 优先 /
   bossOnline 隐含展开 / 双缺失空串）；
2. 合并后的 boss_active OR 规则对三梯队的判定（在线放行、本周活跃
   按用户选值杀、缺状态降级放行）；
3. boss 作用域不阻塞标题预过滤（prescreen 仍可走卡片快通道）。
"""
from __future__ import annotations

from boss_zhipin.config.filter_rules import match_posting
from boss_zhipin.config.rule_models import JobPosting
from boss_zhipin.website_oper.dispatch.env_config import (
    _filter_rules_without_boss_active,
    _merge_boss_active_filter,
)
from boss_zhipin.website_oper.dispatch.search_api_flow import _can_prescreen_by_title
from boss_zhipin.website_oper.job_api import ApiJob, to_job_posting


def _api_job(**overrides) -> ApiJob:
    fields = dict(
        job_name="AI Agent 实习工程师",
        encrypt_job_id="abc123",
        brand_name="某公司",
        city="深圳",
        area_district="南山",
        business_district="科技园",
        salary_desc="200-300/天",
        job_labels=(),
        skills=(),
        job_degree="本科",
        boss_name="张 HR",
        boss_online=False,
    )
    fields.update(overrides)
    return ApiJob(**fields)


def _title_filters() -> dict:
    """gui-default.yml 的标题规则（smart any + contains exclude）。"""
    return {
        "title": {
            "any": {
                "enabled": True,
                "scope": "title",
                "match": "smart",
                "keywords": ["AI agent 实习"],
            },
        },
    }


def _page_filters_with_active(values: list[str]) -> dict:
    return {
        "boss_active": {"enabled": True, "values": values},
    }


# ---------------------------------------------------------------------------
# 1. wapi 卡片活跃状态映射
# ---------------------------------------------------------------------------

def test_active_time_desc_takes_priority():
    job = to_job_posting(_api_job(active_time_desc="本周活跃"))
    assert job.boss_active_status == "本周活跃"


def test_boss_online_expands_to_implied_tiers():
    """在线 = 此刻在招，隐含"至少今日活跃"——对任一梯队选值都应放行。"""
    job = to_job_posting(_api_job(boss_online=True))
    status = job.boss_active_status
    assert "在线" in status and "刚刚活跃" in status and "今日活跃" in status


def test_missing_status_is_empty_string():
    job = to_job_posting(_api_job())
    assert job.boss_active_status == ""


# ---------------------------------------------------------------------------
# 2. 合并后的活跃 OR 规则判定
# ---------------------------------------------------------------------------

def _merged_filters(values: list[str]) -> dict:
    return _merge_boss_active_filter(_title_filters(), _page_filters_with_active(values))


def test_online_boss_passes_first_tier_values():
    filters = _merged_filters(["刚刚活跃", "今日活跃", "3日内活跃"])
    posting = to_job_posting(_api_job(boss_online=True))
    assert match_posting(posting, filters).matched


def test_stale_weekly_active_is_filtered_by_first_tier():
    """本周活跃岗位在第一/二梯队选值下被杀——不浪费每日额度。"""
    filters = _merged_filters(["刚刚活跃", "今日活跃", "3日内活跃"])
    posting = to_job_posting(_api_job(active_time_desc="本周活跃"))
    result = match_posting(posting, filters)
    assert not result.matched
    assert "boss" in result.stage or "any" in result.stage


def test_weekly_active_passes_when_user_includes_it():
    filters = _merged_filters(["刚刚活跃", "今日活跃", "3日内活跃", "本周活跃"])
    posting = to_job_posting(_api_job(active_time_desc="本周活跃"))
    assert match_posting(posting, filters).matched


def test_missing_status_degrades_gracefully():
    """状态缺失（空串）时按降级规则放行——绝不因"没数据"误杀岗位。"""
    filters = _merged_filters(["刚刚活跃", "今日活跃"])
    posting = to_job_posting(_api_job())  # 无 activeTimeDesc、不在线
    assert posting.boss_active_status == ""
    degraded = _filter_rules_without_boss_active(filters)
    assert "boss_active" not in degraded
    assert match_posting(posting, degraded).matched


def test_merge_without_active_values_keeps_filters_unchanged():
    """画像没启用活跃筛选时，合并是恒等操作（零回归）。"""
    assert _merge_boss_active_filter(_title_filters(), {}) == _title_filters()


# ---------------------------------------------------------------------------
# 3. boss 作用域不阻塞标题预过滤
# ---------------------------------------------------------------------------

def test_boss_scope_still_allows_prescreen():
    assert _can_prescreen_by_title(_merged_filters(["刚刚活跃"])) is True
