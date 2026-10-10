"""页面筛选控制、下拉选择与多城市切批轮询。"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
import re
from typing import Any

log = logging.getLogger(__name__)

_PAGE_FILTER_LABELS = {
    "city": "城市",
    "education": "学历",
    "boss_active": "BOSS活跃",
    "experience": "经验",
    "salary": "薪资待遇",
    "company_scale": "公司规模",
    "industry": "行业",
}

_BOSS_ACTIVE_PATTERNS = (
    "刚刚活跃",
    "今日活跃",
    "3日内活跃",
    "本周活跃",
    "本月活跃",
    "3月内活跃",
    "刚刚在线",
)

BOSS_MAX_CITIES_PER_BATCH = 4

_city_rotation_state: dict[str, Any] = {
    "current_batch_index": 0,
    "active_batch": [],
}


def extract_boss_active_status(text: str) -> str:
    """从岗位卡片或详情文本里提取 BOSS 活跃状态。"""
    if not text:
        return ""
    for pattern in _BOSS_ACTIVE_PATTERNS:
        if pattern in text:
            return pattern
    match = re.search(r"\d+日内活跃|\d+月内活跃", text)
    return match.group(0) if match else ""


async def click_filter_value(group_name: str, value: str, timeout: float = 5) -> bool:
    """按页面筛选组和值文本尽力点击。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return False
    group_label = _PAGE_FILTER_LABELS.get(group_name, group_name)
    try:
        group = await tab.find(group_label, best_match=True, timeout=timeout)
        if group:
            await group.click()
            await asyncio.sleep(0.3)
    except Exception as e:
        log.debug("页面筛选组 %s 点击失败，继续尝试直接点击值：%s", group_label, e)

    try:
        option = await tab.find(value, best_match=True, timeout=timeout)
        if not option:
            return False
        await option.click()
        log.info("页面筛选已点击：%s=%s", group_name, value)
        return True
    except Exception as e:
        log.warning("页面筛选值点击失败：%s=%s，%s", group_name, value, e)
        return False


def get_platform_city_chunks(cities: list[str], chunk_size: int = BOSS_MAX_CITIES_PER_BATCH) -> list[list[str]]:
    """将城市列表切分为符合招聘平台单次勾选限制的批次（如 BOSS 直聘单次最多 4 个）。"""
    if not cities:
        return []
    return [cities[i : i + chunk_size] for i in range(0, len(cities), chunk_size)]


async def rotate_next_city_batch(
    filters: dict | None,
    emit_event: Callable[[dict], None] | None = None,
) -> bool:
    """轮换到下一批意向城市并重新应用页面筛选。"""
    from boss_zhipin.website_oper import finding_jobs

    if not isinstance(filters, dict):
        return False
    city_cfg = filters.get("city")
    if not isinstance(city_cfg, dict):
        return False
    raw_cities = [str(item).strip() for item in city_cfg.get("values") or [] if str(item).strip()]
    chunks = get_platform_city_chunks(raw_cities, BOSS_MAX_CITIES_PER_BATCH)
    if len(chunks) <= 1:
        return False

    _city_rotation_state["current_batch_index"] = (
        _city_rotation_state["current_batch_index"] + 1
    ) % len(chunks)
    next_idx = _city_rotation_state["current_batch_index"]
    next_batch = chunks[next_idx]
    _city_rotation_state["active_batch"] = next_batch

    log.info(
        "【城市多平台轮询】切换至第 %d/%d 批城市: %s",
        next_idx + 1,
        len(chunks),
        ", ".join(next_batch),
    )
    if emit_event:
        emit_event(
            {
                "group": "city_rotation",
                "batch_index": next_idx + 1,
                "total_batches": len(chunks),
                "cities": next_batch,
                "status": "rotated",
                "message": f"城市轮询切批：已自动轮换为第 {next_idx + 1}/{len(chunks)} 批 [{', '.join(next_batch)}]",
            }
        )

    await finding_jobs.reload_current_page()
    await asyncio.sleep(2.5)
    await finding_jobs.apply_page_filters(filters, emit_event=emit_event)
    return True


async def apply_page_filters(
    filters: dict | None,
    *,
    emit_event: Callable[[dict], None] | None = None,
) -> None:
    """执行 profile.page_filters。"""
    from boss_zhipin.website_oper import finding_jobs

    if not isinstance(filters, dict) or not filters:
        return
    strict = bool(filters.get("strict", False))
    clicked_any = False
    for group_name, config in filters.items():
        if group_name == "strict" or not isinstance(config, dict):
            continue
        if not bool(config.get("enabled", True)):
            continue
        raw_values = [str(item).strip() for item in config.get("values") or [] if str(item).strip()]
        if str(group_name) == "city":
            chunks = get_platform_city_chunks(raw_values, BOSS_MAX_CITIES_PER_BATCH)
            if len(chunks) > 1:
                batch_idx = _city_rotation_state["current_batch_index"] % len(chunks)
                values = chunks[batch_idx]
                log.info(
                    "意向城市数量(%d)超过单次上限(%d)，启用轮询模式：当前选取第 %d/%d 批：%s",
                    len(raw_values),
                    BOSS_MAX_CITIES_PER_BATCH,
                    batch_idx + 1,
                    len(chunks),
                    ", ".join(values),
                )
                if emit_event:
                    emit_event(
                        {
                            "group": "city_rotation",
                            "batch_index": batch_idx + 1,
                            "total_batches": len(chunks),
                            "cities": values,
                            "status": "info",
                            "message": f"意向城市多批次轮询生效：当前选取第 {batch_idx + 1}/{len(chunks)} 批 [{', '.join(values)}]",
                        }
                    )
            else:
                values = raw_values[:BOSS_MAX_CITIES_PER_BATCH]
        else:
            values = raw_values

        for value in values:
            ok = await finding_jobs.click_filter_value(str(group_name), value)
            if ok:
                if emit_event:
                    emit_event(
                        {
                            "group": str(group_name),
                            "value": value,
                            "status": "success",
                            "message": f"页面筛选成功：{_PAGE_FILTER_LABELS.get(str(group_name), str(group_name))}={value}",
                        }
                    )
                clicked_any = True
                continue
            label = _PAGE_FILTER_LABELS.get(str(group_name), str(group_name))
            message = f"页面筛选失败：{label}={value}"
            if strict:
                raise RuntimeError(message)
            detailed_message = f"{message}。已继续运行，本地规则继续兜底。"
            suggestion = "你可以在 BOSS 页面手动筛选到合适页面，再回到 GUI 直接点击开始运行。"
            log.warning("%s%s", detailed_message, suggestion)
            if emit_event:
                emit_event(
                    {
                        "group": str(group_name),
                        "value": value,
                        "status": "failed",
                        "message": detailed_message,
                        "suggestion": suggestion,
                    }
                )
    if clicked_any:
        await asyncio.sleep(1)


async def select_dropdown_option(label: str) -> None:
    """空 label 表示用 BOSS 默认推荐 feed，不主动选 tag。"""
    from boss_zhipin.website_oper import finding_jobs

    if not label:
        log.info("[select_dropdown_option] label 为空，沿用当前推荐 feed")
        return
    log.info("[select_dropdown_option] label=%r", label)

    log.info("  路径 1: 找推荐 tag chip ...")
    chip_xp = (
        "//*[contains(@class,'recommend-job-btn')"
        " and contains(@class,'has-tooltip')]"
    )
    chips = await finding_jobs._xpath_safe(chip_xp, timeout=3)
    log.info("    找到 %d 个 tag chip", len(chips))
    for el in chips:
        text = (el.text or "").strip()
        if label in text:
            log.info("    → 命中 %r，点击", text)
            await el.click()
            return

    log.info("  路径 2: 找下拉菜单触发器 ...")
    trigger = await finding_jobs._xpath_safe(
        "//*[@id='wrap']/div[2]/div[1]/div/div[1]/div", timeout=3
    )
    if trigger:
        log.info("    → 点开下拉")
        await trigger[0].click()
        await finding_jobs._xpath_safe(
            "//ul[contains(@class,'dropdown-expect-list')]", timeout=3
        )
        options = await finding_jobs._xpath_safe(
            f"//li[contains(text(), '{label}')]", timeout=3
        )
        if options:
            log.info("    → 命中下拉 option %r，点击", label)
            await options[0].click()
            return
        log.info("    下拉里没有 %r", label)
    else:
        log.info("    没找到下拉触发器")

    log.info("  路径 3: fallback —— 用 BOSS 默认的推荐 feed 继续（不主动选 tag）")
