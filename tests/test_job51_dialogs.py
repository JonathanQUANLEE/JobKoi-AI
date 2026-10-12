"""51job 投递后弹窗处理测试（2026-10-13 用户实测反馈修复）。

覆盖：
- ``dismiss_success_dialog``：关"投递成功"大弹窗（点弹层内关闭钮 / Escape 兜底 / 无弹窗不动）；
- ``dismiss_confirm_dialog``：确认弹层内点确认（精确文本匹配，不误点"投递成功"）；
- apply 主循环接入：投递后两个 dismiss 都被调用。
"""

from __future__ import annotations

import asyncio
import json

import pytest

import job51.driver as job51_driver


class _FakeTab:
    """按调用序回放 JS 执行结果的假 tab。"""

    def __init__(self, results: list[str]):
        self._results = list(results)
        self.calls: list[str] = []

    async def evaluate(self, js):
        self.calls.append(js)
        return self._results.pop(0) if self._results else "none"


def test_dismiss_success_dialog_closed():
    tab = _FakeTab(["closed"])
    result = asyncio.run(job51_driver.dismiss_success_dialog(tab))
    assert result == "closed"
    assert "投递成功" in tab.calls[0]


def test_dismiss_success_dialog_escape_fallback():
    """弹层在但没找到关闭钮 → Escape 兜底。"""
    tab = _FakeTab(["escape"])
    result = asyncio.run(job51_driver.dismiss_success_dialog(tab))
    assert result == "escape"


def test_dismiss_success_dialog_none():
    """页面上没有成功弹窗 → none（什么都不做）。"""
    tab = _FakeTab(["none"])
    result = asyncio.run(job51_driver.dismiss_success_dialog(tab))
    assert result == "none"


def test_dismiss_confirm_dialog_confirm():
    tab = _FakeTab(["confirm"])
    result = asyncio.run(job51_driver.dismiss_confirm_dialog(tab))
    assert result == "confirm"


def test_dismiss_confirm_js_excludes_success_text():
    """确认弹窗的 JS 必须跳过含「投递成功」的弹层（防误点成功弹窗里的元素）。"""
    assert "投递成功" in job51_driver.DISMISS_CONFIRM_JS
    assert "continue" in job51_driver.DISMISS_CONFIRM_JS


def test_dismiss_success_js_uses_escape_fallback():
    assert "Escape" in job51_driver.DISMISS_SUCCESS_JS


def test_apply_flow_calls_both_dismiss(monkeypatch, tmp_path):
    """apply 主循环：投递成功后必须先关确认弹窗、再关成功弹窗。"""
    import job51.apply as job51_apply

    monkeypatch.setattr(job51_apply, "SENT_LOG", tmp_path / "sent.jsonl")
    monkeypatch.setattr(job51_apply, "SEEN_LOG", tmp_path / "seen.jsonl")

    order: list[str] = []

    class _Tab:
        pass

    async def fake_apply(tab, job_id):
        order.append(f"apply:{job_id}")
        return {"clicked": True}

    async def fake_confirm(tab):
        order.append("confirm")
        return "none"

    async def fake_success(tab):
        order.append("success")
        return "closed"

    async def fake_limit(tab):
        order.append("limit_check")
        return False

    monkeypatch.setattr(job51_driver, "apply_by_jobid", fake_apply)
    monkeypatch.setattr(job51_driver, "dismiss_confirm_dialog", fake_confirm)
    monkeypatch.setattr(job51_driver, "dismiss_success_dialog", fake_success)
    monkeypatch.setattr(job51_driver, "check_limit_alert", fake_limit)

    async def fake_goto(tab, kw):
        return []

    monkeypatch.setattr(job51_driver, "goto_search", fake_goto)

    async def _instant(s):
        return None

    monkeypatch.setattr(job51_apply.asyncio, "sleep", _instant)

    cards = [
        {
            "jobId": "j1",
            "title": "AI Agent 实习",
            "company": "甲公司",
            "salary": "200/天",
            "location": "上海",
            "applied": False,
        }
    ]

    async def fake_parse(tab):
        return cards

    async def fake_next(tab):
        return False

    monkeypatch.setattr(job51_driver, "parse_cards", fake_parse)
    monkeypatch.setattr(job51_driver, "next_page", fake_next)

    result = asyncio.run(job51_apply.run(["AI"], 5, tab=_Tab()))
    assert result == 1
    # 顺序：点投递 → 确认弹窗处理 → 限额检查 → 成功弹窗关闭
    assert order == ["apply:j1", "confirm", "limit_check", "success"]
