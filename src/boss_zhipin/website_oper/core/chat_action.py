"""聊天动作、招呼语发送、弹窗清理与页面回退。"""
from __future__ import annotations

import asyncio
import logging
import os

log = logging.getLogger(__name__)


async def get_text_by_css(selector: str, timeout: float = 5) -> str | None:
    """通用：返回 CSS 选择器命中元素的 text，找不到返回 None。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return None
    try:
        el = await tab.select(selector, timeout=timeout)
    except Exception:
        return None
    return el.text if el else None


async def click_by_xpath(xpath: str, timeout: float = 10) -> bool:
    """通过 xpath 找到元素并点击。成功返回 True。"""
    from boss_zhipin.website_oper import finding_jobs

    els = await finding_jobs._xpath_safe(xpath, timeout=timeout)
    if not els:
        return False
    await els[0].click()
    return True


async def click_stay_on_page_if_present(timeout: float = 3) -> bool:
    """BOSS 弹出跳转确认时，点击“留在此页”。"""
    from boss_zhipin.website_oper import finding_jobs

    stay_xpaths = (
        "//*[normalize-space(text())='留在此页']",
        "//*[contains(normalize-space(text()), '留在此页')]",
    )
    for xpath in stay_xpaths:
        if await finding_jobs.click_by_xpath(xpath, timeout=timeout):
            log.info("已点击“留在此页”")
            await asyncio.sleep(1)
            return True
    return False


async def dismiss_greeting_dialog(timeout: float = 5) -> bool:
    """关闭“立即沟通”后出现的默认招呼语确认框。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return False
    try:
        button = await tab.find("继续沟通", best_match=True, timeout=timeout)
    except Exception:
        button = None
    if button:
        await button.click()
        log.info("已关闭默认招呼语弹窗（点击‘继续沟通’）")
        await asyncio.sleep(1)
        return True
    log.debug("未检测到默认招呼语弹窗，跳过")
    return False


async def wait_for_css(selector: str, timeout: float = 50) -> bool:
    """等 CSS 选择器命中。成功返回 True，超时返回 False。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return False
    try:
        el = await tab.select(selector, timeout=timeout)
    except Exception:
        return False
    return el is not None


def _message_sending_disabled() -> bool:
    """只允许点“立即沟通”，禁止把任何招呼语 / 简历内容发给对方（硬保险）。"""
    return os.getenv("BOSS_CLICK_ONLY", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


def send_resume_after_greeting_enabled() -> bool:
    """F2 开关：打招呼后自动点「发简历」（默认关，opt-in）。"""
    return os.getenv("BOSS_SEND_RESUME_AFTER_GREETING", "0").strip().lower() in (
        "1",
        "true",
        "yes",
    )


async def send_chat_message(text: str) -> None:
    """把 text 打进 ``#chat-input``，优先点击发送按钮。"""
    from boss_zhipin.website_oper import finding_jobs

    if _message_sending_disabled():
        log.info("BOSS_CLICK_ONLY 生效：已跳过发送招呼语（只点击'立即沟通'）")
        return
    tab = finding_jobs._tab
    if tab is None:
        raise RuntimeError("chat input (#chat-input) 未找到（没有受控 tab）")
    chat = await tab.select("#chat-input", timeout=10)
    if not chat:
        raise RuntimeError("chat input (#chat-input) 未找到")
    await chat.send_keys(text)
    await asyncio.sleep(3)
    try:
        send_button = await tab.find("发送", best_match=True, timeout=5)
    except Exception:
        send_button = None
    if send_button:
        await send_button.click()
        log.info("已点击‘发送’按钮")
    else:
        log.warning("未找到‘发送’按钮，回退使用回车发送")
        await chat.send_keys("\n")
    await asyncio.sleep(1)


async def click_send_resume(timeout: float = 5) -> bool:
    """发送招呼语后尝试点击“发简历”。"""
    from boss_zhipin.website_oper import finding_jobs

    if not send_resume_after_greeting_enabled():
        log.info("BOSS_SEND_RESUME_AFTER_GREETING 未开启：跳过点击'发简历'")
        return False
    tab = finding_jobs._tab
    if tab is None:
        return False
    try:
        button = await tab.find("发简历", best_match=True, timeout=timeout)
    except Exception:
        button = None
    if button:
        await button.click()
        log.info("已点击‘发简历’")
        await asyncio.sleep(2)
        return True
    log.debug("未找到‘发简历’按钮，跳过")
    return False


async def navigate_back() -> None:
    """``history.back()`` —— 浏览器返回上一页。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is not None:
        await tab.evaluate("history.back()")
    await asyncio.sleep(3)


async def return_to_job_list(timeout: float = 12.0, max_attempts: int = 2) -> bool:
    """尽量回到岗位列表页，并确认列表真的回来了。"""
    from boss_zhipin.website_oper import finding_jobs

    for attempt in range(1, max_attempts + 1):
        await finding_jobs.navigate_back()
        if await finding_jobs.wait_for_css(".job-card-box", timeout=timeout):
            return True
        log.warning("返回岗位列表第 %d 次失败，继续重试", attempt)
    return False
