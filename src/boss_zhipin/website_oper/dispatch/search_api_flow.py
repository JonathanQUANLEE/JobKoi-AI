"""搜索结果 API 直读流程（绕过 DOM 虚拟列表限制）。"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from pathlib import Path
from typing import Any

from boss_zhipin.audit import validate_letter
from boss_zhipin.config.filter_rules import match_posting
from boss_zhipin.gui import events
from boss_zhipin.platforms.platform_limits import PlatformLimitReached
from boss_zhipin.website_oper.dispatch.env_config import (
    _auto_send_daily_limit,
    _auto_send_delay_range,
    _auto_send_max_sent,
    _boss_active_filter_enabled,
    _filter_rules_without_boss_active,
    _merge_boss_active_filter,
    _page_filters,
    _page_filters_for_click,
    _profile_filters,
    _profile_name,
    _stop_on_captcha_enabled,
    _to_filter_posting,
)
from boss_zhipin.website_oper.dispatch.history_logger import (
    _job_with_derived_fields,
    _log_seen,
    _log_sent,
    _log_skipped,
    _read_seen_job_keys,
    _sent_today_count,
    _state_path,
)

log = logging.getLogger(__name__)

# 每城最多翻多少页（2026-10-12 实测：热门城连续翻 15 页触发 wapi 风控
# code=37；且热门城会吃光风控额度让后续城市全部饿死——违背用户「每个
# 城市都投到」的核心诉求）。10 页 = 单城 300 岗的投递面，主动停在风控
# 线之前，翻完即推进下一城。收紧行为（只慢不快），不碰反爬红线。
BOSS_MAX_PAGES_PER_CITY = 10

_DETAIL_JD_SELECTORS = (
    ".job-sec-text",
    ".job-detail-section .job-sec-text",
    ".detail-content",
)


def _use_search_api_flow(url: str) -> bool:
    """起始页是岗位搜索页时走 API 直读，绕过 DOM 虚拟列表。"""
    return "/web/geek/jobs" in (url or "")


# 只依赖卡片自带字段（无需详情页 JD 全文）即可判定的作用域。
# 这些范围允许"标题预过滤"：不匹配的岗位直接跳过，不开详情页。
_PRESCREEN_OK_SCOPES = frozenset({"title", "company", "location", "boss"})


def _can_prescreen_by_title(filters: dict[str, Any]) -> bool:
    """筛选组全部只依赖卡片字段时返回 True（可先按卡片过滤再开详情页）。

    只要任一组规则作用域涉及 description / title_description / all，
    就必须打开详情页读 JD 才能判定 → 返回 False。
    """
    for groups in (filters or {}).values():
        if not isinstance(groups, dict):
            continue
        for rule in (groups.get("required"), groups.get("any"), groups.get("exclude")):
            if isinstance(rule, dict) and bool(rule.get("enabled", True)):
                scope = str(rule.get("scope") or "title")
                if scope not in _PRESCREEN_OK_SCOPES:
                    return False
    return True


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
    """在详情页点击“立即沟通”。点击后扫描平台限额提示，命中返回 'platform_limit'。"""
    from boss_zhipin.website_oper import finding_jobs
    from boss_zhipin.website_oper.core.limit_guard import check_platform_limit

    button_text = (
        await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        return "already_contacted"
    contact_xpath = "//a[contains(@class, 'btn-startchat')]"
    if not await finding_jobs.click_by_xpath(contact_xpath, timeout=10):
        return "no_button"
    await asyncio.sleep(1)
    try:
        await check_platform_limit()
    except PlatformLimitReached:
        return "platform_limit"
    await finding_jobs.click_stay_on_page_if_present(timeout=3)
    await finding_jobs.dismiss_greeting_dialog(timeout=3)
    if finding_jobs.send_resume_after_greeting_enabled():
        await finding_jobs.click_send_resume(timeout=5)
    return "sent"


async def _process_single_api_job(
    *,
    api_job: dict[str, Any],
    seen_job_keys: set[str],
    seen_jobs_path: Path | None,
    sent_log_path: Path | None,
    skipped_log_path: Path | None,
    filters: dict[str, Any],
    boss_active_filter_enabled: bool,
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
    status 可取值: 'seen', 'captcha', 'filtered',
                   'already_contacted', 'dry_run', 'sent', 'failed'
    """
    from boss_zhipin.website_oper import finding_jobs, job_api

    job = job_api.to_job_posting(api_job)
    # 实时巡航监控（2026-10-12 用户需求）：每个岗位开始处理时上报一次，
    # 前端「实时巡航」页的"当前岗位聚光卡"靠它展示正在看哪个岗位、到哪一步。
    # platform 字段（2026-10-12 三平台并列需求）：前端按平台分通道并列显示。
    events.emit(
        "job_processing",
        platform="boss",
        title=job.title,
        company=job.company,
        salary=job.salary,
        location=job.location,
    )
    dedupe_key = finding_jobs.job_key(job)
    if dedupe_key in seen_job_keys:
        # 已投过/扫过的岗位：跳过也要让用户看见（否则浏览器静止像卡死）
        events.emit(
            "job_skipped",
            platform="boss",
            title=job.title,
            reason="duplicate",
            detail="本地历史记录中已处理过该岗位",
        )
        return "seen", sent_count, daily_sent_count

    seen_job_keys.add(dedupe_key)
    _log_seen(seen_jobs_path, job=job, job_key=dedupe_key, send_mode="auto")

    # 企业级去重已按用户规格移除（2026-10-11）：同一企业常有多个岗位，
    # 不能因为投过该企业就跳过它的其他岗位；去重只按岗位（dedupe_key）。

    # 标题预过滤（观感修复：别开着浏览器逐个点不相干岗位）——
    # 规则全部只依赖卡片字段时，先用 API 卡片数据过滤一轮；不命中直接跳过，
    # 不再打开详情页（详情页只留给"卡片信息已命中、需进一步核对 JD"的岗位）。
    if _can_prescreen_by_title(filters):
        probe_posting = _to_filter_posting(job, "")
        # 活跃状态缺失（wapi 卡既无 activeTimeDesc 也无 bossOnline）时
        # 优雅降级：跳过活跃限制只按岗位规则判定，绝不因"没数据"误杀
        # （与 DOM 流 job_evaluator 同一套语义）。
        probe_filters = filters
        if boss_active_filter_enabled and not probe_posting.boss_active_status:
            probe_filters = _filter_rules_without_boss_active(filters)
        probe_match = match_posting(probe_posting, probe_filters)
        if not probe_match.matched:
            _log_skipped(
                skipped_log_path,
                job=job,
                job_key=dedupe_key,
                send_mode="auto",
                reason="filtered_out",
                details={
                    "stage": "profile_filter",
                    "reason": probe_match.reason,
                    "job_title": job.title,
                },
            )
            events.emit(
                "job_skipped",
                platform="boss",
                title=job.title,
                reason="filtered_out",
                detail=probe_match.reason,
            )
            return "filtered", sent_count, daily_sent_count

    if not await _open_job_detail_page(job.detail_url):
        _log_skipped(
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
        events.emit("captcha_stopped", title=job.title)
        return "captcha", sent_count, daily_sent_count

    jd_text = await asyncio.wait_for(_extract_detail_jd(), timeout=20)
    if not jd_text:
        log.info("详情页 JD 未取到，按标题筛选：%s", job.title)

    job = _job_with_derived_fields(
        job_api.to_job_posting(api_job, description=jd_text), jd_text
    )
    filter_posting = _to_filter_posting(job, jd_text)
    # 详情页后的完整匹配同样做缺状态降级（JD 文本里也提取不到活跃
    # 标签时，不能让活跃规则把岗位一刀切死）。
    full_filters = filters
    if boss_active_filter_enabled and not filter_posting.boss_active_status:
        full_filters = _filter_rules_without_boss_active(filters)
    match = match_posting(filter_posting, full_filters)
    if not match.matched:
        _log_skipped(
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
        events.emit(
            "job_skipped",
            platform="boss",
            title=job.title,
            reason="filtered_out",
            detail=match.reason,
        )
        return "filtered", sent_count, daily_sent_count

    button_text = (
        await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        _log_skipped(
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
        _log_sent(
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

    if status == "platform_limit":
        # 平台弹出限额提示：全局停机信号，不做 skip 记账，直接上传给调度层。
        log.info("检出平台限额提示，终止本轮投递")
        return status, sent_count, daily_sent_count

    if status == "sent":
        sent_count += 1
        daily_sent_count += 1
        _log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            status="sent",
            details={"stage": "api_flow", "job_title": job.title},
            dry_run=False,
            sent=True,
        )
        events.emit(
            "job_sent",
            platform="boss",
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
        _log_skipped(
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

    # 带站岗的节流睡眠：用户中途手关浏览器时 ~2s 内中止，不傻等满 10-30s
    from boss_zhipin.website_oper.core.browser_session import sleep_with_browser_guard

    await sleep_with_browser_guard(random.uniform(delay_min, delay_max))
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
    from boss_zhipin.website_oper import finding_jobs, job_api

    if not scan_only:
        validation = validate_letter(greeting)
        if not validation.ok:
            raise RuntimeError("固定招呼语未通过发送校验: " + ", ".join(validation.reasons))

    seen_jobs_path = _state_path("BOSS_SEEN_JOBS_FILE")
    sent_log_path = _state_path("BOSS_SENT_LOG_FILE")
    skipped_log_path = _state_path("BOSS_SKIPPED_LOG_FILE")
    # 活跃窗口（三阶段引擎·机制三 2026-10-13）：把画像 page_filters 里的
    # BOSS 活跃状态同步成本地 OR 规则（与 DOM 流 loop_config 同一套合并
    # 逻辑——此前 api 直读流漏了这步，用户在 GUI 配了活跃筛选也不生效）。
    # 缺状态的岗位由 _process_single_api_job 内做优雅降级（不误杀）。
    page_filter_cfg = _page_filters()
    filters = _merge_boss_active_filter(_profile_filters(), page_filter_cfg)
    boss_active_filter_enabled = _boss_active_filter_enabled(page_filter_cfg)
    stop_on_captcha = _stop_on_captcha_enabled()
    delay_min, delay_max = _auto_send_delay_range()
    max_sent = _auto_send_max_sent()
    daily_limit = _auto_send_daily_limit()
    sent_count = 0
    daily_sent_count = _sent_today_count(
        sent_log_path, profile=_profile_name()
    )
    seen_job_keys: set[str] = _read_seen_job_keys(seen_jobs_path)
    query = job_api.search_query_from_url(url)
    tab = finding_jobs.get_tab()
    if tab is None:
        raise RuntimeError("受控 tab 不存在，无法执行 API 直读流程")

    events.emit(
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
    # 跳过分类计数（2026-10-12 用户实测：150 岗全部秒跳、0 投递且无任何
    # 解释，用户以为巡航卡死——结束时必须把"为什么没投"说清楚）。
    skipped_duplicates = 0
    skipped_filtered = 0
    skipped_already = 0
    failed_count = 0
    scanned_count = 0
    # 按城市维度统计（2026-10-12 用户追问"郑州为什么不去投"：多城市是混合
    # 搜索，郑州岗位其实扫过——必须按城市拆开汇报，才能让用户看明白）。
    city_stats: dict[str, dict[str, int]] = {}
    stop_reason = "completed"
    # 城市随机逐城推进（2026-10-12 用户拍板 + wapi 取证 v3：wapi 只收单城 city，
    # 多城逗号 code=19）。第 1 城由入口 apply_page_filters 洗牌后直填；这里只管
    # 当前城自然扫完后推进下一城——每个城市都投到、一个都不饿死。
    # （page_filter_cfg 已在 filters 构造处读取，这里复用同一份。）
    city_cfg = page_filter_cfg.get("city") if isinstance(page_filter_cfg, dict) else None
    # enabled 检查必须与 apply_page_filters 对齐：城市组被禁用时它一个都不会直填，
    # 这里如果仍算出多城去推进，会在巡航中途把被禁用的城市偷偷加上。
    all_cities = (
        [
            str(v).strip()
            for v in city_cfg.get("values") or []
            if str(v).strip()
        ]
        if isinstance(city_cfg, dict) and bool(city_cfg.get("enabled", True))
        else []
    )
    total_cities = max(1, len(all_cities))
    cities_done = 1 if len(all_cities) >= 1 else 0  # 第 1 城（随机）入口已应用

    def _record_city(city_name: str, status: str) -> None:
        bucket = city_stats.setdefault(
            city_name, {"scanned": 0, "sent": 0, "skipped": 0}
        )
        bucket["scanned"] += 1
        if status == "sent":
            bucket["sent"] += 1
        elif status in ("seen", "filtered", "already_contacted", "failed"):
            bucket["skipped"] += 1

    def _emit_flow_summary(stop: str) -> None:
        scanned = scanned_count
        message = (
            f"本轮扫描 {scanned} 个岗位：新投递 {sent_count}、"
            f"已投过跳过 {skipped_duplicates}、规则不匹配 {skipped_filtered}、"
            f"此前已沟通 {skipped_already}、打开失败 {failed_count}。"
        )
        if sent_count == 0:
            if skipped_duplicates >= scanned > 0 and scanned_count > 0:
                message += "该搜索词的岗位近期已全部投递过，建议换个搜索词或明天再来。"
            elif skipped_filtered >= scanned > 0 and scanned_count > 0:
                message += "岗位与你的画像规则（关键词/城市/排除项）均不匹配，可在「求职画像」调整规则。"
            else:
                message += "本轮没有可投递的新岗位。"
        if stop == "captcha":
            message += "（触发验证码已安全停止）"
        elif stop == "platform_limit":
            message += "（平台提示今日上限已安全停止）"
        elif stop == "api_error":
            message += "（搜索接口风控限流，稍后再试）"
        per_city = sorted(
            (
                {"city": city, **counts}
                for city, counts in city_stats.items()
            ),
            key=lambda item: item["scanned"],
            reverse=True,
        )
        events.emit(
            "api_flow_finished",
            total=sent_count,
            page=page,
            scanned=scanned,
            skipped_duplicates=skipped_duplicates,
            skipped_filtered=skipped_filtered,
            skipped_already_contacted=skipped_already,
            failed=failed_count,
            stop_reason=stop,
            per_city=per_city,
            cities_done=cities_done,
            total_cities=total_cities,
            message=message,
        )
        log.info("[api-flow] 结束（%s）：%s", stop, message)

    # 城市逐城推进外层循环：当前城**自然扫完**→ 推进到洗牌序列的下一城继续投
    # （每个城市都要投到，用户 2026-10-12 拍板）；风控/限额/验证码/手动停止等
    # 全局停止条件一律不换城。
    while True:
        halt_flow: str | None = None  # "captcha" | "platform_limit"（全局停机）
        while page <= BOSS_MAX_PAGES_PER_CITY:
            if max_sent is not None and sent_count >= max_sent:
                stop_reason = "max_sent"
                break
            if daily_limit is not None and daily_sent_count >= daily_limit:
                # 启动即满额（或发完最后一单翻页回来）：发醒目事件——
                # 前端常驻横幅 + 实时动态都会提醒"BOSS 今日已投满"，
                # 不再只把原因埋进结束汇总里（2026-10-13 用户实测）。
                events.emit(
                    "platform_limit_reached",
                    platform="boss",
                    matched_text="(进入翻页循环时检查)",
                    message=f"BOSS 直聘今日已投满 {daily_sent_count}/{daily_limit}，已安全停止。"
                    "今天的实际投递数量可在「投递明细记录」中查看。",
                )
                stop_reason = "daily_limit"
                break
            page_started = time.monotonic()
            try:
                api_jobs = await job_api.fetch_search_page(tab, query, page)
            except RuntimeError as e:
                # code=37 = 请求过于频繁（2026-10-13 实测：全跳过页秒翻 6 次
                # 后触发）。尊重风控信号冷却退避一次再试，而不是立刻硬停
                # 浪费整轮巡航；重试仍被限制才优雅结束。
                if "code=37" in str(e):
                    events.emit(
                        "api_flow_error",
                        page=page,
                        message=f"触发 BOSS 频率限制（{e}），冷却 45 秒后自动重试第 {page} 页…",
                    )
                    log.warning("[api-flow] code=37 频率限制，冷却 45s 后重试第 %d 页", page)
                    await asyncio.sleep(45)
                    try:
                        api_jobs = await job_api.fetch_search_page(tab, query, page)
                    except RuntimeError as e2:
                        log.warning("冷却后第 %d 页仍被限制，结束：%s", page, e2)
                        events.emit(
                            "api_flow_error",
                            page=page,
                            message="冷却后仍触发频率限制，本轮安全结束。建议等待 10 分钟后再试，或换个搜索词。",
                        )
                        stop_reason = "api_error"
                        break
                else:
                    log.warning("第 %d 页搜索接口失败，结束：%s", page, e)
                    events.emit("api_flow_error", page=page, message=str(e))
                    stop_reason = "api_error"
                    break
            if not api_jobs:
                log.info("第 %d 页没有岗位，搜索结果已全部取完", page)
                break

            for api_job in api_jobs:
                if max_sent is not None and sent_count >= max_sent:
                    break
                if daily_limit is not None and daily_sent_count >= daily_limit:
                    break

                status, sent_count, daily_sent_count = await _process_single_api_job(
                    api_job=api_job,
                    seen_job_keys=seen_job_keys,
                    seen_jobs_path=seen_jobs_path,
                    sent_log_path=sent_log_path,
                    skipped_log_path=skipped_log_path,
                    filters=filters,
                    boss_active_filter_enabled=boss_active_filter_enabled,
                    stop_on_captcha=stop_on_captcha,
                    scan_only=scan_only,
                    dry_run=dry_run,
                    greeting=greeting,
                    sent_count=sent_count,
                    daily_sent_count=daily_sent_count,
                    delay_min=delay_min,
                    delay_max=delay_max,
                )
                scanned_count += 1
                _record_city(api_job.city or "未知城市", status)
                if status == "seen":
                    skipped_duplicates += 1
                elif status == "filtered":
                    skipped_filtered += 1
                elif status == "already_contacted":
                    skipped_already += 1
                elif status == "failed":
                    failed_count += 1
                if status == "captcha":
                    halt_flow = "captcha"
                    break
                if status == "platform_limit":
                    events.emit(
                        "platform_limit_reached",
                        platform="boss",
                        matched_text="(详情页动作后检出)",
                        message="平台提示已达今日投递上限，已安全停止。"
                        "今天的实际投递数量可在「投递明细记录」中查看。",
                    )
                    halt_flow = "platform_limit"
                    break

            if halt_flow:
                stop_reason = halt_flow
                break

            log.info(
                "[api-flow] 第 %d 页处理完成（本页 %d 个岗位），本轮累计发送 %d",
                page,
                len(api_jobs),
                sent_count,
            )
            page += 1
            # 页间节流：秒翻 6 页会触发 BOSS 搜索接口风控（实测 code=37），
            # 拟人化页间停顿再翻下一页。
            # 2026-10-13 加固（自适应上浮）：本页 <3s 秒过 = 全是已投/规则
            # 不匹配、一个详情页都没开——正在穿越历史已投区，纯接口高频
            # 翻页最容易触发频率限制。此时把页间停顿上浮到 4~6.5s，
            # 只慢不快（开过详情页的正常页维持 2.5s 基线）。
            page_elapsed = time.monotonic() - page_started
            if page_elapsed < 3.0:
                await asyncio.sleep(random.uniform(4.0, 6.5))
            else:
                await asyncio.sleep(2.5)

        # 城市推进判定：只有"自然扫完"才推进下一城
        if halt_flow:
            break
        if stop_reason != "completed" or cities_done >= total_cities:
            break
        rotated = await finding_jobs.rotate_next_city_batch(
            _page_filters_for_click(page_filter_cfg),
            emit_event=lambda payload: events.emit("page_filter", **payload),
        )
        if not rotated:
            log.info("城市推进失败（无下一城或 URL 直填失败），结束")
            break
        cities_done += 1
        page = 1
        # 城间节流（拟人化，红线：只慢不快）
        await asyncio.sleep(3)
        actual_url = finding_jobs.get_current_url()
        query = job_api.search_query_from_url(actual_url)
        tab = finding_jobs.get_tab()
        if tab is None:
            stop_reason = "api_error"
            break
        log.info(
            "[api-flow] 城市推进 %d/%d 启动，URL=%s", cities_done, total_cities, actual_url
        )

    _emit_flow_summary(stop_reason)
    log.info("[api-flow] 结束：本轮发送 %d 条，翻到第 %d 页", sent_count, page)
