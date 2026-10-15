"""主投递巡航循环（DOM 推荐流与搜索流调度）。

Facade 与调度中枢：
- 运行时配置解析拆至 loop_config
- 交互动作拆至 loop_actions
- 模式分支拆至 loop_modes
- 翻页与加载恢复拆至 loop_navigator
- 岗位匹配规则计算拆至 job_evaluator
"""
from __future__ import annotations

import asyncio
import logging

from boss_zhipin.gui import events
from boss_zhipin.platforms.platform_limits import PlatformLimitReached
from boss_zhipin.website_oper.dispatch.job_evaluator import evaluate_job_match
from boss_zhipin.website_oper.dispatch.loop_actions import (
    click_contact_and_send_response,
    compose_greeting,
    send_response_and_go_back,
)
from boss_zhipin.website_oper.dispatch.loop_config import (
    LoopConfig,
    is_limit_reached,
)
from boss_zhipin.website_oper.dispatch.loop_modes import (
    handle_auto_send_job,
    handle_review_send_job,
    handle_scan_only_match,
)
from boss_zhipin.website_oper.dispatch.loop_navigator import (
    handle_missing_jd_recovery,
    reload_feed_and_restart,
)
from boss_zhipin.website_oper.dispatch.env_config import (
    _page_filters_for_click,
    _profile_name,
    _should_select_label,
)
from boss_zhipin.website_oper.dispatch.history_logger import (
    _has_stable_job_identity,
    _job_with_derived_fields,
    _log_seen,
    _log_skipped,
    _read_seen_job_keys,
    _sent_today_count,
)
from boss_zhipin.website_oper.dispatch.search_api_flow import (
    _run_search_api_flow,
    _use_search_api_flow,
)

log = logging.getLogger(__name__)

# 向后兼容导出
_compose_greeting = compose_greeting


async def send_job_descriptions_to_chat(
    usr_name: str,
    url: str,
    browser_type: str,
    label: str,
    dry_run: bool = False,
    use_current_page: bool = False,
) -> None:
    """主循环（async）。"""
    from boss_zhipin.website_oper import finding_jobs

    cfg = LoopConfig.load()

    # 复用当前页面前必须先验活（2026-10-12 事故）：用户中途手关浏览器后，
    # 上一轮巡航可能从 API 流翻页异常路径退出，_browser/_tab 死引用残留——
    # 只看"引用是否存在"会复用死会话：新浏览器永远不开、不导航画像起始页，
    # 筛选瞬间全失败、DOM 流空转成僵尸。死了就清理残留并全新启动。
    if use_current_page or finding_jobs.get_tab() is not None:
        if finding_jobs.is_browser_alive():
            await finding_jobs.ensure_current_tab()
        else:
            log.warning("受控浏览器已关闭（或进程不存在），清理残留会话后全新启动")
            await finding_jobs.shutdown()
            await finding_jobs.open_browser_with_options(url, browser_type)
    else:
        await finding_jobs.open_browser_with_options(url, browser_type)
    # 本轮是否真的持有受控浏览器：tests 里 open_browser 被 mock、不设 _tab → False，
    # 主循环的浏览器死亡检测自动跳过；生产环境开浏览器/复用活页后必为 True。
    had_live_browser = finding_jobs.get_tab() is not None
    actual_url = finding_jobs.get_current_url()
    events.emit("browser_started")
    events.emit(
        "page_opened",
        requested_url=url,
        actual_url=actual_url,
        redirected=bool(url and actual_url and url != actual_url),
    )
    # log_in 返回 False = 确认未登录（等待扫码超时）；True/None 视为已登录继续。
    # 显式判断 False（而非 not）：兼容返回 None 的旧 mock 与"已登录跳过"两种语义。
    if (await finding_jobs.log_in()) is False:
        # 登录已失效：直达登录页等扫码，超时未登录则明确提示用户后中止本轮
        events.emit(
            "login_required",
            message="BOSS 登录已失效。请在浏览器里扫码登录后，再点一次「启动巡航」。",
        )
        log.warning("BOSS 未登录，中止本轮巡航")
        return
    events.emit("login_ok")

    # 页面筛选先于 API/DOM 流分支执行（2026-10-11 顺序修正）：
    # - 搜索页上点城市/学历等筛选会更新 URL（带上 city 等参数）；
    # - 之后 API 流从最新 URL 提取搜索条件 → 拉回的岗位符合画像城市+方向。
    #   旧顺序下 API 流直接跑，画像的城市筛选从未生效（实测：画像城市
    #   广深北上，实际搜出的却是账号记忆的「郑州爬虫工程师」）。
    if use_current_page:
        events.emit(
            "page_filter",
            group="manual",
            value="current_page",
            status="skipped",
            message="已使用当前 BOSS 页面，跳过自动页面筛选，保留你在网页端手动选择的条件。",
        )
        log.info("使用当前 BOSS 页面运行，跳过自动页面筛选点击")
    else:
        await finding_jobs.apply_page_filters(
            _page_filters_for_click(cfg.page_filters),
            emit_event=lambda payload: events.emit("page_filter", **payload),
        )
        # 筛选点击会更新 URL——用最新的 URL 判定走哪条流
        actual_url = finding_jobs.get_current_url()

    if (
        _use_search_api_flow(actual_url)
        and not cfg.review_before_send
        and finding_jobs.get_tab() is not None
    ):
        await _run_search_api_flow(
            usr_name=usr_name,
            url=actual_url,
            dry_run=dry_run,
            scan_only=cfg.scan_only,
            greeting=cfg.fixed_greeting,
        )
        return

    if cfg.stop_on_captcha and await finding_jobs.captcha_visible():
        raise RuntimeError("检测到验证码/安全验证，已按 BOSS_STOP_ON_CAPTCHA 停止")

    start_job_index = (
        await finding_jobs.get_selected_job_index() if use_current_page else 1
    )
    job_index = start_job_index
    window_index = start_job_index
    if use_current_page:
        events.emit(
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
    daily_sent_count = _sent_today_count(
        cfg.sent_log_path, profile=_profile_name()
    )
    seen_job_keys: set[str] = _read_seen_job_keys(cfg.seen_jobs_path)

    if _should_select_label(label, url, use_current_page):
        # 多岗位输入时下拉只选第一个词（2026-10-15）：整串带逗号在 BOSS
        # 岗位标签下拉里永远匹配不到任何选项，等于白选。
        from boss_zhipin.config.query_fission import split_search_keywords

        dropdown_kws = split_search_keywords(label)
        await finding_jobs.select_dropdown_option(
            dropdown_kws[0] if dropdown_kws else label
        )
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

    while True:
        # 浏览器死掉（用户中途手关）→ 立刻干净中止，不做僵尸空转。
        # 依据：_safe_evaluate 检测到连接断开会调 shutdown() 清引用，所以
        # _browser 变 None = 浏览器已死（换号按钮在巡航中会被拦截，不存在
        # 其他中途清引用的路径）。检测放 try 外：要穿透到 runner._wrap
        # （emit error + loop_ended(error)），不被下面的宽 except 吞成正常结束。
        if had_live_browser and not finding_jobs.is_browser_alive():
            raise RuntimeError(
                "浏览器已关闭，本轮巡航中止。可修改画像后重新点「开启巡航」。"
            )
        try:
            if is_limit_reached(
                cfg,
                job_index=job_index,
                start_job_index=start_job_index,
                sent_count=sent_count,
                daily_sent_count=daily_sent_count,
            ):
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
                job = _job_with_derived_fields(job, job_description)
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
                    _log_skipped(
                        cfg.skipped_log_path,
                        job=job,
                        job_key=dedupe_key,
                        send_mode=cfg.send_mode,
                        reason="duplicate",
                        details={
                            "stage": "history",
                            "reason": duplicate_detail,
                        },
                    )
                    events.emit(
                        "job_skipped",
                        platform="boss",
                        index=job_index,
                        reason="duplicate",
                        detail=duplicate_detail,
                        title=job_title,
                    )
                    if _has_stable_job_identity(job):
                        advance_window()
                    else:
                        advance_position()

                    if consecutive_duplicates >= MAX_CONSECUTIVE_DUPLICATES:
                        if await finding_jobs.navigate_next_search_page():
                            log.info("当前页全是已投过的岗位，已翻到下一页继续")
                            window_index = 1
                            consecutive_duplicates = 0
                            await asyncio.sleep(2)
                            continue
                        if barren_reloads < MAX_FEED_RELOADS:
                            log.info(
                                "连续 %d 个重复岗位，刷新推荐流换一批（第 %d/%d 次）",
                                MAX_CONSECUTIVE_DUPLICATES,
                                barren_reloads + 1,
                                MAX_FEED_RELOADS,
                            )
                            events.emit(
                                "feed_reload",
                                attempt=barren_reloads + 1,
                                limit=MAX_FEED_RELOADS,
                            )
                            if await reload_feed_and_restart(cfg.page_filters):
                                barren_reloads += 1
                                window_index = 1
                                consecutive_misses = 0
                                consecutive_duplicates = 0
                                continue
                        log.info(
                            "连续 %d 个重复岗位，刷新 %d 次仍无新岗位，结束",
                            MAX_CONSECUTIVE_DUPLICATES,
                            barren_reloads,
                        )
                        events.emit("feed_exhausted", total=job_index - 1)
                        break

                    await asyncio.sleep(3)
                    continue

                if dedupe_key:
                    seen_job_keys.add(dedupe_key)
                    _log_seen(
                        cfg.seen_jobs_path, job=job, job_key=dedupe_key, send_mode=cfg.send_mode
                    )
                    barren_reloads = 0
                consecutive_duplicates = 0

                events.emit(
                    "job_found",
                    platform="boss",
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
                    _log_skipped(
                        cfg.skipped_log_path,
                        job=job,
                        job_key=dedupe_key,
                        send_mode=cfg.send_mode,
                        reason=skip_reason,
                        details={
                            "stage": "contact_status",
                            "reason": detail,
                            "button_text": button_text,
                        },
                    )
                    events.emit(
                        "job_skipped",
                        platform="boss",
                        index=job_index,
                        reason=skip_reason,
                        detail=detail,
                        title=job_title,
                    )
                    advance_position()
                    await asyncio.sleep(3)
                    continue

                if element == "立即沟通":
                    matched, reason, stage_name, details = evaluate_job_match(
                        job,
                        job_description,
                        job_title,
                        profile_filters=cfg.profile_filters,
                        boss_active_filter_enabled=cfg.boss_active_filter_enabled,
                        scan_only=cfg.scan_only,
                        scan_required_terms=cfg.scan_required_terms,
                        scan_groups=cfg.scan_groups,
                        auto_send_fixed_greeting=cfg.auto_send_fixed_greeting,
                        review_before_send=cfg.review_before_send,
                        review_required_terms=cfg.review_required_terms,
                        review_locations=cfg.review_locations,
                    )

                    if not matched:
                        log.info(
                            "⏭️ [%s 跳过 #%d] %s，标题=%r",
                            stage_name,
                            job_index,
                            reason,
                            job_title,
                        )
                        _log_skipped(
                            cfg.skipped_log_path,
                            job=job,
                            job_key=dedupe_key,
                            send_mode=cfg.send_mode,
                            reason=stage_name,
                            details=details,
                        )
                        events.emit(
                            "job_skipped",
                            platform="boss",
                            index=job_index,
                            reason=stage_name,
                            detail=reason,
                            title=job_title,
                        )
                        advance_position()
                        await asyncio.sleep(3)
                        continue

                    if cfg.scan_only:
                        await handle_scan_only_match(
                            job_index=job_index,
                            job=job,
                            job_description=job_description,
                            dedupe_key=dedupe_key,
                            sent_log_path=cfg.sent_log_path,
                            send_mode=cfg.send_mode,
                            details=details,
                        )
                        advance_position()
                        await asyncio.sleep(3)
                        continue

                    if cfg.auto_send_fixed_greeting:
                        should_stop, sent_count, daily_sent_count = await handle_auto_send_job(
                            job_index=job_index,
                            job=job,
                            job_description=job_description,
                            dedupe_key=dedupe_key,
                            fixed_greeting=cfg.fixed_greeting,
                            dry_run=dry_run,
                            sent_log_path=cfg.sent_log_path,
                            skipped_log_path=cfg.skipped_log_path,
                            send_mode=cfg.send_mode,
                            details=details,
                            auto_send_max_sent=cfg.auto_send_max_sent,
                            delay_min=cfg.auto_send_delay_min,
                            delay_max=cfg.auto_send_delay_max,
                            sent_count=sent_count,
                            daily_sent_count=daily_sent_count,
                        )
                        if should_stop:
                            break
                        advance_position()
                        await asyncio.sleep(3)
                        continue

                    if cfg.review_before_send:
                        status = await handle_review_send_job(
                            job_index=job_index,
                            job=job,
                            job_description=job_description,
                            dedupe_key=dedupe_key,
                            fixed_greeting=cfg.fixed_greeting,
                            dry_run=dry_run,
                            gui_review=cfg.gui_review,
                            sent_log_path=cfg.sent_log_path,
                            skipped_log_path=cfg.skipped_log_path,
                            send_mode=cfg.send_mode,
                            details=details,
                        )
                        if status == "quit":
                            break
                        await asyncio.sleep(3)
                        advance_position()
                        continue
            else:
                action, window_index, consecutive_misses, barren_reloads = (
                    await handle_missing_jd_recovery(
                        job_index=job_index,
                        window_index=window_index,
                        consecutive_misses=consecutive_misses,
                        barren_reloads=barren_reloads,
                        page_filters=cfg.page_filters,
                        max_consecutive_misses=MAX_CONSECUTIVE_MISSES,
                        max_feed_reloads=MAX_FEED_RELOADS,
                    )
                )
                if action == "continue":
                    continue
                if action == "exhausted":
                    break

            await asyncio.sleep(3)
            advance_position()

        except PlatformLimitReached as e:
            # 平台在页面上弹出了限额提示（动作点检测命中）——立即安全停机，
            # 本地 sent 账本已按实际投递逐条记账，前端可据日志统计今天投了多少。
            log.warning("检测到平台限额提示，安全停机: %s", e)
            events.emit(
                "platform_limit_reached",
                platform=e.platform,
                matched_text=e.matched_text,
                message=f"平台提示已达今日投递上限（{e.matched_text}），已安全停止。"
                "今天的实际投递数量可在「投递明细记录」中查看。",
            )
            break
        except Exception as e:
            log.exception("主循环抛异常: %s", e)
            events.emit(
                "error",
                stage=f"job_index={job_index}",
                message=f"{type(e).__name__}: {e}",
            )
            break


__all__ = [
    "_compose_greeting",
    "click_contact_and_send_response",
    "send_job_descriptions_to_chat",
    "send_response_and_go_back",
]
