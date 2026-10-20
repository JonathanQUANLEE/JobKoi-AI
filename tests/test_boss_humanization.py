"""BOSS 拟人化改造测试（2026-10-15 三平台封号复盘）。

调研结论落地（来源见 browser_session.human_pause 注释）：
1. 高斯钟形停顿 + 区间截断（均匀分布也是机器签名）；
2. 详情页"阅读"停顿 6~15s（旧固定 2s 秒开秒关是高频访问画像）；
3. 批次休息：连投 5~8 个后休 3~8 分钟（带站岗）。
"""

from __future__ import annotations

import asyncio

from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.core import browser_session
from boss_zhipin.website_oper.dispatch import search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"


def _api_job(eid: str) -> dict:
    return {
        "encryptJobId": eid,
        "jobName": "AI Agent 实习",
        "brandName": "某公司",
        "cityName": "深圳",
        "salaryDesc": "200-300/天",
        "jobDegree": "本科",
    }


# ---------------------------------------------------------------------------
# 1. 高斯停顿：钟形分布 + 区间截断（带站岗睡眠路由）
# ---------------------------------------------------------------------------


def test_human_pause_clamps_and_routes_guard(monkeypatch):
    """高斯采样越界截断回 [low, high]，且睡眠走带站岗通道。"""
    recorded: list[float] = []

    async def fake_guard(seconds, chunk: float = 2.0):
        recorded.append(seconds)

    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", fake_guard)

    import random

    monkeypatch.setattr(random, "gauss", lambda mid, sigma: 999.0)
    asyncio.run(browser_session.human_pause(6.0, 15.0))
    assert recorded == [15.0]

    monkeypatch.setattr(random, "gauss", lambda mid, sigma: -1.0)
    asyncio.run(browser_session.human_pause(6.0, 15.0))
    assert recorded == [15.0, 6.0]

    monkeypatch.setattr(random, "gauss", lambda mid, sigma: 11.5)
    asyncio.run(browser_session.human_pause(6.0, 15.0))
    assert recorded == [15.0, 6.0, 11.5]


# ---------------------------------------------------------------------------
# 2. 详情页阅读停顿（6~15s，替代固定 2s）
# ---------------------------------------------------------------------------


def test_open_job_detail_page_reading_pause(monkeypatch):
    """打开详情页后的停顿必须落在 6~15s（模拟真人读 JD）。"""
    recorded: list[float] = []

    async def fake_guard(seconds, chunk: float = 2.0):
        recorded.append(seconds)

    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", fake_guard)

    class _FakeTab:
        async def get(self, url):
            return None

    monkeypatch.setattr(finding_jobs, "get_tab", lambda: _FakeTab())
    # 2026-10-20 重定向检测契约：停留页 URL 须含 job_detail 才算打开成功
    monkeypatch.setattr(
        finding_jobs,
        "get_current_url",
        lambda: "https://www.zhipin.com/job_detail/x.html",
    )

    status = asyncio.run(
        search_api_flow._open_job_detail_page("https://www.zhipin.com/job_detail/x.html")
    )
    assert status == "ok"
    assert len(recorded) == 1
    assert 6.0 <= recorded[0] <= 15.0


# ---------------------------------------------------------------------------
# 3. 批次休息：连投 N 个后长休息
# ---------------------------------------------------------------------------


def test_api_flow_batch_break_after_threshold(monkeypatch):
    """连投 5 个（阈值钉死 5）→ 出现 3~8 分钟的带站岗长休息。"""
    jobs = [job_api.parse_api_job(_api_job(f"e{i}")) for i in range(6)]
    collected: list[tuple[str, dict]] = []
    guard_sleeps: list[float] = []
    sends = {"n": 0}

    async def fake_fetch(tab, query, page):
        return jobs if page == 1 else []

    async def fake_process(**kwargs):
        sends["n"] += 1
        return "sent", sends["n"], sends["n"]

    async def fake_guard(seconds, chunk: float = 2.0):
        guard_sleeps.append(seconds)

    async def fast_sleep(_s):
        return None

    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(job_api, "fetch_search_page", fake_fetch)
    monkeypatch.setattr(search_api_flow, "_process_single_api_job", fake_process)
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object())
    monkeypatch.setattr(search_api_flow, "_state_path", lambda name: None)
    monkeypatch.setattr(search_api_flow, "_profile_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_sent_today_count", lambda path, profile: 0)
    monkeypatch.setattr(search_api_flow, "_auto_send_max_sent", lambda: 10)
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: 10)
    monkeypatch.setattr(search_api_flow, "_page_filters", lambda: {})
    monkeypatch.setattr(search_api_flow.asyncio, "sleep", fast_sleep)
    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", fake_guard)
    # 批次阈值钉死 5：第 5 个招呼后必休息
    monkeypatch.setattr(search_api_flow.random, "randint", lambda a, b: 5)

    asyncio.run(
        search_api_flow._run_search_api_flow(
            usr_name="测试",
            url="https://www.zhipin.com/web/geek/jobs?query=AI",
            dry_run=False,
            scan_only=False,
            greeting=GREETING,
        )
    )

    assert sends["n"] == 6
    # 批次长休息发生（180~480s；页间隔 3~15s 都到不了 180）
    assert any(180.0 <= s <= 480.0 for s in guard_sleeps), f"未出现批次休息: {guard_sleeps}"
    # 正常收尾
    summaries = [p for k, p in collected if k == "api_flow_finished"]
    assert summaries[0]["stop_reason"] == "completed"
    assert summaries[0]["total"] == 6
