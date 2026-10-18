"""搜索页异常收敛回归测试（2026-10-18 三路审查发现的严重缺陷）。

事故：``job_api.fetch_search_page`` docstring 承诺"接口异常抛 RuntimeError"，
但 ``asyncio.wait_for`` 超时抛 ``asyncio.TimeoutError``、浏览器断开抛
``OSError``——调用方 ``search_api_flow`` 只 ``except RuntimeError``，于是
异常穿透到 ``runner._wrap`` 把整轮巡航打死（与 16:00 详情页 JD 超时同款）。

行为规格：
1. evaluate 超时 → RuntimeError，文案含「无有效响应」（调用方走自愈重试）；
2. 浏览器连接断开 → RuntimeError，文案**不**含「无有效响应」（调用方走优雅停机）；
3. 既有路径（非 JSON / code≠0 / 空响应）行为不变（零回归）。
"""

from __future__ import annotations

import asyncio
import json

import pytest

from boss_zhipin.website_oper import job_api


class _FakeTab:
    """可注入任意行为的假 tab。"""

    def __init__(self, *, payload=None, raises: BaseException | None = None):
        self._payload = payload
        self._raises = raises

    async def evaluate(self, _js):
        if self._raises is not None:
            raise self._raises
        return self._payload


def test_evaluate_timeout_becomes_runtime_error_with_retry_hint(monkeypatch):
    """超时 → RuntimeError 且文案含「无有效响应」（调用方据此走冷却+刷新重试）。

    用 monkeypatch 把 30s 超时压到 0.05s，避免真实空等拖慢套件。
    """
    real_wait_for = asyncio.wait_for

    async def short_wait_for(aw, timeout):
        return await real_wait_for(aw, timeout=0.05)

    monkeypatch.setattr(job_api.asyncio, "wait_for", short_wait_for)

    class _HangingTab:
        async def evaluate(self, _js):
            await asyncio.sleep(60)

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(_HangingTab(), "query=x", page=1))

    message = str(exc_info.value)
    assert "无有效响应" in message
    # 必须能被调用方的自愈分支识别（search_api_flow 用这个关键词分流）
    assert "超时" in message


def test_connection_error_becomes_runtime_error_without_retry_hint():
    """连接断开 → RuntimeError，但**不**含「无有效响应」（不该触发重试）。"""
    tab = _FakeTab(raises=ConnectionRefusedError("target closed"))

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(tab, "query=x", page=1))

    message = str(exc_info.value)
    assert "连接已断开" in message
    assert "无有效响应" not in message


def test_timeout_error_is_caught_before_oserror():
    """Python 3.11+ 中 asyncio.TimeoutError 是 OSError 子类——确认先捕超时。

    若顺序写反，超时会被当成"连接断开"处理，调用方就不会走自愈重试。
    """
    tab = _FakeTab(raises=asyncio.TimeoutError())

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(tab, "query=x", page=1))

    assert "无有效响应" in str(exc_info.value)


def test_non_json_payload_still_raises_runtime_error():
    """既有路径零回归：非 JSON 响应仍抛 RuntimeError。"""
    tab = _FakeTab(payload="<html>captcha</html>")

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(tab, "query=x", page=1))

    assert "非 JSON" in str(exc_info.value)


def test_platform_error_code_still_raises_runtime_error():
    """既有路径零回归：平台返回 code≠0 仍抛 RuntimeError 并带原因。"""
    payload = json.dumps({"code": 37, "message": "请求过于频繁"})
    tab = _FakeTab(payload=payload)

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(tab, "query=x", page=1))

    assert "code=37" in str(exc_info.value)
    assert "请求过于频繁" in str(exc_info.value)
