"""推荐流分页加载、城市切批轮换与拿不到 JD 时的恢复逻辑（从 runner_loop 拆分）。"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


async def reload_feed_and_restart(page_filters: dict[str, Any]) -> bool:
    """列表到底后整页刷新推荐流或轮换下一批意向城市。"""
    from boss_zhipin.website_oper import finding_jobs, write_response

    rotated = await finding_jobs.rotate_next_city_batch(
        write_response._page_filters_for_click(page_filters),
        emit_event=lambda payload: write_response._emit_progress("page_filter", **payload),
    )
    if not rotated:
        reloaded = await finding_jobs.reload_current_page()
        if not reloaded:
            return False
    await write_response.asyncio.sleep(3)
    return True


async def handle_missing_jd_recovery(
    job_index: int,
    window_index: int,
    consecutive_misses: int,
    barren_reloads: int,
    page_filters: dict[str, Any],
    max_consecutive_misses: int = 5,
    max_feed_reloads: int = 3,
) -> tuple[str, int, int, int]:
    """处理拿不到 JD 时的滚动加载、翻页与刷新换批。

    返回 (action, new_window_index, new_consecutive_misses, new_barren_reloads)
    其中 action 可以是: 'continue' | 'exhausted' | 'advance'
    """
    from boss_zhipin.website_oper import finding_jobs, write_response

    consecutive_misses += 1
    log.info("job_index=%d 拿不到 JD（连续第 %d 次）", job_index, consecutive_misses)

    loaded_count = await finding_jobs.get_loaded_job_count()
    if loaded_count and window_index > loaded_count:
        log.info(
            "当前只加载了 %d 个岗位，等待第 %d 个岗位继续加载",
            loaded_count,
            window_index,
        )

    if await finding_jobs.scroll_to_load_more_jobs():
        await write_response.asyncio.sleep(1)
        return "continue", window_index, 0, barren_reloads

    if await finding_jobs.click_next_page_if_present():
        await write_response.asyncio.sleep(1)
        return "continue", 1, 0, barren_reloads

    if await finding_jobs.navigate_next_search_page():
        await write_response.asyncio.sleep(2)
        return "continue", 1, 0, barren_reloads

    latest_loaded_count = await finding_jobs.get_loaded_job_count()
    if loaded_count and window_index > loaded_count and latest_loaded_count >= window_index:
        log.info("第 %d 个岗位已出现在列表中，重新读取当前岗位", window_index)
        await write_response.asyncio.sleep(1)
        return "continue", window_index, 0, barren_reloads

    if loaded_count and window_index > loaded_count and consecutive_misses < max_consecutive_misses:
        await write_response.asyncio.sleep(1)
        return "continue", window_index, consecutive_misses, barren_reloads

    if consecutive_misses >= max_consecutive_misses:
        if barren_reloads < max_feed_reloads:
            log.info(
                "连续 %d 个岗位拿不到，刷新推荐流换一批（第 %d/%d 次）",
                max_consecutive_misses,
                barren_reloads + 1,
                max_feed_reloads,
            )
            write_response._emit_progress(
                "feed_reload",
                attempt=barren_reloads + 1,
                limit=max_feed_reloads,
            )
            if await reload_feed_and_restart(page_filters):
                return "continue", 1, 0, barren_reloads + 1

        log.info(
            "连续 %d 个岗位拿不到，刷新 %d 次仍拉不到新岗位，结束",
            max_consecutive_misses,
            barren_reloads,
        )
        write_response._emit_progress("feed_exhausted", total=job_index - 1)
        return "exhausted", window_index, consecutive_misses, barren_reloads

    return "advance", window_index, consecutive_misses, barren_reloads
