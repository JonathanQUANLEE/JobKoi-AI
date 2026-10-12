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
    - 浏览器已打开（受控 tab 在）→ DOM+URL 实时探测。为什么必须：Chrome
      运行时锁着 Cookies SQLite 库，cookie 探测会一直"待验证"（2026-10-12
      猎聘扫码实测事故：用户已扫码成功，浮层却永远停在"等待扫码"——
      旧代码只有 BOSS 有 DOM 分支，猎聘/51job 走 cookie 路被锁库卡死）；
    - 浏览器没开 → 秒回（cookie SQLite 证据，timeout=0 不等锁）。
    """
    import asyncio

    from boss_zhipin.platforms import get_platform_manager

    platform = get_platform_manager().get_platform(body.platform_id)
    if platform is None:
        return {"logged_in": False, "verified": False}

    async def _live_dom_probe(platform_id: str) -> bool | None:
        """受控浏览器开着时对平台页面做 DOM 登录探测；没开浏览器返回 None。

        evaluate 裸调用可能挂起（页面忙），按有界红线包 6s 超时。
        BOSS 走 _is_logged_in()（无参，内部读 finding_jobs._tab）；
        猎聘/51job 走 driver.is_logged_in(tab)（各自包里的受控 tab）。
        """
        try:
            if platform_id == "boss":
                from boss_zhipin.website_oper import finding_jobs
                from boss_zhipin.website_oper.core.login_detector import _is_logged_in

                if finding_jobs.get_tab() is None:
                    return None
                live = await asyncio.wait_for(_is_logged_in(), timeout=6)
            elif platform_id in ("liepin", "job51"):
                import importlib

                driver = importlib.import_module(
                    "liepin.driver" if platform_id == "liepin" else "job51.driver"
                )
                tab = getattr(driver, "_tab", None)
                browser = getattr(driver, "_browser", None)
                if tab is None and browser is None:
                    return None
                live = await asyncio.wait_for(driver.is_logged_in(tab), timeout=6)
            else:
                return None
            return bool(live)
        except Exception as e:  # noqa: BLE001 — 探测失败按"待验证"回退 cookie 路径
            err_repr = repr(e) or type(e).__name__
            log.warning("check_login_status %s DOM 探测失败: %s", platform_id, err_repr)
            return None

    # 浏览器开着 = cookie 库被 Chrome 锁定，cookie 探测必然"待验证"
    #（2026-10-12 猎聘扫码实测事故）——先 DOM 探测，没开浏览器才走 cookie 证据。
    live = await _live_dom_probe(body.platform_id)
    if live is not None:
        return {"logged_in": live, "verified": True}
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


@commands.command()
async def check_platform_replies() -> dict[str, Any]:
    """三平台未读消息快照（统计页 KPI「未读消息」与早报数据源，2026-10-13）。

    各平台能力（probe 实证）：
    - BOSS：任意页面导航 ``a[ka="header-message"] .nav-chat-num``（已登录且
      浏览器没开时，自动开一个到 zhipin.com 读完即关；巡航运行中只复用当前受控页）；
    - 猎聘：c.liepin.com 聊天挂件 ``.im-ui-basic-entry-unread-count``（已登录且
      浏览器没开时，无头模式读完即关；巡航运行中禁止新开浏览器，避免弹窗抢焦点或误杀进程）；
    - 51job：PC 网页端**没有消息中心**——HR 消息经微信服务号推送（页面自己
      写着「扫码关注服务号，及时收取HR消息」），无法读取，status=unsupported。

    全链路有界（每平台 ≤15s），异常收敛为 error 项，绝不拖死 IPC。
    """
    import asyncio

    from boss_zhipin.gui import runner

    is_cruising = runner.is_running()
    result: dict[str, Any] = {}

    # ---------- BOSS ----------
    try:
        from boss_zhipin.platforms import get_platform_manager
        from boss_zhipin.website_oper import finding_jobs, message_check

        if finding_jobs.get_tab() is not None:
            result["boss"] = await message_check.snapshot()
        elif is_cruising:
            # 巡航运行中但受控 tab 暂未就绪（如正在启动或换页）：跳过后台重新开浏览器，绝不关巡航
            result["boss"] = {
                "status": "busy",
                "unread": 0,
                "message": "巡航运行中，跳过后台探测",
            }
        else:
            platform = get_platform_manager().get_platform("boss")
            if platform is None or not platform.check_login():
                result["boss"] = {
                    "status": "error",
                    "code": "not_logged_in",
                    "message": "BOSS 未登录，无法读取未读消息。",
                }
            else:
                try:
                    # 必须开求职端应用页（job-recommend）：www.zhipin.com 首页是
                    # 营销页头部，没有 a[ka="header-message"] 导航（2026-10-13
                    # 真机实测首页连续 no_nav）。
                    await finding_jobs.open_browser_with_options(
                        "https://www.zhipin.com/web/geek/job-recommend?ka=header-job-recommend",
                        "chrome",
                    )
                    # 导航是前端渲染的：页面刚开时角标不立刻在，带重试地等它
                    # 出现；会话失效会被重定向到 /web/user/ 登录页——cookie
                    # 证据还在但服务端不认（2026-10-13 真机实测），如实报错。
                    result["boss"] = {
                        "status": "error",
                        "code": "no_nav",
                        "message": "BOSS 页面导航未读数未出现。",
                    }
                    for _ in range(4):
                        await asyncio.sleep(2.5)
                        current = finding_jobs.get_current_url()
                        if "/web/user/" in (current or ""):
                            result["boss"] = {
                                "status": "error",
                                "code": "login_expired",
                                "message": "BOSS 登录态已失效（页面被重定向到登录页），请在「招聘平台中心」重新扫码登录。",
                            }
                            break
                        snap = await message_check.snapshot()
                        if snap.get("status") == "ok":
                            result["boss"] = snap
                            break
                        result["boss"] = snap  # 保留最后一次错误
                finally:
                    await finding_jobs.shutdown()
    except Exception as e:  # noqa: BLE001
        result["boss"] = {"status": "error", "code": "exception", "message": str(e)}

    # ---------- 猎聘 ----------
    try:
        import liepin.driver as liepin_driver

        if getattr(liepin_driver, "_browser", None) is not None:
            result["liepin"] = await liepin_driver.check_unread()
        elif is_cruising:
            # 巡航运行中（可能只在巡航 BOSS）：禁止后台新开猎聘浏览器，避免弹窗抢焦点或误杀进程
            result["liepin"] = {
                "status": "busy",
                "unread": 0,
                "message": "巡航运行中，跳过后台探测",
            }
        else:
            from boss_zhipin.platforms import get_platform_manager

            platform = get_platform_manager().get_platform("liepin")
            if platform is None or not platform.check_login():
                result["liepin"] = {
                    "status": "error",
                    "code": "not_logged_in",
                    "message": "猎聘未登录，无法读取未读消息。",
                }
            else:
                result["liepin"] = await liepin_driver.check_unread()
    except Exception as e:  # noqa: BLE001
        result["liepin"] = {"status": "error", "code": "exception", "message": str(e)}

    # ---------- 51job（PC 端无消息中心，如实相告） ----------
    result["job51"] = {
        "status": "unsupported",
        "message": "前程无忧的 HR 消息通过微信服务号推送，PC 网页端没有消息中心，无法读取未读数。",
    }
    return result
