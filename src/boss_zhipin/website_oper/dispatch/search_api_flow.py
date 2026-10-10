"""搜索结果 API 直读流程（绕过 DOM 虚拟列表限制）。"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
import random
from typing import Any

from boss_zhipin.audit import validate_letter
from boss_zhipin.config.filter_rules import match_posting

log = logging.getLogger(__name__)

_DETAIL_JD_SELECTORS = (
    ".job-sec-text",
    ".job-detail-section .job-sec-text",
    ".detail-content",
)


def _use_search_api_flow(url: str) -> bool:
    """起始页是岗位搜索页时走 API 直读，绕过 DOM 虚拟列表。"""
    return "/web/geek/jobs" in (url or "")


async def _open_job_detail_page(url: str, timeout: float = 30) -> bool:
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs.get_tab()
    if tab is None or not url:
        return False
    try:
        await asyncio.wait_for(tab.get(url), timeout=timeout)
    except Exception as e:
        log.warning("打开详情页失败 %s: %s", url, e)
        return False
    await asyncio.sleep(2)
    return True


async def _extract_detail_jd() -> str:
    """抓详情页职位描述；取不到返回空串（退化为只按标题筛选）。"""
    from boss_zhipin.website_oper import finding_jobs

    best = ""
    for selector in _DETAIL_JD_SELECTORS:
        try:
            text = await finding_jobs.get_text_by_css(selector, timeout=3)
        except Exception:
            text = None
        if text and len(text.strip()) > len(best):
            best = text.strip()
        if len(best) >= 100:
            break
    return best


async def _send_greeting_on_detail_page(greeting: str) -> str:
    """在详情页点击“立即沟通”。"""
    from boss_zhipin.website_oper import finding_jobs

    button_text = (
        await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        return "already_contacted"
    contact_xpath = "//a[contains(@class, 'btn-startchat')]"
    if not await finding_jobs.click_by_xpath(contact_xpath, timeout=10):
        return "no_button"
    await finding_jobs.click_stay_on_page_if_present(timeout=3)
    await finding_jobs.dismiss_greeting_dialog(timeout=3)
    if finding_jobs.send_resume_after_greeting_enabled():
        await finding_jobs.click_send_resume(timeout=5)
    return "sent"


async def _process_single_api_job(
    *,
    api_job: dict[str, Any],
    seen_job_keys: set[str],
    contacted_companies: set[str],
    seen_jobs_path: Path | None,
    sent_log_path: Path | None,
    skipped_log_path: Path | None,
    filters: dict[str, Any],
    stop_on_captcha: bool,
    scan_only: bool,
    dry_run: bool,
    greeting: str,
    sent_count: int,
    daily_sent_count: int,
    delay_min: float,
    delay_max: float,
) -> tuple[str, int, int]:
    """处理 API 搜索结果中的单个岗位。

    返回值：(status, sent_count, daily_sent_count)
    status 可取值: 'seen', 'company_skipped', 'captcha', 'filtered',
                   'already_contacted', 'dry_run', 'sent', 'failed'
    """
    from boss_zhipin.website_oper import finding_jobs, job_api, write_response

    job = job_api.to_job_posting(api_job)
    dedupe_key = finding_jobs.job_key(job)
    if dedupe_key in seen_job_keys:
        return "seen", sent_count, daily_sent_count

    seen_job_keys.add(dedupe_key)
    write_response._log_seen(seen_jobs_path, job=job, job_key=dedupe_key, send_mode="auto")

    company_key = write_response._normalize_company(job.company)
    if company_key and company_key in contacted_companies:
        write_response._log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="company_already_contacted",
            details={
                "stage": "company_dedupe",
                "company": job.company,
                "job_title": job.title,
            },
        )
        write_response._emit_progress(
            "job_skipped",
            title=job.title,
            reason="company_already_contacted",
            detail=job.company,
        )
        return "company_skipped", sent_count, daily_sent_count

    if not await _open_job_detail_page(job.detail_url):
        write_response._log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="detail_open_failed",
            details={"stage": "detail_page", "job_title": job.title},
        )
        return "failed", sent_count, daily_sent_count

    if stop_on_captcha and await finding_jobs.captcha_visible():
        log.warning("详情页检测到验证码/安全验证，按 BOSS_STOP_ON_CAPTCHA 停止")
        write_response._emit_progress("captcha_stopped", title=job.title)
        return "captcha", sent_count, daily_sent_count

    jd_text = await asyncio.wait_for(_extract_detail_jd(), timeout=20)
    if not jd_text:
        log.info("详情页 JD 未取到，按标题筛选：%s", job.title)

    job = write_response._job_with_derived_fields(
        job_api.to_job_posting(api_job, description=jd_text), jd_text
    )
    filter_posting = write_response._to_filter_posting(job, jd_text)
    match = match_posting(filter_posting, filters)
    if not match.matched:
        write_response._log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="filtered_out",
            details={
                "stage": "profile_filter",
                "reason": match.reason,
                "job_title": job.title,
            },
        )
        write_response._emit_progress(
            "job_skipped",
            title=job.title,
            reason="filtered_out",
            detail=match.reason,
        )
        return "filtered", sent_count, daily_sent_count

    button_text = (
        await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        write_response._log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="already_contacted",
            details={
                "stage": "contact_status",
                "button_text": button_text,
                "job_title": job.title,
            },
        )
        return "already_contacted", sent_count, daily_sent_count

    if scan_only or dry_run:
        write_response._log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            status="dry_run",
            details={"stage": "api_flow", "job_title": job.title},
            dry_run=True,
            sent=False,
        )
        sent_count += 1
        log.info("[DRY-RUN] 命中 %s（%s），不真实发送", job.title, job.company)
        return "dry_run", sent_count, daily_sent_count

    try:
        status = await asyncio.wait_for(
            _send_greeting_on_detail_page(greeting), timeout=120
        )
    except asyncio.TimeoutError:
        log.warning("发送超时（120s），跳过：%s", job.title)
        status = "failed"
    except Exception as e:
        log.warning("发送异常（%s）：%s", job.title, e)
        status = "failed"

    if status == "sent":
        sent_count += 1
        daily_sent_count += 1
        if company_key:
            contacted_companies.add(company_key)
        write_response._log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            status="sent",
            details={"stage": "api_flow", "job_title": job.title},
            dry_run=False,
            sent=True,
        )
        write_response._emit_progress(
            "job_sent",
            title=job.title,
            company=job.company,
            sent=sent_count,
        )
        log.info(
            "✅ [api-flow] 已发送 #%d：%s（%s）",
            sent_count,
            job.title,
            job.company,
        )
    else:
        reason = "already_contacted" if status == "already_contacted" else "send_failed"
        write_response._log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason=reason,
            details={
                "stage": "send",
                "button_state": status,
                "job_title": job.title,
            },
        )
        if status == "already_contacted":
            log.info("⏭️ [api-flow] 该岗位此前已沟通过，跳过：%s", job.title)

    await asyncio.sleep(random.uniform(delay_min, delay_max))
    return status, sent_count, daily_sent_count


async def _run_search_api_flow(
    *,
    usr_name: str,
    url: str,
    dry_run: bool,
    scan_only: bool,
    greeting: str,
) -> None:
    """API 直读搜索结果：按页枚举 → 逐个开详情页 → 本地筛选 → 发送。"""
    from boss_zhipin.website_oper import finding_jobs, job_api, write_response

    if not scan_only:
        validation = validate_letter(greeting)
        if not validation.ok:
            raise RuntimeError("固定招呼语未通过发送校验: " + ", ".join(validation.reasons))

    seen_jobs_path = write_response._state_path("BOSS_SEEN_JOBS_FILE")
    sent_log_path = write_response._state_path("BOSS_SENT_LOG_FILE")
    skipped_log_path = write_response._state_path("BOSS_SKIPPED_LOG_FILE")
    filters = write_response._profile_filters()
    stop_on_captcha = write_response._stop_on_captcha_enabled()
    delay_min, delay_max = write_response._auto_send_delay_range()
    max_sent = write_response._auto_send_max_sent()
    daily_limit = write_response._auto_send_daily_limit()
    sent_count = 0
    daily_sent_count = write_response._sent_today_count(
        sent_log_path, profile=write_response._profile_name()
    )
    seen_job_keys: set[str] = write_response._read_seen_job_keys(seen_jobs_path)
    contacted_companies: set[str] = write_response._read_contacted_companies(sent_log_path)
    if contacted_companies:
        log.info(
            "已联系过的公司 %d 家，这些公司的岗位将全部跳过", len(contacted_companies)
        )
    query = job_api.search_query_from_url(url)
    tab = finding_jobs.get_tab()
    if tab is None:
        raise RuntimeError("受控 tab 不存在，无法执行 API 直读流程")

    write_response._emit_progress(
        "api_flow_started",
        usr_name=usr_name,
        daily_sent=daily_sent_count,
        dry_run=dry_run,
        scan=scan_only,
    )
    log.info(
        "[api-flow] 启动：dry_run=%s scan=%s 今日已发 %d 条",
        dry_run,
        scan_only,
        daily_sent_count,
    )

    page = 1
    while page <= 100:
        if max_sent is not None and sent_count >= max_sent:
            log.info("本轮已发送 %d 条，达到单次上限，结束", sent_count)
            break
        if daily_limit is not None and daily_sent_count >= daily_limit:
            log.info("今日已发送 %d 条，达到每日上限，结束", daily_sent_count)
            break
        try:
            api_jobs = await job_api.fetch_search_page(tab, query, page)
        except RuntimeError as e:
            log.warning("第 %d 页搜索接口失败，结束：%s", page, e)
            write_response._emit_progress("api_flow_error", page=page, message=str(e))
            break
        if not api_jobs:
            log.info("第 %d 页没有岗位，搜索结果已全部取完，结束", page)
            break

        for api_job in api_jobs:
            if max_sent is not None and sent_count >= max_sent:
                break
            if daily_limit is not None and daily_sent_count >= daily_limit:
                break

            status, sent_count, daily_sent_count = await _process_single_api_job(
                api_job=api_job,
                seen_job_keys=seen_job_keys,
                contacted_companies=contacted_companies,
                seen_jobs_path=seen_jobs_path,
                sent_log_path=sent_log_path,
                skipped_log_path=skipped_log_path,
                filters=filters,
                stop_on_captcha=stop_on_captcha,
                scan_only=scan_only,
                dry_run=dry_run,
                greeting=greeting,
                sent_count=sent_count,
                daily_sent_count=daily_sent_count,
                delay_min=delay_min,
                delay_max=delay_max,
            )
            if status == "captcha":
                return

        log.info(
            "[api-flow] 第 %d 页处理完成（本页 %d 个岗位），本轮累计发送 %d",
            page,
            len(api_jobs),
            sent_count,
        )
        page += 1

    write_response._emit_progress("api_flow_finished", total=sent_count, page=page)
    log.info("[api-flow] 结束：本轮发送 %d 条，翻到第 %d 页", sent_count, page)
