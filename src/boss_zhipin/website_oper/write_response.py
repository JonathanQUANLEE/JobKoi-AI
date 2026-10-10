"""单个岗位的主循环：抓 JD → 本地规则筛选 → 发送固定招呼语（Facade 门面）。

本模块为投递流程与业务规则调度的顶层门面，保持对外接口与向后兼容性 100% 不变。
具体实现已解耦到 dispatch/ 子模块：
- ``dispatch.env_config``: 环境变量、限额阈值与筛选规则合并
- ``dispatch.history_logger``: seen/skipped/sent JSONL 落盘与公司级去重
- ``dispatch.rule_matcher``: KeywordPolicy、多组关键词匹配与扫描日志
- ``dispatch.review_flow``: 命令行与 GUI 交互式人工审核流
- ``dispatch.search_api_flow``: 搜索接口直读与详情页投递通道
- ``dispatch.runner_loop``: 巡航投递主循环与重试调度
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import random
import re
from typing import Literal

from boss_zhipin.audit import log_attempt, validate_letter
from boss_zhipin.config.filter_rules import (
    JobPosting as FilterJobPosting,
    explain_posting_match,
    match_posting,
)
from boss_zhipin.gui.events import emit as _emit_progress
from boss_zhipin.website_oper import finding_jobs

from boss_zhipin.website_oper.dispatch.env_config import (
    _auto_send_daily_limit,
    _auto_send_delay_range,
    _auto_send_fixed_greeting_enabled,
    _auto_send_max_sent,
    _boss_active_filter_enabled,
    _boss_active_values,
    _csv_env,
    _filter_rules_without_boss_active,
    _fixed_greeting,
    _float_env,
    _gui_review_enabled,
    _int_env,
    _merge_boss_active_filter,
    _page_filters,
    _page_filters_for_click,
    _profile_filters,
    _profile_name,
    _review_before_send_enabled,
    _scan_max_jobs,
    _scan_only_enabled,
    _send_mode_name,
    _should_select_label,
    _stop_on_captcha_enabled,
    _to_filter_posting,
)
from boss_zhipin.website_oper.dispatch.history_logger import (
    _append_jsonl,
    _has_stable_job_identity,
    _job_payload,
    _job_with_derived_fields,
    _log_seen,
    _log_sent,
    _log_skipped,
    _match_explanation,
    _normalize_company,
    _read_contacted_companies,
    _read_seen_job_keys,
    _sent_today_count,
    _state_path,
    _state_record,
)
from boss_zhipin.website_oper.dispatch.review_flow import (
    _ask_gui_review_decision,
    _ask_review_decision,
)
from boss_zhipin.website_oper.dispatch.rule_matcher import (
    SCAN_MATCH_LOG_PATH,
    KeywordPolicy,
    _auto_required_terms,
    _auto_send_policy,
    _auto_title_keywords,
    _contains_term,
    _log_scan_match,
    _matches_all_groups,
    _matches_auto_send_job,
    _matches_required_terms,
    _review_locations,
    _review_required_terms,
    _scan_groups,
    _scan_required_terms,
)
from boss_zhipin.website_oper.dispatch.runner_loop import (
    _compose_greeting,
    click_contact_and_send_response,
    send_job_descriptions_to_chat,
    send_response_and_go_back,
)
from boss_zhipin.website_oper.dispatch.search_api_flow import (
    _DETAIL_JD_SELECTORS,
    _extract_detail_jd,
    _open_job_detail_page,
    _run_search_api_flow,
    _send_greeting_on_detail_page,
    _use_search_api_flow,
)

log = logging.getLogger(__name__)

__all__ = [
    "FilterJobPosting",
    "KeywordPolicy",
    "SCAN_MATCH_LOG_PATH",
    "_DETAIL_JD_SELECTORS",
    "_append_jsonl",
    "_ask_gui_review_decision",
    "_ask_review_decision",
    "_auto_required_terms",
    "_auto_send_daily_limit",
    "_auto_send_delay_range",
    "_auto_send_fixed_greeting_enabled",
    "_auto_send_max_sent",
    "_auto_send_policy",
    "_auto_title_keywords",
    "_boss_active_filter_enabled",
    "_boss_active_values",
    "_compose_greeting",
    "_contains_term",
    "_csv_env",
    "_emit_progress",
    "_extract_detail_jd",
    "_filter_rules_without_boss_active",
    "_fixed_greeting",
    "_float_env",
    "_gui_review_enabled",
    "_has_stable_job_identity",
    "_int_env",
    "_job_payload",
    "_job_with_derived_fields",
    "_log_scan_match",
    "_log_seen",
    "_log_sent",
    "_log_skipped",
    "_match_explanation",
    "_matches_all_groups",
    "_matches_auto_send_job",
    "_matches_required_terms",
    "_merge_boss_active_filter",
    "_normalize_company",
    "_open_job_detail_page",
    "_page_filters",
    "_page_filters_for_click",
    "_profile_filters",
    "_profile_name",
    "_read_contacted_companies",
    "_read_seen_job_keys",
    "_review_before_send_enabled",
    "_review_locations",
    "_review_required_terms",
    "_run_search_api_flow",
    "_scan_groups",
    "_scan_max_jobs",
    "_scan_only_enabled",
    "_scan_required_terms",
    "_send_greeting_on_detail_page",
    "_send_mode_name",
    "_sent_today_count",
    "_should_select_label",
    "_state_path",
    "_state_record",
    "_stop_on_captcha_enabled",
    "_to_filter_posting",
    "_use_search_api_flow",
    "asyncio",
    "click_contact_and_send_response",
    "explain_posting_match",
    "finding_jobs",
    "log_attempt",
    "match_posting",
    "random",
    "send_job_descriptions_to_chat",
    "send_response_and_go_back",
    "validate_letter",
]
