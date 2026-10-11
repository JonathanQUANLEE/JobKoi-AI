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

log = logging.getLogger(__name__)

CHROME_PROFILE_DIR = os.path.abspath(
    os.environ.get("BOSS_CHROME_PROFILE", "./chrome_profile")
)

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
        try:
            from nodriver import cdp

            # 优雅退出：Chrome 收到 Browser.close 会保存所有会话数据再退出
            await finding_jobs._browser.connection.send(cdp.browser.close())
            # 给 Chrome 时间完成退出流程 + cookie 落盘（正常 <1s，留 2s 余量）
            await asyncio.sleep(2.0)
        except Exception as e:
            log.warning("CDP 优雅关闭失败（改用 stop 兜底）: %s", e)
        try:
            finding_jobs._browser.stop()
        except Exception as e:
            log.warning("browser.stop() 失败（不致命）: %s", e)
    finding_jobs._browser = None
    finding_jobs._tab = None


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
