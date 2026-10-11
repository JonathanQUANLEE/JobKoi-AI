"""页面交互与招呼语生成动作（从 runner_loop 拆分）。"""
from __future__ import annotations

import asyncio
import logging
import os

log = logging.getLogger(__name__)


async def send_response_and_go_back(response: str) -> None:
    """在 BOSS 沟通页发送 ``response`` 然后退回到列表。"""
    from boss_zhipin.website_oper import finding_jobs

    await finding_jobs.send_chat_message(response)
    await finding_jobs.click_send_resume(timeout=5)
    await asyncio.sleep(10)
    if not await finding_jobs.return_to_job_list():
        raise RuntimeError("发送后未能返回岗位列表")


async def click_contact_and_send_response(response: str) -> None:
    """点击“立即沟通”，并兼容 BOSS 直接发送招呼语后的确认弹窗。

    点击之后立即扫描页面平台限额提示（动作点检测）：命中会抛
    ``PlatformLimitReached``，由主循环统一停机统计。
    """
    from boss_zhipin.website_oper import finding_jobs
    from boss_zhipin.website_oper.core.limit_guard import check_platform_limit
    from boss_zhipin.website_oper import write_response

    contact_xpath = "//a[contains(@class, 'op-btn-chat')]"
    if not await finding_jobs.click_by_xpath(contact_xpath, timeout=10):
        raise RuntimeError("立即沟通按钮未找到")

    await asyncio.sleep(1)
    await check_platform_limit()

    if await finding_jobs.click_stay_on_page_if_present():
        log.info("BOSS 已确认发送招呼语，并已留在岗位页")
        await check_platform_limit()
        return

    await finding_jobs.dismiss_greeting_dialog(timeout=5)
    await check_platform_limit()

    if not await finding_jobs.wait_for_css("#chat-input", timeout=50):
        raise RuntimeError("chat input (#chat-input) 未找到")
    await write_response.send_response_and_go_back(response)
    await check_platform_limit()


async def compose_greeting(job_description: str, fixed_greeting: str) -> tuple[str, str]:
    """F5：review 模式下组合招呼语。返回 ``(greeting, source)``。"""
    enabled = os.getenv("BOSS_AI_GREETING", "0").strip().lower() in ("1", "true", "yes")
    if enabled:
        from boss_zhipin.agent import greeting_generator

        try:
            result = await greeting_generator.generate_greeting(
                job_description, fixed_greeting
            )
        except Exception as e:
            log.warning("AI 招呼语生成异常，降级固定招呼语: %s", e)
            result = {"status": "error", "message": str(e)}
        if result.get("status") == "ok":
            return str(result["greeting"]), "ai"
        log.warning(
            "AI 招呼语不可用，降级固定招呼语: %s", result.get("message", "未知原因")
        )
    return fixed_greeting, "fixed"
