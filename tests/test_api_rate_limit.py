"""BOSS 搜索接口防过频（code=37）测试（2026-10-13 三项加固）。

用户实测事故回放：150 个岗位全是历史已投 → 每页秒过（无详情页/无发送
延迟）→ 13 秒翻 6 页 → 触发 wapi 频率限制 code=37，且旧代码只显示冰冷
代号、直接硬停整轮巡航。

加固点：
1. job_api 错误信息透传（code=37 + 平台人话 message）；
2. code=37 冷却 45s 重试一次：成功则继续巡航，仍失败才优雅结束；
3. 全跳过页自适应页间节流（<3s 秒过的页上浮到 4~6.5s，只慢不快）。
"""

from __future__ import annotations

import asyncio
import json

import pytest

from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.dispatch import search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"

RATE_LIMIT_ERROR = "搜索接口返回异常 code=37（当前请求过于频繁，请稍候再试）"


def _api_job(eid: str, name: str = "AI Agent 实习") -> dict:
    return {
        "encryptJobId": eid,
        "jobName": name,
        "brandName": "某公司",
        "cityName": "深圳",
        "salaryDesc": "200-300/天",
        "jobDegree": "本科",
    }


# ---------------------------------------------------------------------------
# 1. 错误信息透传（job_api 层）
# ---------------------------------------------------------------------------


class _FakeTab:
    def __init__(self, payload: str):
        self._payload = payload

    async def evaluate(self, _js):
        return self._payload


def test_rate_limit_error_carries_platform_message():
    """code=37 时必须把平台返回的"请求过于频繁"人话带上，不再只有代号。"""
    payload = json.dumps({"code": 37, "message": "当前请求过于频繁，请稍候再试"})
    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(_FakeTab(payload), "query=x", page=1))
    assert "code=37" in str(exc_info.value)
    assert "请求过于频繁" in str(exc_info.value)


def test_unknown_error_without_message_still_clean():
    payload = json.dumps({"code": 19, "msg": "参数不合法"})
    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(_FakeTab(payload), "query=x", page=1))
    assert "code=19" in str(exc_info.value)
    assert "参数不合法" in str(exc_info.value)


# ---------------------------------------------------------------------------
# 2/3. 冷却重试 + 自适应节流（search_api_flow 层）
# ---------------------------------------------------------------------------


def _install_stubs(monkeypatch, fetch_impl) -> tuple[list[tuple[str, dict]], list[float]]:
    """公共桩：事件收集 + 睡眠记录。返回 (事件列表, 睡眠时长列表)。"""
    collected: list[tuple[str, dict]] = []
    sleeps: list[float] = []

    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(job_api, "fetch_search_page", fetch_impl)
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object())
    monkeypatch.setattr(search_api_flow, "_state_path", lambda name: None)
    monkeypatch.setattr(search_api_flow, "_profile_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_sent_today_count", lambda path, profile: 0)
    monkeypatch.setattr(search_api_flow, "_auto_send_max_sent", lambda: 5)
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: 10)

    async def rec_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(search_api_flow.asyncio, "sleep", rec_sleep)
    return collected, sleeps


def _run_flow():
    asyncio.run(
        search_api_flow._run_search_api_flow(
            usr_name="测试",
            url="https://www.zhipin.com/web/geek/jobs?query=AI",
            dry_run=False,
            scan_only=False,
            greeting=GREETING,
        )
    )


def _seen_jobs(monkeypatch, eids: list[str]):
    jobs = [job_api.parse_api_job(_api_job(eid)) for eid in eids]
    seen_keys = {finding_jobs.job_key(job_api.to_job_posting(j)) for j in jobs}
    monkeypatch.setattr(search_api_flow, "_read_seen_job_keys", lambda path: seen_keys)
    return jobs


def test_code37_cooldown_retry_recovers(monkeypatch):
    """首次 code=37 → 冷却 45s 重试成功 → 巡航继续（不硬停浪费整轮）。"""
    state = {"page1_calls": 0}
    jobs = _seen_jobs(monkeypatch, ["e1", "e2"])

    async def fake_fetch(tab, query, page):
        if page == 1:
            state["page1_calls"] += 1
            if state["page1_calls"] == 1:
                raise RuntimeError(RATE_LIMIT_ERROR)
            return jobs
        return []  # 第 2 页自然取完 → 巡航正常结束

    collected, sleeps = _install_stubs(monkeypatch, fake_fetch)
    _run_flow()

    # 冷却动作真实发生（45 秒退避）
    assert 45.0 in sleeps
    # 用户可见的冷却提示（实时动态里出现"冷却"说明）
    cooldown_notices = [
        (kind, payload)
        for kind, payload in collected
        if kind == "api_flow_error" and "冷却" in str(payload.get("message", ""))
    ]
    assert len(cooldown_notices) == 1
    # 重试成功后巡航正常收尾（没有 api_error 停机）
    summaries = [payload for kind, payload in collected if kind == "api_flow_finished"]
    assert len(summaries) == 1
    assert "稍后再试" not in summaries[0].get("message", "")


def test_code37_retry_failure_stops_gracefully(monkeypatch):
    """冷却后重试仍被限制：优雅结束 + 明确建议（等待/换词），而非裸代号。"""
    _seen_jobs(monkeypatch, ["e1"])

    async def always_limited(tab, query, page):
        raise RuntimeError(RATE_LIMIT_ERROR)

    collected, sleeps = _install_stubs(monkeypatch, always_limited)
    _run_flow()

    # 冷却与最终失败两次提示都有
    error_messages = [
        str(payload.get("message", "")) for kind, payload in collected if kind == "api_flow_error"
    ]
    assert any("冷却 45 秒" in m for m in error_messages)
    assert any("冷却后仍触发频率限制" in m and "10 分钟" in m for m in error_messages)
    summaries = [payload for kind, payload in collected if kind == "api_flow_finished"]
    assert len(summaries) == 1
    assert "稍后再试" in summaries[0].get("message", "")


def test_fast_all_skip_page_gets_longer_throttle(monkeypatch):
    """全跳过页（秒过、无详情页）→ 页间节流上浮到 4~6.5s（防高频翻页）。"""
    jobs = _seen_jobs(monkeypatch, [f"e{i}" for i in range(5)])

    async def fake_fetch(tab, query, page):
        return jobs if page == 1 else []

    collected, sleeps = _install_stubs(monkeypatch, fake_fetch)
    _run_flow()

    # 第 1 页全 seen 秒过（<3s）→ 页间睡眠应出现 4.0~6.5 区间值
    assert any(4.0 <= s <= 6.5 for s in sleeps), f"页间节流未上浮: {sleeps}"


def test_non_37_error_still_stops_immediately(monkeypatch):
    """非频率限制错误（如 code=19 参数问题）：保持旧行为立即结束不重试。"""
    _seen_jobs(monkeypatch, ["e1"])

    async def bad_request(tab, query, page):
        raise RuntimeError("搜索接口返回异常 code=19（参数不合法）")

    collected, sleeps = _install_stubs(monkeypatch, bad_request)
    _run_flow()

    # 不进入冷却（无 45s 睡眠），直接报错结束
    assert 45.0 not in sleeps
    error_messages = [
        str(payload.get("message", "")) for kind, payload in collected if kind == "api_flow_error"
    ]
    assert any("code=19" in m for m in error_messages)
