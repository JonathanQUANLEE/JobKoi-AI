"""环境变量读取、数值校验与 Profile 筛选配置合并。"""
from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING

from boss_zhipin.config.filter_rules import JobPosting as FilterJobPosting
from boss_zhipin.platforms.limits import BOSS_DELAY_RANGE_SECONDS

if TYPE_CHECKING:
    from boss_zhipin.website_oper.core.models import JobPosting

log = logging.getLogger(__name__)


def _int_env(name: str, default: int, minimum: int | None = None) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        log.warning("%s=%r 不是整数，回退默认 %d", name, raw, default)
        return default
    if minimum is not None:
        return max(minimum, value)
    return value


def _float_env(name: str, default: float, minimum: float | None = None) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        log.warning("%s=%r 不是数字，回退默认 %.1f", name, raw, default)
        return default
    if minimum is not None:
        return max(minimum, value)
    return value


def _csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _review_before_send_enabled() -> bool:
    return os.getenv("BOSS_REVIEW_BEFORE_SEND", "").lower() in ("1", "true", "yes")


def _gui_review_enabled() -> bool:
    return os.getenv("BOSS_GUI_REVIEW", "").lower() in ("1", "true", "yes")


def _auto_send_fixed_greeting_enabled() -> bool:
    return os.getenv("BOSS_AUTO_SEND_FIXED_GREETING", "").lower() in (
        "1",
        "true",
        "yes",
    )


def _fixed_greeting() -> str:
    return os.getenv("BOSS_FIXED_GREETING", "").strip()


def _profile_filters() -> dict:
    raw = os.getenv("BOSS_PROFILE_FILTERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log.warning(
            "BOSS_PROFILE_FILTERS_JSON 不是合法 JSON，本地 profile 规则将被忽略: %s", e
        )
        return {}
    if not isinstance(data, dict):
        log.warning("BOSS_PROFILE_FILTERS_JSON 顶层不是对象，本地 profile 规则将被忽略")
        return {}
    return data


def _boss_active_values(page_filters: dict) -> list[str]:
    """读取页面筛选里配置的 BOSS 活跃状态，用作本地 OR 规则。"""
    boss_active = page_filters.get("boss_active") if isinstance(page_filters, dict) else {}
    if not isinstance(boss_active, dict) or not bool(boss_active.get("enabled", True)):
        return []
    return [
        str(item).strip()
        for item in boss_active.get("values") or []
        if str(item).strip()
    ]


def _boss_active_filter_enabled(page_filters: dict) -> bool:
    """判断用户是否启用了 BOSS 活跃状态本地筛选。"""
    return bool(_boss_active_values(page_filters))


def _page_filters_for_click(page_filters: dict) -> dict:
    """页面控件层筛选配置。"""
    if not isinstance(page_filters, dict) or "boss_active" not in page_filters:
        return page_filters
    filtered = dict(page_filters)
    boss_active = filtered.get("boss_active")
    if isinstance(boss_active, dict):
        filtered["boss_active"] = {**boss_active, "enabled": False}
    return filtered


def _merge_boss_active_filter(profile_filters: dict, page_filters: dict) -> dict:
    """把页面配置的 BOSS 活跃状态同步成本地 OR 规则。"""
    values = _boss_active_values(page_filters)
    if not values:
        return profile_filters
    merged = dict(profile_filters or {})
    merged["boss_active"] = {
        "any": {
            "enabled": True,
            "scope": "boss",
            "match": "contains",
            "case_sensitive": False,
            "keywords": values,
        }
    }
    return merged


def _filter_rules_without_boss_active(profile_filters: dict) -> dict:
    """移除 BOSS 活跃状态规则，用于状态缺失时避免误杀岗位。"""
    if "boss_active" not in (profile_filters or {}):
        return profile_filters
    return {
        key: value
        for key, value in (profile_filters or {}).items()
        if key != "boss_active"
    }


def _should_select_label(label: str, url: str, use_current_page: bool) -> bool:
    """判断是否需要在 BOSS 推荐页里切换岗位标签。"""
    from boss_zhipin.website_oper import finding_jobs

    if not label:
        return False
    if use_current_page:
        return False
    if (url or "").strip() and (url or "").strip() != finding_jobs.RECOMMEND_URL:
        return False
    return True


def _page_filters() -> dict:
    raw = os.getenv("BOSS_PAGE_FILTERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log.warning("BOSS_PAGE_FILTERS_JSON 不是合法 JSON，页面筛选将被忽略: %s", e)
        return {}
    if not isinstance(data, dict):
        log.warning("BOSS_PAGE_FILTERS_JSON 顶层不是对象，页面筛选将被忽略")
        return {}
    return data


def _to_filter_posting(job: JobPosting, description: str) -> FilterJobPosting:
    """把浏览器层岗位对象转成配置 matcher 使用的结构。"""
    from boss_zhipin.website_oper import finding_jobs

    return FilterJobPosting(
        title=job.title,
        description=description,
        company=job.company,
        location=job.location,
        salary=job.salary,
        tags=job.tags or [],
        boss_name=job.boss_name,
        boss_active_status=job.boss_active_status
        or finding_jobs.extract_boss_active_status(description),
        education=job.education,
        detail_url=job.detail_url,
    )


def _scan_only_enabled() -> bool:
    return os.getenv("BOSS_SCAN_ONLY", "").lower() in ("1", "true", "yes")


def _profile_name() -> str:
    return os.getenv("BOSS_PROFILE_NAME", "").strip() or "env"


def _send_mode_name(
    *, scan_only: bool, review_before_send: bool, auto_send_fixed_greeting: bool
) -> str:
    if scan_only:
        return "scan"
    if review_before_send:
        return "review"
    if auto_send_fixed_greeting:
        return "auto"
    return "unset"


def _scan_max_jobs() -> int:
    return _int_env("BOSS_SCAN_MAX_JOBS", 50, minimum=1)


def _auto_send_max_sent() -> int:
    return _int_env("BOSS_AUTO_SEND_MAX_SENT", 50, minimum=1)


def _auto_send_daily_limit() -> int | None:
    raw = os.getenv("BOSS_AUTO_SEND_DAILY_LIMIT", "").strip()
    if not raw:
        return None
    return _int_env("BOSS_AUTO_SEND_DAILY_LIMIT", 80, minimum=1)


def _stop_on_captcha_enabled() -> bool:
    raw = os.getenv("BOSS_STOP_ON_CAPTCHA", "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _clamp_delay(name: str, value: float) -> float:
    """把节流值收敛进拟人化安全区间（limits.BOSS_DELAY_RANGE_SECONDS）。"""
    low, high = BOSS_DELAY_RANGE_SECONDS
    if value < low:
        log.warning(
            "%s=%.1fs 低于拟人化节流安全下限 %.0fs（防风控），已自动收敛", name, value, low
        )
        return low
    if value > high:
        log.warning("%s=%.1fs 高于上限 %.0fs，已自动收敛", name, value, high)
        return high
    return value


def _auto_send_delay_range() -> tuple[float, float]:
    # 默认 = GUI「标准」档 20-40s（2026-10-12 用户拍板三档：效率 15-30 /
    # 标准 20-40 / 稳健 30-45；越界一律钳进 [15, 45] 安全区间，见 limits.py）。
    min_delay = _clamp_delay(
        "BOSS_AUTO_SEND_DELAY_MIN", _float_env("BOSS_AUTO_SEND_DELAY_MIN", 20.0)
    )
    max_delay = _clamp_delay(
        "BOSS_AUTO_SEND_DELAY_MAX", _float_env("BOSS_AUTO_SEND_DELAY_MAX", 40.0)
    )
    if max_delay < min_delay:
        log.warning(
            "BOSS_AUTO_SEND_DELAY_MAX=%.1f 小于 MIN=%.1f，已交换两者",
            max_delay,
            min_delay,
        )
        return max_delay, min_delay
    return min_delay, max_delay
