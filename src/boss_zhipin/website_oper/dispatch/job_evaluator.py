"""岗位条件评估器（根据 profile/scan/review/auto 条件计算岗位匹配结果）。"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


def evaluate_job_match(
    job: Any,
    job_description: str,
    job_title: str,
    *,
    profile_filters: dict[str, Any],
    boss_active_filter_enabled: bool,
    scan_only: bool,
    scan_required_terms: list[str],
    scan_groups: list[list[str]],
    auto_send_fixed_greeting: bool,
    review_before_send: bool,
    review_required_terms: list[str],
    review_locations: list[str],
) -> tuple[bool, str, str, dict[str, Any]]:
    """评估候选岗位是否命中条件。

    返回 (matched, reason, stage_name, details)
    """
    from boss_zhipin.website_oper import write_response

    if profile_filters:
        filter_posting = write_response._to_filter_posting(job, job_description)
        effective_profile_filters = profile_filters
        boss_active_missing = boss_active_filter_enabled and not filter_posting.boss_active_status
        if boss_active_missing:
            effective_profile_filters = write_response._filter_rules_without_boss_active(
                profile_filters
            )
        profile_match = write_response.match_posting(
            filter_posting,
            effective_profile_filters,
        )
        match_explanation = write_response.explain_posting_match(
            filter_posting,
            effective_profile_filters,
        )
        details = {
            **match_explanation,
            "stage": "profile_filter",
            "reason": profile_match.reason,
            "matched_keywords": profile_match.matched_keywords,
            "missing_keywords": profile_match.missing_keywords,
            "job_title": job_title,
        }
        if boss_active_missing:
            details["boss_active_status"] = ""
            details["boss_active_note"] = (
                "页面未采集到 BOSS 活跃状态，已跳过活跃状态限制，只按岗位规则判断。"
            )
        return profile_match.matched, profile_match.reason, "profile_filter", details

    if scan_only:
        term_ok, term_reason = write_response._matches_required_terms(
            job_description, scan_required_terms
        )
        if not term_ok:
            apply = False
            reason = term_reason
        else:
            apply, reason = write_response._matches_all_groups(job_description, scan_groups)
        details = {"stage": "scan_only", "reason": reason}
        return apply, reason, "scan_only", details

    if auto_send_fixed_greeting:
        apply, reason = write_response._matches_auto_send_job(
            title=job_title,
            description=job_description,
        )
        details = {
            "stage": "auto_send_fixed_greeting",
            "reason": reason,
            "matched_keywords": [],
            "job_title": job_title,
        }
        return apply, reason, "auto_send_filter", details

    if review_before_send:
        term_ok, term_reason = write_response._matches_required_terms(
            job_description, review_required_terms
        )
        if not term_ok:
            return (
                False,
                term_reason,
                "required_terms",
                {"stage": "required_terms", "reason": term_reason},
            )

        location_ok, location_reason = write_response._matches_all_groups(
            job_description, [review_locations]
        )
        if not location_ok:
            return (
                False,
                location_reason,
                "required_location",
                {"stage": "required_location", "reason": location_reason},
            )

        details = {
            "stage": "review",
            "reason": "命中审核模式本地条件",
            "matched_keywords": [],
            "job_title": job_title,
        }
        return True, "命中审核模式本地条件", "review", details

    return False, "未配置任何筛选规则", "none", {}
