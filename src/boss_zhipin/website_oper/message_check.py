"""BOSS 新回复检测（F3 提醒档）。

实现依据（scripts/probe_boss_messages1-6.py 六轮实测，2026-10-08）：
- chat 页的会话列表是 **WebSocket + 反自动化检测**架构：主文档空态壳、
  iframe 空、``getGeekFriendList.json`` 直读返回空——不硬碰（硬碰会像
  高频爬虫一样伤账号，违反本项目红线）；
- 但任意 BOSS 页面顶部导航 ``a[ka="header-message"]`` 内的
  ``.nav-chat-num`` 文本 = **未读消息总数**，且 ``href`` 直通 chat 页。

因此 F3 的形态是：轮询导航未读数 → 比上次增加 = 有新回复 → GUI 通知 +
一键跳转消息页。用户看消息、发简历由本人决定（「自动进会话发简历」档
因 ws 架构砍掉，等未来有需要再评估）。
"""

from __future__ import annotations

import logging
from typing import Any

from boss_zhipin.website_oper import finding_jobs

log = logging.getLogger(__name__)

CHAT_URL = "https://www.zhipin.com/web/geek/chat"

UNREAD_JS = r"""
JSON.stringify((() => {
  const el = document.querySelector('a[ka="header-message"] .nav-chat-num');
  const link = document.querySelector('a[ka="header-message"]');
  return {
    found: !!el,
    unread: el ? (parseInt((el.innerText || '').trim(), 10) || 0) : 0,
    chatUrl: link ? link.href : '',
  };
})())
"""

# 模块级基线：第一次调用建立基线（不算新回复），之后未读数增加才算。
# 与 runner 生命周期一致：GUI 只有一个受控 tab，基线跨轮询保留。
_last_unread: int | None = None


async def check_new_replies() -> dict[str, Any]:
    """读当前受控页面导航的未读数，与上次比较。

    Returns::

        {"status": "ok", "unread": 21, "new_replies": bool, "chat_url": "..."}
        {"status": "error", "code": "no_browser"|"no_nav", "message": str}
    """
    global _last_unread
    tab = finding_jobs.get_tab()
    if tab is None:
        return {
            "status": "error",
            "code": "no_browser",
            "message": "浏览器还没打开，检测不到新回复。",
        }
    result = await finding_jobs._safe_evaluate(UNREAD_JS, timeout=8)
    if not result.get("found"):
        return {
            "status": "error",
            "code": "no_nav",
            "message": "当前页面读不到导航未读数（请停留在 BOSS 页面）。",
        }
    unread = int(result.get("unread") or 0)
    new_replies = _last_unread is not None and unread > _last_unread
    _last_unread = unread
    return {
        "status": "ok",
        "unread": unread,
        "new_replies": new_replies,
        "chat_url": str(result.get("chatUrl") or CHAT_URL),
    }


def reset() -> None:
    """清空未读数基线（测试 / 浏览器重置后重新建立）。"""
    global _last_unread
    _last_unread = None
