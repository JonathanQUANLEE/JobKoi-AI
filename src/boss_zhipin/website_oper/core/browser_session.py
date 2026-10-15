"""Chrome 浏览器启动、单例锁回收、页面导航与生命周期管理。"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import subprocess
import sys

import nodriver as uc
from nodriver import Config

from boss_zhipin.paths import get_platform_profile_dir
from boss_zhipin.platforms.browser_lookup import apply_browser_fallback

log = logging.getLogger(__name__)

# Profile 目录单一真相（2026-10-13 打包加固）：env 覆盖 > standalone
# %APPDATA%（安装目录 UAC 只读，Program Files 装机会炸）> dev 仓库根
# chrome_profile（历史位置一分不动，红线）。cookie 登录探测
# （platforms/boss.py）走同一函数，两边永远指向同一个目录。
CHROME_PROFILE_DIR = str(get_platform_profile_dir("boss"))

RECOMMEND_URL = "https://www.zhipin.com/web/geek/job-recommend?ka=header-job-recommend"
url = RECOMMEND_URL
browser_type = "chrome"

_PAGE_IN_URL_RE = re.compile(r"[?&]page=(\d+)")


from boss_zhipin.website_oper.core.process_cleanup import (
    _clear_singleton_locks,
    _kill_profile_chrome,
    _kill_profile_chrome_windows,
    _reap_profile_chrome,
)


async def _start_browser_with_retry(config: Config, attempts: int = 3) -> uc.Browser:
    """启动并连上 Chrome，失败重试。"""
    last_err: Exception | None = None
    for i in range(1, attempts + 1):
        try:
            return await uc.start(config=config)
        except Exception as e:
            last_err = e
            log.warning("浏览器启动/连接失败（第 %d/%d 次）：%s", i, attempts, e)
            _reap_profile_chrome(config.user_data_dir)
            if i < attempts:
                await asyncio.sleep(2.0 * i)
    assert last_err is not None
    raise last_err


def detach_nodriver_target_handlers(browser: uc.Browser | None) -> None:
    """关浏览器前摘除 nodriver 的 target 事件监听（三平台 shutdown 共用）。

    为什么需要（2026-10-14 用户实测 WinError 1225 刷屏）：CDP
    ``browser.close()`` 送出后，Chrome 退出时会倾泻一串 TargetDestroyed
    事件；nodriver 的 ``_handle_target_update`` 对每个事件派生一个
    fire-and-forget 的 ``update_targets`` 任务，这些任务发现连接已断会
    自动重连 ws 端口（connection.send → connect），而 Chrome 已死 →
    ``ConnectionRefusedError: [WinError 1225]`` 连刷数条吓人红字。
    ``Browser.stop()`` 只断连杀进程，回收不了这些任务。

    唯一干净的解法是在发送 close **之前**把 4 个 target 事件 handler 从
    ``connection.handlers`` 里 pop 掉：事件照常到达但无人认领（nodriver
    分发前会查 ``type(event) in self.handlers``，缺 key 直接跳过），
    任务源头归零。关浏览器后不再需要自动发现新 tab，摘除无副作用。
    """
    if browser is None:
        return
    try:
        from nodriver import cdp

        for evt in (
            cdp.target.TargetInfoChanged,
            cdp.target.TargetCreated,
            cdp.target.TargetDestroyed,
            cdp.target.TargetCrashed,
        ):
            browser.connection.handlers.pop(evt, None)
    except Exception as e:  # noqa: BLE001 — 摘除失败不阻碍正常关闭
        log.debug("摘除 nodriver target handler 失败（忽略）: %s", e)


async def shutdown() -> None:
    """优雅关闭 Chrome 并清空模块级 ``_browser`` / ``_tab``。

    为什么必须优雅（2026-10-11 事故实锤）：nodriver 的 ``stop()`` 只断开
    CDP 连接，相当于把 Chrome 进程丢下不管/硬杀——**新登录的 cookie 还在
    Chrome 内存里没写盘就跟着死了**，用户扫码登录成功再关浏览器，下次
    启动巡航又变成未登录。改用 CDP ``browser.close()`` 让 Chrome 走正常
    退出流程（flush 全部 session/cookie 到磁盘），再兜底 stop。
    """
    from boss_zhipin.website_oper import finding_jobs

    if finding_jobs._browser is not None:
        # 先摘 nodriver 的 target 事件监听（2026-10-15）：否则下面 close 引发
        # 的 TargetDestroyed 事件风暴会派生一批 update_targets 重连任务，对着
        # 已死的端口刷 WinError 1225 红字（机制详见 helper 注释）。
        detach_nodriver_target_handlers(finding_jobs._browser)
        try:
            from nodriver import cdp

            # 关前刷盘缓冲（2026-10-13 打包加固）：扫码刚成功时 cookie
            # 可能还在 Chrome 内存里没落盘——先给 1.5s 让内存中的写入
            # 追上磁盘，再发优雅关闭（关闭后下面另有 2s 余量）。
            await asyncio.sleep(1.5)
            # 优雅退出：Chrome 收到 Browser.close 会保存所有会话数据再退出。
            # 常见误报：close 已送达、Chrome 正在退出时连接先断 → send 抛
            # ConnectionRefused(1225)——这不代表失败，走下面的兜底判断。
            try:
                await finding_jobs._browser.connection.send(cdp.browser.close())
            except Exception as e:  # noqa: BLE001
                log.info("CDP close 连接断开（多为 Chrome 正常退出中）: %s", e)
                # 清理没退干净的残留孤儿：否则它继续锁着 Cookies 库，
                # 下次点换号/平台卡全部读成「待验证」（2026-10-11 实测）。
                _reap_profile_chrome(CHROME_PROFILE_DIR)
            # 给 Chrome 时间完成退出流程 + cookie 落盘（正常 <1s，留 2s 余量）
            await asyncio.sleep(2.0)
        except Exception as e:
            log.warning("CDP 优雅关闭失败（改用 stop 兜底）: %s", e)
            _reap_profile_chrome(CHROME_PROFILE_DIR)
        try:
            finding_jobs._browser.stop()
        except Exception as e:
            log.warning("browser.stop() 失败（不致命）: %s", e)
    finding_jobs._browser = None
    finding_jobs._tab = None


def is_browser_alive() -> bool:
    """受控 Chrome 进程是否还活着（同步零网络：查子进程退出码）。

    为什么需要它（2026-10-12 事故）：用户中途手动关浏览器后，上一轮巡航
    从 API 流的翻页异常路径退出，``_browser``/``_tab`` 死引用残留；下一轮
    巡航入口只看"引用是否为 None"就复用死会话——新浏览器永远不开、页面
    筛选瞬间全失败、DOM 流空转成僵尸。入口复用前必须先验活。

    实现：nodriver ``Browser.stopped`` 属性查 Chrome 子进程 returncode，
    进程退出（含用户手关窗口）立即判死；不发起任何 CDP 网络请求。
    """
    from boss_zhipin.website_oper import finding_jobs

    browser = finding_jobs._browser
    if browser is None:
        return False
    try:
        return not browser.stopped
    except Exception:  # noqa: BLE001 — 验活失败按"已死"处理，宁可重开不可复用死引用
        return False


async def sleep_with_browser_guard(seconds: float, chunk: float = 2.0) -> None:
    """拟人化节流睡眠的"带站岗"版：浏览器中途死掉立即抛错，不傻等满时长。

    背景（2026-10-12 用户实测）：巡航在 10-30s 节流睡眠中被用户手关浏览器，
    主循环要等本轮睡眠睡满、下一轮开头才验活发现——用户盯着"运行中"干等
    最长 30s 才复位。改为每 2s 验一次活，一死立刻抛 RuntimeError，由
    runner._wrap 统一转 error 事件 + loop_ended，前端秒级复位。

    站岗条件：入睡时持有受控 tab 才验活（tests 里 open_browser 被 mock、
    不设 _tab → 退化为纯睡眠，与旧行为完全一致）。
    """
    from boss_zhipin.website_oper import finding_jobs

    guard = finding_jobs.get_tab() is not None
    remaining = max(0.0, seconds)
    while remaining > 0:
        await asyncio.sleep(min(chunk, remaining))
        remaining -= chunk
        if guard and remaining > 0 and not finding_jobs.is_browser_alive():
            raise RuntimeError(
                "浏览器已关闭，本轮巡航中止。可修改画像后重新点「开启巡航」。"
            )


async def human_pause(low: float, high: float) -> None:
    """拟人化停顿（2026-10-15 三平台封号复盘）：高斯钟形分布 + 带站岗。

    调研结论（JobPilot「Human Actor」）：平台风控不止看间隔长短，还看
    间隔的**分布形状**——真人动作间隔服从钟形（高斯）分布，均匀分布的
    "随机"延迟同样是机器签名。取区间中点为均值、1/4 区间宽为标准差，
    越界截断回区间（不影响"只慢不快"红线）。睡眠全程带站岗：用户手关
    浏览器时 ~2s 内中止，不傻等。
    """
    import random as _random

    mid = (low + high) / 2.0
    sigma = max((high - low) / 4.0, 0.05)
    seconds = min(high, max(low, _random.gauss(mid, sigma)))
    await sleep_with_browser_guard(seconds)


async def open_browser_with_options(url_target: str, browser: str) -> None:
    """启动 Chrome 并打开 url。``browser`` 仅接受 ``"chrome"``。"""
    from boss_zhipin.website_oper import finding_jobs

    if browser != "chrome":
        raise NotImplementedError(
            f"browser={browser!r} 不再支持；nodriver 只走 Chrome。"
        )
    os.makedirs(CHROME_PROFILE_DIR, exist_ok=True)
    _reap_profile_chrome(CHROME_PROFILE_DIR)
    config = Config()
    config.user_data_dir = CHROME_PROFILE_DIR
    config.headless = False
    # 无 Chrome 电脑自愈：自动降级 Edge（Chromium 兼容内核）
    apply_browser_fallback(config)
    finding_jobs._browser = await _start_browser_with_retry(config)

    # 直接在 Chrome 启动自带的初始窗口里导航（不开新窗口）——
    # 旧写法 new_window=True 会留下 Chrome 原生空白窗口，用户看到两个窗口。
    finding_jobs._tab = await finding_jobs._browser.get(url_target)
    try:
        await finding_jobs._tab.activate()
        await finding_jobs._tab.bring_to_front()
    except Exception as e:
        log.warning("激活控制 tab 失败（%s），不影响后续操作", e)

    log.info("页面加载中... 当前URL: %s", finding_jobs._tab.url)
    stable_url = await finding_jobs._wait_url_stable(stable_for=2.0, timeout=30)
    log.info("页面已稳定，当前URL: %s", stable_url)


async def prepare_manual_boss_page(url_target: str = "") -> dict:
    """准备一个可由工具控制的 BOSS 页面，供用户手动筛选后继续抓取。"""
    from boss_zhipin.website_oper import finding_jobs

    target_url = (url_target or "").strip() or RECOMMEND_URL
    if finding_jobs._tab is None:
        await finding_jobs.open_browser_with_options(target_url, "chrome")
    else:
        await finding_jobs.ensure_current_tab()
        current_url = finding_jobs.get_current_url()
        if "zhipin.com" not in current_url:
            await finding_jobs.open_browser_with_options(target_url, "chrome")
    return finding_jobs.get_browser_page_state()


async def ensure_current_tab() -> None:
    """复用当前受控 tab，不新开 URL。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        await finding_jobs.prepare_manual_boss_page()
        return
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception as e:
        log.warning("激活当前 tab 失败（%s），继续尝试使用当前页面", e)


def get_current_url() -> str:
    """返回当前受控 tab 的 URL；没有 tab 时返回空字符串。"""
    from boss_zhipin.website_oper import finding_jobs

    return str(getattr(finding_jobs._tab, "url", "") or "")


def get_browser_page_state() -> dict:
    """返回当前受控页面的轻量状态，供 GUI 展示和调试。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return {
            "has_tab": False,
            "url": "",
            "title": "",
            "loaded_job_count": 0,
        }
    return {
        "has_tab": True,
        "url": str(getattr(tab, "url", "") or ""),
        "title": "",
        "loaded_job_count": 0,
    }


async def reload_current_page(url_param: str = "") -> bool:
    """刷新当前受控 tab（nodriver 原生 CDP Page.reload）。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        log.warning("刷新页面失败：还没有受控 tab")
        return False
    try:
        await asyncio.wait_for(tab.reload(), timeout=20)
    except Exception as e:
        log.warning("刷新页面失败（CDP reload）: %s", e)
        return False
    await finding_jobs._wait_url_stable(stable_for=2.0, timeout=30)
    log.info("已刷新页面，当前URL: %s", tab.url)
    return True


async def navigate_next_search_page() -> bool:
    """搜索结果页翻页：解析当前 URL 的 page 参数，导航到下一页。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return False
    url_cur = tab.url
    if "job-recommend" in url_cur:
        return False
    m = _PAGE_IN_URL_RE.search(url_cur)
    next_page = (int(m.group(1)) if m else 1) + 1
    if m:
        next_url = url_cur[: m.start(1)] + str(next_page) + url_cur[m.end(1) :]
    else:
        next_url = url_cur + ("&" if "?" in url_cur else "?") + f"page={next_page}"
    try:
        await asyncio.wait_for(tab.get(next_url), timeout=30)
    except Exception as e:
        log.warning("翻页到第 %d 页失败: %s", next_page, e)
        return False
    await asyncio.sleep(2)
    m2 = _PAGE_IN_URL_RE.search(tab.url)
    if not m2 or int(m2.group(1)) != next_page:
        log.info("第 %d 页翻不动（当前URL: %s），没有更多分页了", next_page, tab.url)
        return False
    log.info("已翻到搜索结果第 %d 页", next_page)
    return True


async def click_next_page_if_present(timeout: float = 3.0) -> bool:
    """列表滚动没有新岗位时，尝试点击分页里的“下一页”。"""
    from boss_zhipin.website_oper import finding_jobs

    next_xpaths = (
        "//*[normalize-space(text())='下一页']",
        "//*[contains(normalize-space(text()), '下一页')]",
        "//*[@aria-label='下一页' or @aria-label='Next']",
        "//*[contains(@class, 'next') and not(contains(@class, 'disabled'))]",
    )
    for xpath in next_xpaths:
        if await finding_jobs.click_by_xpath(xpath, timeout=timeout):
            log.info("已点击岗位列表下一页")
            await asyncio.sleep(2)
            return True
    return False
