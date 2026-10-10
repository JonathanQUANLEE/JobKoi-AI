"""主循环运行时配置解析与上限检查。"""
from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


@dataclass
class LoopConfig:
    """投递主循环的静态/环境变量配置。"""

    scan_only: bool
    page_filters: dict[str, list[str]]
    profile_filters: dict[str, Any]
    boss_active_filter_enabled: bool
    scan_groups: list[dict[str, Any]]
    scan_max_jobs: int | None
    scan_required_terms: list[str]
    auto_send_fixed_greeting: bool
    auto_send_max_sent: int | None
    auto_send_daily_limit: int | None
    auto_send_delay_min: float
    auto_send_delay_max: float
    review_before_send: bool
    gui_review: bool
    send_mode: str
    seen_jobs_path: Path | None
    sent_log_path: Path | None
    skipped_log_path: Path | None
    stop_on_captcha: bool
    fixed_greeting: str
    review_required_terms: list[str]
    review_locations: list[str]

    @classmethod
    def load(cls) -> LoopConfig:
        """从 write_response 解析当前环境与 profile 下的运行时配置。"""
        from boss_zhipin.website_oper import write_response

        scan_only = write_response._scan_only_enabled()
        page_filters = write_response._page_filters()
        profile_filters = write_response._merge_boss_active_filter(
            write_response._profile_filters(), page_filters
        )
        boss_active_filter_enabled = write_response._boss_active_filter_enabled(page_filters)
        scan_groups = write_response._scan_groups() if scan_only else []
        scan_max_jobs = write_response._scan_max_jobs() if scan_only else None
        scan_required_terms = write_response._scan_required_terms() if scan_only else []
        auto_send_fixed_greeting = write_response._auto_send_fixed_greeting_enabled()
        auto_send_max_sent = (
            write_response._auto_send_max_sent() if auto_send_fixed_greeting else None
        )
        auto_send_daily_limit = (
            write_response._auto_send_daily_limit() if auto_send_fixed_greeting else None
        )
        auto_send_delay_min, auto_send_delay_max = (
            write_response._auto_send_delay_range() if auto_send_fixed_greeting else (0.0, 0.0)
        )
        review_before_send = write_response._review_before_send_enabled()
        gui_review = write_response._gui_review_enabled()
        send_mode = write_response._send_mode_name(
            scan_only=scan_only,
            review_before_send=review_before_send,
            auto_send_fixed_greeting=auto_send_fixed_greeting,
        )
        if send_mode == "unset":
            raise RuntimeError("必须选择运行模式：scan、review 或 auto")
        seen_jobs_path = write_response._state_path("BOSS_SEEN_JOBS_FILE")
        sent_log_path = write_response._state_path("BOSS_SENT_LOG_FILE")
        skipped_log_path = write_response._state_path("BOSS_SKIPPED_LOG_FILE")
        stop_on_captcha = write_response._stop_on_captcha_enabled()
        fixed_greeting = (
            write_response._fixed_greeting()
            if (review_before_send or auto_send_fixed_greeting)
            else ""
        )
        review_required_terms = (
            write_response._review_required_terms() if review_before_send else []
        )
        review_locations = write_response._review_locations() if review_before_send else []
        if (review_before_send or auto_send_fixed_greeting) and not fixed_greeting:
            raise RuntimeError("固定招呼语模式必须设置 BOSS_FIXED_GREETING")

        return cls(
            scan_only=scan_only,
            page_filters=page_filters,
            profile_filters=profile_filters,
            boss_active_filter_enabled=boss_active_filter_enabled,
            scan_groups=scan_groups,
            scan_max_jobs=scan_max_jobs,
            scan_required_terms=scan_required_terms,
            auto_send_fixed_greeting=auto_send_fixed_greeting,
            auto_send_max_sent=auto_send_max_sent,
            auto_send_daily_limit=auto_send_daily_limit,
            auto_send_delay_min=auto_send_delay_min,
            auto_send_delay_max=auto_send_delay_max,
            review_before_send=review_before_send,
            gui_review=gui_review,
            send_mode=send_mode,
            seen_jobs_path=seen_jobs_path,
            sent_log_path=sent_log_path,
            skipped_log_path=skipped_log_path,
            stop_on_captcha=stop_on_captcha,
            fixed_greeting=fixed_greeting,
            review_required_terms=review_required_terms,
            review_locations=review_locations,
        )


def is_limit_reached(
    cfg: LoopConfig,
    *,
    job_index: int,
    start_job_index: int,
    sent_count: int,
    daily_sent_count: int,
) -> bool:
    """检查是否触发单次发送上限、今日发送上限或扫描最大数限制。"""
    from boss_zhipin.website_oper import write_response

    if cfg.auto_send_max_sent is not None and sent_count >= cfg.auto_send_max_sent:
        log.info("已发送 %d 条，达到 BOSS_AUTO_SEND_MAX_SENT 上限，结束", sent_count)
        write_response._emit_progress("feed_exhausted", total=job_index - 1)
        return True
    if cfg.auto_send_daily_limit is not None and daily_sent_count >= cfg.auto_send_daily_limit:
        log.info("今日已发送 %d 条，达到 BOSS_AUTO_SEND_DAILY_LIMIT 上限，结束", daily_sent_count)
        write_response._emit_progress("feed_exhausted", total=job_index - 1)
        return True
    if cfg.scan_max_jobs is not None and job_index - start_job_index >= cfg.scan_max_jobs:
        log.info("扫描达到 BOSS_SCAN_MAX_JOBS=%d，结束", cfg.scan_max_jobs)
        write_response._emit_progress("feed_exhausted", total=job_index - 1)
        return True
    return False
