"""三种投递模式的执行调度分支（从 runner_loop 拆分）。"""
from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

from boss_zhipin import audit
from boss_zhipin.gui import events
from boss_zhipin.website_oper.dispatch import loop_actions, rule_matcher
from boss_zhipin.website_oper.dispatch.history_logger import (
    _log_sent,
    _log_skipped,
    _match_explanation,
)
from boss_zhipin.website_oper.dispatch.review_flow import (
    _ask_gui_review_decision,
    _ask_review_decision,
)

log = logging.getLogger(__name__)


async def handle_scan_only_match(
    job_index: int,
    job: Any,
    job_description: str,
    dedupe_key: str,
    sent_log_path: str,
    send_mode: str,
    details: dict[str, Any],
) -> None:
    """处理 scan_only 命中：只记录与上报，不发消息。"""
    log.info("✅ [扫描命中 #%d] %s", job_index, details.get("reason", ""))
    rule_matcher._log_scan_match(
        index=job_index,
        job_description=job_description,
        details=details,
    )
    _log_sent(
        sent_log_path,
        job=job,
        job_key=dedupe_key,
        send_mode=send_mode,
        status="scan_only",
        details=details,
        dry_run=True,
        sent=False,
    )
    events.emit(
        "job_matched",
        platform="boss",
        index=job_index,
        status="scan_only",
        detail=details.get("reason", ""),
        jd_preview=job_description[:160],
    )


async def handle_auto_send_job(
    job_index: int,
    job: Any,
    job_description: str,
    dedupe_key: str,
    fixed_greeting: str,
    dry_run: bool,
    sent_log_path: str,
    skipped_log_path: str,
    send_mode: str,
    details: dict[str, Any],
    auto_send_max_sent: int | None,
    delay_min: float,
    delay_max: float,
    sent_count: int,
    daily_sent_count: int,
) -> tuple[bool, int, int]:
    """处理 auto 模式发送。返回 (should_stop, new_sent_count, new_daily_sent_count)。"""
    response = fixed_greeting
    validation = audit.validate_letter(response)
    if not validation.ok:
        log.warning(
            "[BLOCKED] 固定招呼语未通过校验: %s — preview: %r",
            validation.reasons,
            response[:80],
        )
        audit.log_attempt(
            source="fixed-greeting",
            channel="local",
            job_description=job_description,
            letter=response,
            validation=validation,
            dry_run=dry_run,
            sent=False,
        )
        events.emit(
            "letter_sent",
            platform="boss",
            index=job_index,
            status="blocked",
            score=None,
            letter_len=len(response),
            match_explanation=_match_explanation(details),
            match_details=details,
        )
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode=send_mode,
            reason="validation",
            details={"validation_reasons": validation.reasons},
        )
        return False, sent_count, daily_sent_count

    if dry_run:
        log.info(
            "[DRY-RUN][AUTO] 固定招呼语 (%d 字符) 不发送。--- letter ---\n%s\n--------------",
            len(response),
            response,
        )
        audit.log_attempt(
            source="fixed-greeting",
            channel="local",
            job_description=job_description,
            letter=response,
            validation=validation,
            dry_run=True,
            sent=False,
        )
        events.emit(
            "letter_sent",
            platform="boss",
            index=job_index,
            status="dry_run",
            score=None,
            letter_len=len(response),
            match_explanation=_match_explanation(details),
            match_details=details,
        )
        _log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode=send_mode,
            status="dry_run",
            details=details,
            dry_run=True,
            sent=False,
        )
        return False, sent_count, daily_sent_count

    log.info("自动发送固定招呼语：%s", response)
    await loop_actions.click_contact_and_send_response(response)
    sent_count += 1
    daily_sent_count += 1
    audit.log_attempt(
        source="fixed-greeting",
        channel="local",
        job_description=job_description,
        letter=response,
        validation=validation,
        dry_run=False,
        sent=True,
    )
    events.emit(
        "letter_sent",
        platform="boss",
        index=job_index,
        status="sent",
        score=None,
        letter_len=len(response),
        match_explanation=_match_explanation(details),
        match_details=details,
    )
    _log_sent(
        sent_log_path,
        job=job,
        job_key=dedupe_key,
        send_mode=send_mode,
        status="sent",
        details=details,
        dry_run=False,
        sent=True,
    )
    if auto_send_max_sent is not None and sent_count >= auto_send_max_sent:
        log.info("已发送 %d 条，达到 BOSS_AUTO_SEND_MAX_SENT 上限，结束", sent_count)
        events.emit("feed_exhausted", total=job_index)
        return True, sent_count, daily_sent_count

    delay = random.uniform(delay_min, delay_max)
    log.info("自动发送节流等待 %.1f 秒后继续", delay)
    # 带站岗的节流睡眠：用户中途手关浏览器时 ~2s 内中止，不傻等满 10-30s
    from boss_zhipin.website_oper.core.browser_session import sleep_with_browser_guard

    await sleep_with_browser_guard(delay)
    return False, sent_count, daily_sent_count


async def handle_review_send_job(
    job_index: int,
    job: Any,
    job_description: str,
    dedupe_key: str,
    fixed_greeting: str,
    dry_run: bool,
    gui_review: bool,
    sent_log_path: str,
    skipped_log_path: str,
    send_mode: str,
    details: dict[str, Any],
) -> str:
    """处理 review 模式人工审核与发送。返回 'sent' | 'skip' | 'quit' | 'blocked'。"""
    response, _greeting_source = await loop_actions.compose_greeting(
        job_description, fixed_greeting
    )
    validation = audit.validate_letter(response)
    if not validation.ok:
        log.warning(
            "[BLOCKED] 固定招呼语未通过校验: %s — preview: %r",
            validation.reasons,
            response[:80],
        )
        audit.log_attempt(
            source="fixed-greeting",
            channel="local",
            job_description=job_description,
            letter=response,
            validation=validation,
            dry_run=dry_run,
            sent=False,
        )
        events.emit(
            "letter_sent",
            platform="boss",
            index=job_index,
            status="blocked",
            score=None,
            letter_len=len(response),
            match_explanation=_match_explanation(details),
            match_details=details,
        )
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode=send_mode,
            reason="validation",
            details={"validation_reasons": validation.reasons},
        )
        return "blocked"

    if gui_review:
        decision = await _ask_gui_review_decision(
            index=job_index,
            job=job,
            job_description=job_description,
            details=details,
            greeting=response,
        )
    else:
        decision = await _ask_review_decision(
            index=job_index,
            job_description=job_description,
            details=details,
            greeting=response,
        )

    if decision == "quit":
        log.info("用户在审核模式选择退出")
        events.emit("feed_exhausted", total=job_index - 1)
        return "quit"

    if decision == "skip":
        log.info("用户跳过岗位 #%d", job_index)
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode=send_mode,
            reason="review_skip",
            details=details,
        )
        events.emit(
            "job_skipped",
            platform="boss",
            index=job_index,
            reason="review_skip",
            detail="用户审核后跳过",
            score=None,
        )
        return "skip"

    if dry_run:
        log.info(
            "[DRY-RUN][REVIEW] 固定招呼语 (%d 字符) 不发送。--- letter ---\n%s\n--------------",
            len(response),
            response,
        )
        audit.log_attempt(
            source="fixed-greeting",
            channel="local",
            job_description=job_description,
            letter=response,
            validation=validation,
            dry_run=True,
            sent=False,
        )
        events.emit(
            "letter_sent",
            platform="boss",
            index=job_index,
            status="dry_run",
            score=None,
            letter_len=len(response),
            match_explanation=_match_explanation(details),
            match_details=details,
        )
        _log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode=send_mode,
            status="dry_run",
            details=details,
            dry_run=True,
            sent=False,
        )
    else:
        log.info("审核通过，发送固定招呼语：%s", response)
        await loop_actions.click_contact_and_send_response(response)
        audit.log_attempt(
            source="fixed-greeting",
            channel="local",
            job_description=job_description,
            letter=response,
            validation=validation,
            dry_run=False,
            sent=True,
        )
        events.emit(
            "letter_sent",
            platform="boss",
            index=job_index,
            status="sent",
            score=None,
            letter_len=len(response),
            match_explanation=_match_explanation(details),
            match_details=details,
        )
        _log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode=send_mode,
            status="sent",
            details=details,
            dry_run=False,
            sent=True,
        )
    return "sent"
