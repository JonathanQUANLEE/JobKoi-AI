"""message_check 单测：导航未读数轮询（mock 浏览器层）。"""
from __future__ import annotations

import asyncio

from boss_zhipin.website_oper import finding_jobs
from boss_zhipin.website_oper import message_check as mc


def _mock_nav(monkeypatch, nav_result: dict | None, has_tab: bool = True):
    async def fake_evaluate(js, timeout=10):
        return nav_result or {}

    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object() if has_tab else None)
    monkeypatch.setattr(finding_jobs, "_safe_evaluate", fake_evaluate)


def test_check_without_browser(monkeypatch):
    mc.reset()
    _mock_nav(monkeypatch, None, has_tab=False)
    result = asyncio.run(mc.check_new_replies())
    assert result["status"] == "error"
    assert result["code"] == "no_browser"
    mc.reset()


def test_check_first_call_establishes_baseline(monkeypatch):
    mc.reset()
    _mock_nav(monkeypatch, {"found": True, "unread": 21, "chatUrl": "https://www.zhipin.com/web/geek/chat"})
    result = asyncio.run(mc.check_new_replies())
    assert result["status"] == "ok"
    assert result["unread"] == 21
    assert result["new_replies"] is False  # 第一次只建基线，不算新回复
    mc.reset()


def test_check_detects_increase(monkeypatch):
    mc.reset()
    _mock_nav(monkeypatch, {"found": True, "unread": 21, "chatUrl": ""})
    asyncio.run(mc.check_new_replies())
    # 注意：第二次换 mock 时**不重置基线**——模拟 60s 后未读数增加
    _mock_nav(monkeypatch, {"found": True, "unread": 24, "chatUrl": ""})
    result = asyncio.run(mc.check_new_replies())
    assert result["status"] == "ok"
    assert result["unread"] == 24
    assert result["new_replies"] is True
    mc.reset()


def test_check_ignores_decrease(monkeypatch):
    """用户自己读了消息（未读减少）不算新回复。"""
    mc.reset()
    _mock_nav(monkeypatch, {"found": True, "unread": 30, "chatUrl": ""})
    asyncio.run(mc.check_new_replies())
    _mock_nav(monkeypatch, {"found": True, "unread": 5, "chatUrl": ""})
    result = asyncio.run(mc.check_new_replies())
    assert result["new_replies"] is False
    mc.reset()


def test_check_nav_not_found(monkeypatch):
    mc.reset()
    _mock_nav(monkeypatch, {"found": False, "unread": 0, "chatUrl": ""})
    result = asyncio.run(mc.check_new_replies())
    assert result["status"] == "error"
    assert result["code"] == "no_nav"
    mc.reset()
