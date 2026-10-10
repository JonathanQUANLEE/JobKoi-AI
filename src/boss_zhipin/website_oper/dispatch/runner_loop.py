"""主投递巡航循环（DOM 推荐流与搜索流调度）。"""
from __future__ import annotations

import asyncio
import logging
import os
import random

log = logging.getLogger(__name__)


async def send_response_and_go_back(response: str) -> None:
    """在 BOSS 沟通页发送 ``response`` 然后退回到列表。"""
    from boss_zhipin.website_oper import finding_jobs

    await finding_jobs.send_chat_message(response)
    await finding_jobs.click_send_resume(timeout=5)
    await asyncio.sleep(10)
    if not await finding_jobs.return_to_job_list():
        raise RuntimeError("发送后未能返回岗位列表")


async def click_contact_and_send_response(response: str) -> None:
    """点击“立即沟通”，并兼容 BOSS 直接发送招呼语后的确认弹窗。"""
    from boss_zhipin.website_oper import finding_jobs, write_response

    contact_xpath = "//a[contains(@class, 'op-btn-chat')]"
    if not await finding_jobs.click_by_xpath(contact_xpath, timeout=10):
        raise RuntimeError("立即沟通按钮未找到")

    if await finding_jobs.click_stay_on_page_if_present():
        log.info("BOSS 已确认发送招呼语，并已留在岗位页")
        return

    await finding_jobs.dismiss_greeting_dialog(timeout=5)

    if not await finding_jobs.wait_for_css("#chat-input", timeout=50):
        raise RuntimeError("chat input (#chat-input) 未找到")
    await write_response.send_response_and_go_back(response)


async def _compose_greeting(job_description: str, fixed_greeting: str) -> tuple[str, str]:
    """F5：review 模式下组合招呼语。返回 ``(greeting, source)``。"""
    enabled = os.getenv("BOSS_AI_GREETING", "0").strip().lower() in ("1", "true", "yes")
    if enabled:
        from boss_zhipin.agent import greeting_generator

        try:
            result = await greeting_generator.generate_greeting(
                job_description, fixed_greeting
            )
        except Exception as e:
            log.warning("AI 招呼语生成异常，降级固定招呼语: %s", e)
            result = {"status": "error", "message": str(e)}
        if result.get("status") == "ok":
            return str(result["greeting"]), "ai"
        log.warning(
            "AI 招呼语不可用，降级固定招呼语: %s", result.get("message", "未知原因")
        )
    return fixed_greeting, "fixed"


async def send_job_descriptions_to_chat(
    usr_name: str,
    url: str,
    browser_type: str,
    label: str,
    dry_run: bool = False,
    use_current_page: bool = False,
) -> None:
    """主循环（async）。"""
    from boss_zhipin.website_oper import finding_jobs, write_response

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
    auto_send_max_sent = write_response._auto_send_max_sent() if auto_send_fixed_greeting else None
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
        write_response._fixed_greeting() if (review_before_send or auto_send_fixed_greeting) else ""
    )
    review_required_terms = write_response._review_required_terms() if review_before_send else []
    review_locations = write_response._review_locations() if review_before_send else []
    if (review_before_send or auto_send_fixed_greeting) and not fixed_greeting:
        raise RuntimeError("固定招呼语模式必须设置 BOSS_FIXED_GREETING")

    if use_current_page:
        await finding_jobs.ensure_current_tab()
    else:
        await finding_jobs.open_browser_with_options(url, browser_type)
    actual_url = finding_jobs.get_current_url()
    write_response._emit_progress("browser_started")
    write_response._emit_progress(
        "page_opened",
        requested_url=url,
        actual_url=actual_url,
        redirected=bool(url and actual_url and url != actual_url),
    )
    await finding_jobs.log_in()
    write_response._emit_progress("login_ok")

    if (
        write_response._use_search_api_flow(actual_url)
        and not review_before_send
        and finding_jobs.get_tab() is not None
    ):
        await write_response._run_search_api_flow(
            usr_name=usr_name,
            url=actual_url,
            dry_run=dry_run,
            scan_only=scan_only,
            greeting=fixed_greeting,
        )
        return

    if use_current_page:
        write_response._emit_progress(
            "page_filter",
            group="manual",
            value="current_page",
            status="skipped",
            message="已使用当前 BOSS 页面，跳过自动页面筛选，保留你在网页端手动选择的条件。",
        )
        log.info("使用当前 BOSS 页面运行，跳过自动页面筛选点击")
    else:
        await finding_jobs.apply_page_filters(
            write_response._page_filters_for_click(page_filters),
            emit_event=lambda payload: write_response._emit_progress("page_filter", **payload),
        )
    if stop_on_captcha and await finding_jobs.captcha_visible():
        raise RuntimeError("检测到验证码/安全验证，已按 BOSS_STOP_ON_CAPTCHA 停止")

    start_job_index = (
        await finding_jobs.get_selected_job_index() if use_current_page else 1
    )
    job_index = start_job_index
    window_index = start_job_index
    if use_current_page:
        write_response._emit_progress(
            "page_filter",
            group="manual",
            value=f"job_{start_job_index}",
            status="applied",
            message=f"从当前选中的第 {start_job_index} 个岗位开始处理。",
        )
        log.info("使用当前页面，从第 %d 个岗位开始运行", start_job_index)
    iteration = 0
    consecutive_misses = 0
    consecutive_duplicates = 0
    MAX_CONSECUTIVE_MISSES = 5
    MAX_CONSECUTIVE_DUPLICATES = 20
    MAX_FEED_RELOADS = 3
    barren_reloads = 0
    sent_count = 0
    daily_sent_count = write_response._sent_today_count(
        sent_log_path, profile=write_response._profile_name()
    )
    seen_job_keys: set[str] = write_response._read_seen_job_keys(seen_jobs_path)
    if write_response._should_select_label(label, url, use_current_page):
        await finding_jobs.select_dropdown_option(label)
    elif label:
        log.info(
            "检测到当前页/起始 URL 已指定，跳过岗位标签选择：%r，避免覆盖手动筛选页面",
            label,
        )

    def advance_position() -> None:
        nonlocal job_index, window_index
        job_index += 1
        window_index += 1

    def advance_window() -> None:
        nonlocal window_index
        window_index += 1

    async def reload_feed_and_restart() -> bool:
        """列表到底后整页刷新推荐流或轮换下一批意向城市。"""
        nonlocal window_index, consecutive_misses, consecutive_duplicates
        nonlocal barren_reloads
        rotated = await finding_jobs.rotate_next_city_batch(
            write_response._page_filters_for_click(page_filters),
            emit_event=lambda payload: write_response._emit_progress("page_filter", **payload),
        )
        if not rotated:
            reloaded = await finding_jobs.reload_current_page()
            if not reloaded:
                return False
        barren_reloads += 1
        window_index = 1
        consecutive_misses = 0
        consecutive_duplicates = 0
        await write_response.asyncio.sleep(3)
        return True

    while True:
        try:
            if auto_send_max_sent is not None and sent_count >= auto_send_max_sent:
                log.info(
                    "已发送 %d 条，达到 BOSS_AUTO_SEND_MAX_SENT 上限，结束", sent_count
                )
                write_response._emit_progress("feed_exhausted", total=job_index - 1)
                break
            if (
                auto_send_daily_limit is not None
                and daily_sent_count >= auto_send_daily_limit
            ):
                log.info(
                    "今日已发送 %d 条，达到 BOSS_AUTO_SEND_DAILY_LIMIT 上限，结束",
                    daily_sent_count,
                )
                write_response._emit_progress("feed_exhausted", total=job_index - 1)
                break
            if (
                scan_max_jobs is not None
                and job_index - start_job_index >= scan_max_jobs
            ):
                log.info("扫描达到 BOSS_SCAN_MAX_JOBS=%d，结束", scan_max_jobs)
                write_response._emit_progress("feed_exhausted", total=job_index - 1)
                break
            iteration += 1
            log.info(
                "=== 第 %d 轮: 处理 job_index=%d window_index=%d ===",
                iteration,
                job_index,
                window_index,
            )
            job = await finding_jobs.get_job_by_index(window_index)
            job_title = job.title if job else ""
            job_description = job.description if job else None
            if job_description:
                job = write_response._job_with_derived_fields(job, job_description)
                job_title = job.title
                consecutive_misses = 0
                dedupe_key = finding_jobs.job_key(job)
                if dedupe_key and dedupe_key in seen_job_keys:
                    consecutive_duplicates += 1
                    duplicate_detail = "本地历史记录中已处理过该岗位"
                    log.info(
                        "⏭️ [重复岗位跳过 #%d] %s：%s",
                        job_index,
                        duplicate_detail,
                        dedupe_key,
                    )
                    write_response._log_skipped(
                        skipped_log_path,
                        job=job,
                        job_key=dedupe_key,
                        send_mode=send_mode,
                        reason="duplicate",
                        details={
                            "stage": "history",
                            "reason": duplicate_detail,
                        },
                    )
                    write_response._emit_progress(
                        "job_skipped",
                        index=job_index,
                        reason="duplicate",
                        detail=duplicate_detail,
                        title=job_title,
                    )
                    if write_response._has_stable_job_identity(job):
                        advance_window()
                    else:
                        advance_position()
                    if consecutive_duplicates >= MAX_CONSECUTIVE_DUPLICATES:
                        if await finding_jobs.navigate_next_search_page():
                            log.info("当前页全是已投过的岗位，已翻到下一页继续")
                            window_index = 1
                            consecutive_duplicates = 0
                            await write_response.asyncio.sleep(2)
                            continue
                        if barren_reloads < MAX_FEED_RELOADS:
                            log.info(
                                "连续 %d 个重复岗位，刷新推荐流换一批（第 %d/%d 次）",
                                MAX_CONSECUTIVE_DUPLICATES,
                                barren_reloads + 1,
                                MAX_FEED_RELOADS,
                            )
                            write_response._emit_progress(
                                "feed_reload",
                                attempt=barren_reloads + 1,
                                limit=MAX_FEED_RELOADS,
                            )
                            if await reload_feed_and_restart():
                                continue
                        log.info(
                            "连续 %d 个重复岗位，刷新 %d 次仍无新岗位，结束",
                            MAX_CONSECUTIVE_DUPLICATES,
                            barren_reloads,
                        )
                        write_response._emit_progress("feed_exhausted", total=job_index - 1)
                        break
                    await write_response.asyncio.sleep(3)
                    continue
                if dedupe_key:
                    seen_job_keys.add(dedupe_key)
                    write_response._log_seen(
                        seen_jobs_path, job=job, job_key=dedupe_key, send_mode=send_mode
                    )
                    barren_reloads = 0
                consecutive_duplicates = 0
                write_response._emit_progress(
                    "job_found",
                    index=job_index,
                    title=job_title,
                    jd_preview=job_description[:80],
                )
                element = await finding_jobs.get_text_by_css(".op-btn.op-btn-chat")
                log.info("chat 按钮文字: %r", element)
                button_text = (element or "").strip()
                if button_text != "立即沟通":
                    already_contacted = "沟通" in button_text
                    skip_reason = (
                        "already_contacted" if already_contacted else "contact_unavailable"
                    )
                    detail = (
                        f"BOSS 显示“{button_text}”，该岗位此前已沟通"
                        if already_contacted
                        else f"未找到可用的“立即沟通”按钮（当前状态：{button_text or '未知'}）"
                    )
                    log.info("⏭️ [联系状态跳过 #%d] %s", job_index, detail)
                    write_response._log_skipped(
                        skipped_log_path,
                        job=job,
                        job_key=dedupe_key,
                        send_mode=send_mode,
                        reason=skip_reason,
                        details={
                            "stage": "contact_status",
                            "reason": detail,
                            "button_text": button_text,
                        },
                    )
                    write_response._emit_progress(
                        "job_skipped",
                        index=job_index,
                        reason=skip_reason,
                        detail=detail,
                        title=job_title,
                    )
                    advance_position()
                    await write_response.asyncio.sleep(3)
                    continue
                if element == "立即沟通":
                    if profile_filters:
                        filter_posting = write_response._to_filter_posting(job, job_description)
                        effective_profile_filters = profile_filters
                        boss_active_missing = (
                            boss_active_filter_enabled
                            and not filter_posting.boss_active_status
                        )
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
                        apply = profile_match.matched
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
                        if not apply:
                            log.info(
                                "⏭️ [profile 跳过 #%d] %s，标题=%r",
                                job_index,
                                profile_match.reason,
                                job_title,
                            )
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="profile_filter",
                                details=details,
                            )
                            write_response._emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="profile_filter",
                                detail=profile_match.reason,
                                title=job_title,
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                    elif scan_only:
                        term_ok, term_reason = write_response._matches_required_terms(
                            job_description, scan_required_terms
                        )
                        if not term_ok:
                            apply = False
                            reason = term_reason
                        else:
                            apply, reason = write_response._matches_all_groups(
                                job_description, scan_groups
                            )
                        details = {"stage": "scan_only", "reason": reason}
                    elif auto_send_fixed_greeting:
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
                        if not apply:
                            log.info(
                                "⏭️ [自动发送跳过 #%d] %s，标题=%r",
                                job_index,
                                reason,
                                job_title,
                            )
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="auto_send_filter",
                                details=details,
                            )
                            write_response._emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="auto_send_filter",
                                detail=reason,
                                title=job_title,
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                    elif review_before_send:
                        term_ok, term_reason = write_response._matches_required_terms(
                            job_description, review_required_terms
                        )
                        if not term_ok:
                            log.info("⏭️ [跳过 #%d] %s", job_index, term_reason)
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="required_terms",
                                details={
                                    "stage": "required_terms",
                                    "reason": term_reason,
                                },
                            )
                            write_response._emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="required_terms",
                                detail=term_reason,
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                        location_ok, location_reason = write_response._matches_all_groups(
                            job_description, [review_locations]
                        )
                        if not location_ok:
                            log.info("⏭️ [跳过 #%d] %s", job_index, location_reason)
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="required_location",
                                details={
                                    "stage": "required_location",
                                    "reason": location_reason,
                                },
                            )
                            write_response._emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="required_location",
                                detail=location_reason,
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                        apply = True
                        details = {
                            "stage": "review",
                            "reason": "命中审核模式本地条件",
                            "matched_keywords": [],
                            "job_title": job_title,
                        }

                    if scan_only:
                        if not apply:
                            log.info(
                                "⏭️ [扫描跳过 #%d] %s",
                                job_index,
                                details.get("reason", ""),
                            )
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="scan_only",
                                details=details,
                            )
                            write_response._emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="scan_only",
                                detail=details.get("reason", ""),
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                        log.info(
                            "✅ [扫描命中 #%d] %s", job_index, details.get("reason", "")
                        )
                        write_response._log_scan_match(
                            index=job_index,
                            job_description=job_description,
                            details=details,
                        )
                        write_response._log_sent(
                            sent_log_path,
                            job=job,
                            job_key=dedupe_key,
                            send_mode=send_mode,
                            status="scan_only",
                            details=details,
                            dry_run=True,
                            sent=False,
                        )
                        write_response._emit_progress(
                            "job_matched",
                            index=job_index,
                            status="scan_only",
                            detail=details.get("reason", ""),
                            jd_preview=job_description[:160],
                        )
                        advance_position()
                        await write_response.asyncio.sleep(3)
                        continue

                    match_score = None

                    if auto_send_fixed_greeting:
                        response = fixed_greeting
                        validation = write_response.validate_letter(response)
                        if not validation.ok:
                            log.warning(
                                "[BLOCKED] 固定招呼语未通过校验: %s — preview: %r",
                                validation.reasons,
                                response[:80],
                            )
                            write_response.log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=dry_run,
                                sent=False,
                            )
                            write_response._emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="blocked",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=write_response._match_explanation(details),
                                match_details=details,
                            )
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="validation",
                                details={"validation_reasons": validation.reasons},
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                        if dry_run:
                            log.info(
                                "[DRY-RUN][AUTO] 固定招呼语 (%d 字符) 不发送。--- letter ---\n%s\n--------------",
                                len(response),
                                response,
                            )
                            write_response.log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=True,
                                sent=False,
                            )
                            write_response._emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="dry_run",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=write_response._match_explanation(details),
                                match_details=details,
                            )
                            write_response._log_sent(
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
                            log.info("自动发送固定招呼语：%s", response)
                            await write_response.click_contact_and_send_response(response)
                            sent_count += 1
                            daily_sent_count += 1
                            write_response.log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=False,
                                sent=True,
                            )
                            write_response._emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="sent",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=write_response._match_explanation(details),
                                match_details=details,
                            )
                            write_response._log_sent(
                                sent_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                status="sent",
                                details=details,
                                dry_run=False,
                                sent=True,
                            )
                            if sent_count >= auto_send_max_sent:
                                log.info(
                                    "已发送 %d 条，达到 BOSS_AUTO_SEND_MAX_SENT 上限，结束",
                                    sent_count,
                                )
                                write_response._emit_progress("feed_exhausted", total=job_index)
                                break
                            delay = write_response.random.uniform(
                                auto_send_delay_min, auto_send_delay_max
                            )
                            log.info("自动发送节流等待 %.1f 秒后继续", delay)
                            await write_response.asyncio.sleep(delay)
                        advance_position()
                        await write_response.asyncio.sleep(3)
                        continue

                    if review_before_send:
                        response, greeting_source = await write_response._compose_greeting(
                            job_description, fixed_greeting
                        )
                        validation = write_response.validate_letter(response)
                        if not validation.ok:
                            log.warning(
                                "[BLOCKED] 固定招呼语未通过校验: %s — preview: %r",
                                validation.reasons,
                                response[:80],
                            )
                            write_response.log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=dry_run,
                                sent=False,
                            )
                            write_response._emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="blocked",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=write_response._match_explanation(details),
                                match_details=details,
                            )
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="validation",
                                details={"validation_reasons": validation.reasons},
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                        if gui_review:
                            decision = await write_response._ask_gui_review_decision(
                                index=job_index,
                                job=job,
                                job_description=job_description,
                                details=details,
                                greeting=response,
                            )
                        else:
                            decision = await write_response._ask_review_decision(
                                index=job_index,
                                job_description=job_description,
                                details=details,
                                greeting=response,
                            )
                        if decision == "quit":
                            log.info("用户在审核模式选择退出")
                            write_response._emit_progress("feed_exhausted", total=job_index - 1)
                            break
                        if decision == "skip":
                            log.info("用户跳过岗位 #%d", job_index)
                            write_response._log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="review_skip",
                                details=details,
                            )
                            write_response._emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="review_skip",
                                detail="用户审核后跳过",
                                score=match_score,
                            )
                            advance_position()
                            await write_response.asyncio.sleep(3)
                            continue
                        if dry_run:
                            log.info(
                                "[DRY-RUN][REVIEW] 固定招呼语 (%d 字符) 不发送。--- letter ---\n%s\n--------------",
                                len(response),
                                response,
                            )
                            write_response.log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=True,
                                sent=False,
                            )
                            write_response._emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="dry_run",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=write_response._match_explanation(details),
                                match_details=details,
                            )
                            write_response._log_sent(
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
                            await write_response.click_contact_and_send_response(response)
                            write_response.log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=False,
                                sent=True,
                            )
                            write_response._emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="sent",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=write_response._match_explanation(details),
                                match_details=details,
                            )
                            write_response._log_sent(
                                sent_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                status="sent",
                                details=details,
                                dry_run=False,
                                sent=True,
                            )
                        await write_response.asyncio.sleep(3)
                        advance_position()
                        continue
            else:
                consecutive_misses += 1
                log.info(
                    "job_index=%d 拿不到 JD（连续第 %d 次）",
                    job_index,
                    consecutive_misses,
                )
                loaded_count = await finding_jobs.get_loaded_job_count()
                if loaded_count and window_index > loaded_count:
                    log.info(
                        "当前只加载了 %d 个岗位，等待第 %d 个岗位继续加载",
                        loaded_count,
                        window_index,
                    )
                if await finding_jobs.scroll_to_load_more_jobs():
                    consecutive_misses = 0
                    await write_response.asyncio.sleep(1)
                    continue
                if await finding_jobs.click_next_page_if_present():
                    consecutive_misses = 0
                    window_index = 1
                    await write_response.asyncio.sleep(1)
                    continue
                if await finding_jobs.navigate_next_search_page():
                    consecutive_misses = 0
                    window_index = 1
                    await write_response.asyncio.sleep(2)
                    continue
                latest_loaded_count = await finding_jobs.get_loaded_job_count()
                if loaded_count and window_index > loaded_count and latest_loaded_count >= window_index:
                    log.info(
                        "第 %d 个岗位已出现在列表中，重新读取当前岗位",
                        window_index,
                    )
                    consecutive_misses = 0
                    await write_response.asyncio.sleep(1)
                    continue
                if (
                    loaded_count
                    and window_index > loaded_count
                    and consecutive_misses < MAX_CONSECUTIVE_MISSES
                ):
                    await write_response.asyncio.sleep(1)
                    continue
                if consecutive_misses >= MAX_CONSECUTIVE_MISSES:
                    if barren_reloads < MAX_FEED_RELOADS:
                        log.info(
                            "连续 %d 个岗位拿不到，刷新推荐流换一批（第 %d/%d 次）",
                            MAX_CONSECUTIVE_MISSES,
                            barren_reloads + 1,
                            MAX_FEED_RELOADS,
                        )
                        write_response._emit_progress(
                            "feed_reload",
                            attempt=barren_reloads + 1,
                            limit=MAX_FEED_RELOADS,
                        )
                        if await reload_feed_and_restart():
                            continue
                    log.info(
                        "连续 %d 个岗位拿不到，刷新 %d 次仍拉不到新岗位，结束",
                        MAX_CONSECUTIVE_MISSES,
                        barren_reloads,
                    )
                    write_response._emit_progress("feed_exhausted", total=job_index - 1)
                    break

            await write_response.asyncio.sleep(3)
            advance_position()

        except Exception as e:
            log.exception("主循环抛异常: %s", e)
            write_response._emit_progress(
                "error",
                stage=f"job_index={job_index}",
                message=f"{type(e).__name__}: {e}",
            )
            break
