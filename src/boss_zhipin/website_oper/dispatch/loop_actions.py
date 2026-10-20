"""页面交互与招呼语生成动作（从 runner_loop 拆分）。"""
from __future__ import annotations

import asyncio
import logging
import os

log = logging.getLogger(__name__)


class ContactSkipped(RuntimeError):
    """按钮状态表明岗位不可直聊（已沟通过 / 网申岗）。

    调用方（loop_modes）必须按「跳过」记账：不计数、不落 sent、
    不触发聊天链路自愈——与「发送失败需自愈」是完全不同的语义。
    2026-10-20 审查修复：旧版此处静默 return，调用方无法区分
    「已发送」与「安全跳过」，导致跳过岗位被虚记为已投递。
    """

    def __init__(self, reason: str, button_text: str = ""):
        super().__init__(f"{reason}: {button_text}" if button_text else reason)
        self.reason = reason
        self.button_text = button_text


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

    button_text = (
        await finding_jobs.get_text_by_css(
            "a.btn-startchat, a.op-btn-chat, .btn-startchat, .op-btn-chat"
        )
        or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        log.info("BOSS 显示「%s」，该岗位此前已沟通，安全跳过", button_text)
        raise ContactSkipped("already_contacted", button_text)
    if is_apply_online_button(button_text):
        log.info("BOSS 按钮为「%s」，该岗位需外部系统网申，安全跳过", button_text)
        raise ContactSkipped("apply_online", button_text)

    contact_xpaths = (
        "//a[contains(@class, 'btn-startchat')]",
        "//a[contains(@class, 'op-btn-chat')]",
        "//a[contains(normalize-space(text()), '立即沟通')]",
        "//button[contains(@class, 'btn-startchat')]",
        "//button[contains(normalize-space(text()), '立即沟通')]",
        "//*[contains(@class, 'btn-startchat')]",
        "//*[contains(@class, 'op-btn-chat')]",
    )
    clicked = False
    for xpath in contact_xpaths:
        if await finding_jobs.click_by_xpath(xpath, timeout=1.5):
            clicked = True
            break
    if not clicked:
        fallback_xpath = (
            "//a[contains(@class, 'btn-startchat') or contains(@class, 'op-btn-chat') or contains(normalize-space(text()), '立即沟通')] "
            "| //button[contains(@class, 'btn-startchat') or contains(normalize-space(text()), '立即沟通')]"
        )
        if not await finding_jobs.click_by_xpath(fallback_xpath, timeout=5):
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
    await send_response_and_go_back(response)
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


# ---------------------------------------------------------------------------
# 网申/外链岗位识别与聊天链路自愈（2026-10-17 用户实测痛点）
#
# BOSS 上部分大厂/校招岗的动作按钮不是「立即沟通」而是「立即网申」「前往
# 官网投递」——点击不会进入聊天页。旧流程对此毫无感知：API 流把
# btn-startchat 类名的网申按钮当沟通按钮点下去（假报 sent + 网申弹窗残留
# 阻塞后续岗位），DOM 流则硬等 #chat-input 50s 超时后抛 RuntimeError 直接
# 中断整轮巡航。守护 Agent 的职责：识别 → 记录 → 平滑跳过，主循环绝不因
# 单个岗位的异态停机。
# ---------------------------------------------------------------------------

# 网申/外链按钮的文案特征（保守匹配：宁漏勿误——漏判退化为旧的
# contact_unavailable/no_button 跳过路径，误判会白白放弃可直聊的岗位）。
_APPLY_ONLINE_BUTTON_PATTERNS = ("网申", "官网投递")


def is_apply_online_button(button_text: str) -> bool:
    """判定按钮文案是否为网申/外部投递入口（不能走站内直聊）。纯函数便于单测。"""
    text = (button_text or "").strip()
    if not text:
        return False
    return any(pattern in text for pattern in _APPLY_ONLINE_BUTTON_PATTERNS)


async def probe_apply_online_button(timeout: float = 1.5) -> str:
    """当常规沟通按钮读不到时，探测页面上是否存在网申形态的动作按钮。

    覆盖「网申按钮与沟通按钮不同类名」的形态：btn-startchat / op-btn-chat
    都找不到时，直接按文案搜网申按钮。命中返回按钮文案，否则返回空串。
    只在按钮缺失的异常态调用（正常岗位零成本）。
    """
    from boss_zhipin.website_oper import finding_jobs

    for xpath in (
        "//a[contains(normalize-space(text()), '网申')]",
        "//*[contains(@class, 'op-btn') and contains(normalize-space(text()), '网申')]",
    ):
        try:
            els = await finding_jobs._xpath_safe(xpath, timeout=timeout)
        except Exception:  # noqa: BLE001
            els = []
        if els:
            return (els[0].text or "").strip()
    return ""


async def recover_from_chat_failure() -> bool:
    """聊天链路异常后的守护 Agent 自愈：清理弹窗并尽力回到岗位列表。

    返回 True = 已恢复（调用方记跳过、继续下一岗位）；False = 回不去
    （调用方让原异常继续传播——真·浏览器级故障的停机是正确行为）。
    先探测是否仍在列表页（按钮未找到但页面没动过的场景，无需导航），
    再做弹窗清理 + 回退重试。
    """
    from boss_zhipin.website_oper import finding_jobs

    try:
        # 仍在岗位列表页（.job-card-box 在 DOM 里）：页面状态未漂移，直接恢复
        if await finding_jobs.wait_for_css(".job-card-box", timeout=3):
            return True
        await finding_jobs.click_stay_on_page_if_present(timeout=2)
        await finding_jobs.dismiss_greeting_dialog(timeout=2)
        return await finding_jobs.return_to_job_list()
    except Exception as e:  # noqa: BLE001
        log.warning("聊天链路自愈过程自身异常：%s", e)
        return False
