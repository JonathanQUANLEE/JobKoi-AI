"""BOSS 页面限额提示扫描（投递动作后调用）。

与 captcha_visible 同款思路：读 body 可见文本，交给
``platforms.platform_limits`` 的纯函数判定。只在「点击立即沟通/
发消息动作之后」由调度层调用——动作后弹出的 toast / 确认框文本
会包含限额提示词，命中即抛 ``PlatformLimitReached`` 停机。
"""

from __future__ import annotations

import logging

from boss_zhipin.platforms.platform_limits import check_limit_alert

log = logging.getLogger(__name__)

_READ_BODY_TEXT_JS = """
    JSON.stringify((() => {
      const text = document.body ? document.body.innerText || '' : '';
      return {text};
    })())
"""


async def check_platform_limit() -> str | None:
    """读当前受控页面文本，若命中 BOSS 限额提示则抛 ``PlatformLimitReached``。

    Returns:
        未命中时返回 None。
    """
    from boss_zhipin.website_oper import finding_jobs

    result = await finding_jobs._safe_evaluate(_READ_BODY_TEXT_JS, timeout=5)
    text = str(result.get("text") or "")
    check_limit_alert("boss", text)
    return None