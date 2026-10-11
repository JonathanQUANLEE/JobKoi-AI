"""nodriver-backed BOSS automation (Facade).

本模块为底层浏览器自动化与页面交互的统一门面（Facade），所有函数保持 async 接口与原签名
100% 兼容。具体实现已高内聚解耦到 core/ 子模块：
- ``core.browser_session``: Chrome 生命周期、Profile 单例锁回收、页面导航与状态读取
- ``core.login_detector``: 登录态 DOM 检测、微信扫码等待与验证码识别
- ``core.page_filter_ctrl``: 页面筛选点击、下拉选择与多城市切批轮询
- ``core.job_card_reader``: 岗位卡片 DOM 解析、JD 文本抽取、去重 key 生成与滚动加载
- ``core.chat_action``: 招呼语发送、发简历点击、留在此页处理与历史回退
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from typing import Any

import nodriver as uc

from boss_zhipin.website_oper.core.process_cleanup import (
    _clear_singleton_locks,
    _kill_profile_chrome,
    _kill_profile_chrome_windows,
    _reap_profile_chrome,
)
from boss_zhipin.website_oper.core.browser_session import (
    CHROME_PROFILE_DIR,
    RECOMMEND_URL,
    _PAGE_IN_URL_RE,
    _start_browser_with_retry,
    browser_type,
    click_next_page_if_present,
    ensure_current_tab,
    get_browser_page_state,
    get_current_url,
    is_browser_alive,
    navigate_next_search_page,
    open_browser_with_options,
    prepare_manual_boss_page,
    reload_current_page,
    shutdown,
    url,
)
from boss_zhipin.website_oper.core.chat_action import (
    _message_sending_disabled,
    click_by_xpath,
    click_send_resume,
    click_stay_on_page_if_present,
    dismiss_greeting_dialog,
    get_text_by_css,
    navigate_back,
    return_to_job_list,
    send_chat_message,
    send_resume_after_greeting_enabled,
    wait_for_css,
)
from boss_zhipin.website_oper.core.dom_eval import (
    _js_click_at_index,
    _js_wait_text,
    _safe_evaluate,
    _xpath_safe,
)
from boss_zhipin.website_oper.core.models import (
    JobPosting,
    _JD_NOISE_LINES,
    _strip_jd_noise,
    job_key,
    normalize_job_key,
)
from boss_zhipin.website_oper.core.job_card_reader import (
    _first_company_line,
    _first_line_matching,
    _js_click_job_card_and_get_title,
    _parse_job_card_text,
    _split_boss_line,
    get_job_by_index,
    get_job_description_by_index,
    get_loaded_job_count,
    get_selected_job_index,
    scroll_to_load_more_jobs,
)
from boss_zhipin.website_oper.core.login_detector import (
    _is_logged_in,
    _is_logged_in_from_page_state,
    _on_login_page,
    _wait_url_stable,
    captcha_visible,
    log_in,
)
from boss_zhipin.website_oper.core.page_filter_ctrl import (
    BOSS_MAX_CITIES_PER_BATCH,
    _BOSS_ACTIVE_PATTERNS,
    _PAGE_FILTER_LABELS,
    _city_rotation_state,
    apply_page_filters,
    click_filter_value,
    extract_boss_active_status,
    get_platform_city_chunks,
    rotate_next_city_batch,
    select_dropdown_option,
)

log = logging.getLogger(__name__)

# 模块级浏览器与 Tab 单例引用（保持向后兼容及测试 monkeypatch 支持）
_browser: uc.Browser | None = None
_tab: uc.Tab | None = None


def get_tab() -> uc.Tab | None:
    """同步读当前控制的 Tab 引用。仅用作内省。"""
    return _tab


def get_driver():
    raise RuntimeError(
        "get_driver() 已移除：项目已迁到 nodriver，没有 Selenium driver。"
        "请改用 finding_jobs 里的 async helper（get_text_by_css/click_by_xpath/"
        "wait_for_css/send_chat_message/navigate_back）。"
    )


__all__ = [
    "BOSS_MAX_CITIES_PER_BATCH",
    "CHROME_PROFILE_DIR",
    "JobPosting",
    "RECOMMEND_URL",
    "_BOSS_ACTIVE_PATTERNS",
    "_JD_NOISE_LINES",
    "_PAGE_FILTER_LABELS",
    "_PAGE_IN_URL_RE",
    "_browser",
    "_city_rotation_state",
    "_clear_singleton_locks",
    "_first_company_line",
    "_first_line_matching",
    "_is_logged_in",
    "_is_logged_in_from_page_state",
    "_js_click_at_index",
    "_js_click_job_card_and_get_title",
    "_js_wait_text",
    "_kill_profile_chrome",
    "_kill_profile_chrome_windows",
    "_message_sending_disabled",
    "_on_login_page",
    "_parse_job_card_text",
    "_reap_profile_chrome",
    "_safe_evaluate",
    "_split_boss_line",
    "_start_browser_with_retry",
    "_strip_jd_noise",
    "_tab",
    "_wait_url_stable",
    "_xpath_safe",
    "apply_page_filters",
    "browser_type",
    "captcha_visible",
    "click_by_xpath",
    "click_filter_value",
    "click_next_page_if_present",
    "click_send_resume",
    "click_stay_on_page_if_present",
    "dismiss_greeting_dialog",
    "ensure_current_tab",
    "extract_boss_active_status",
    "get_browser_page_state",
    "get_current_url",
    "get_driver",
    "get_job_by_index",
    "get_job_description_by_index",
    "get_loaded_job_count",
    "get_platform_city_chunks",
    "get_selected_job_index",
    "get_tab",
    "get_text_by_css",
    "is_browser_alive",
    "job_key",
    "log_in",
    "navigate_back",
    "navigate_next_search_page",
    "normalize_job_key",
    "open_browser_with_options",
    "prepare_manual_boss_page",
    "reload_current_page",
    "return_to_job_list",
    "rotate_next_city_batch",
    "scroll_to_load_more_jobs",
    "select_dropdown_option",
    "send_chat_message",
    "send_resume_after_greeting_enabled",
    "shutdown",
    "url",
    "wait_for_css",
]
