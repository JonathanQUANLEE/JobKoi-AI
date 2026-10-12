"""多平台中心域：平台列表/扫码登录/登录态探测、投递历史与今日重置。"""
from __future__ import annotations

import logging
from typing import Any

from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands

log = logging.getLogger(__name__)


class _PlatformLoginBody(_CamelModel):
    platform_id: str


@commands.command()
async def list_platforms() -> dict[str, Any]:
    """返回所有平台元数据及其登录态（BOSS、猎聘、51job、智联）。

    性能红线：本命令**必须秒回**——前端平台中心挂载即调用，任何慢操作
    （DOM 探测/长等待）都会让四张平台卡片长时间空白。登录探测不得放在
    这里（2026-10-11 教训：加过一次 detect_login_state 导致浏览器僵死时
    接口挂起、卡片不渲染）。BOSS 卡的真实状态由 get_info 的 cookie 证据
    提供；DOM 级探测只在「换号/登录」和「启动巡航」两个动作里做。
    """
    from boss_zhipin.platforms import get_platform_manager

    return {"platforms": get_platform_manager().list_platforms()}


@commands.command()
async def open_platform_login(body: _PlatformLoginBody) -> dict[str, Any]:
    """打开指定平台的扫码登录页面。

    前置拦截：巡航运行中禁止换号——换号会关掉正在投递的受控浏览器。
    """
    from boss_zhipin.gui import runner

    if runner.is_running():
        raise RuntimeError("巡航运行中，请先停止巡航再换号登录")
    from boss_zhipin.platforms import get_platform_manager

    return await get_platform_manager().open_login(body.platform_id)


@commands.command()
async def check_login_status(body: _PlatformLoginBody) -> dict[str, Any]:
    """轻量登录态探测（有界 ≤6s）：前端登录后每几秒轮询一次。

    性能红线：本命令**必须有界**——绝不能像旧版 open_platform_login 那样
    挂 300 秒等扫码（会把后续所有 IPC 拖死，平台卡片全空白）。
    - 浏览器已打开（BOSS 受控 tab 在）→ DOM+URL 探测，_safe_evaluate 自带 5s 超时；
    - 浏览器没开 → 秒回（cookie SQLite 证据，timeout=0 不等锁）。
    """
    from boss_zhipin.platforms import get_platform_manager

    platform = get_platform_manager().get_platform(body.platform_id)
    if platform is None:
        return {"logged_in": False, "verified": False}
    if body.platform_id == "boss":
        from boss_zhipin.website_oper import finding_jobs
        from boss_zhipin.website_oper.core.login_detector import _is_logged_in

        if finding_jobs.get_tab() is not None:
            try:
                live = await _is_logged_in()
                return {"logged_in": bool(live), "verified": True}
            except Exception as e:  # noqa: BLE001
                log.warning("check_login_status DOM 探测失败: %s", e)
    return {"logged_in": platform.check_login(), "verified": False}


class _GetDeliveryHistoryBody(_CamelModel):
    platform: str = ""
    limit: int = 100


@commands.command()
async def get_delivery_history(body: _GetDeliveryHistoryBody) -> dict[str, Any]:
    """返回全平台/指定平台的投递明细记录列表（时间、岗位、公司、薪资、状态）。"""
    from boss_zhipin.gui.stats_io import get_delivery_records

    records = get_delivery_records(platform=body.platform, limit=body.limit)
    return {"records": records}


class _GetDailyStatsBody(_CamelModel):
    days: int = 30


@commands.command()
async def get_delivery_daily_stats(body: _GetDailyStatsBody) -> dict[str, Any]:
    """按天聚合三平台真实投递账本（统计页「真实数据」模式）。

    只读 sent=true 的真实投递（dry_run / scan_only / archived_test 不算）；
    days 收敛到 [1, 90]，无投递的天补 0，前端拿到连续满窗口。
    """
    from boss_zhipin.gui.stats_io import get_daily_delivery_stats

    return get_daily_delivery_stats(days=body.days)


class _ResetTodayDeliveryBody(_CamelModel):
    platform: str = "boss"


@commands.command()
async def reset_today_delivery(body: _ResetTodayDeliveryBody) -> dict[str, Any]:
    """重置今日投递计数（归档今日数据，防止测试时被 150 限制卡住）。"""
    from boss_zhipin.gui.stats_io import reset_today_delivery as _reset_today

    return _reset_today(platform=body.platform)
