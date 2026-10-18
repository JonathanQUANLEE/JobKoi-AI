"""BOSS 单轮投递上限「0=不限单轮」语义测试（2026-10-17 修复）。

用户实测事故：画像保存 max_sent 后巡航到 30 就停（日志 结束（max_sent）），
用户想要"投满日限才停"于是把「本次上限」设为 0——但 2026-10-15 设计的
「0=不限单轮」语义在重构中丢失：_auto_send_max_sent 的 minimum=1 把 0
钳成 1，用户设 0 反而只投 1 份就停（比 30 更糟的陷阱）。

行为规格（2026-10-15 设计复活）：
1. env 显式 "0" → None（不限单轮，跑满日限/岗位扫完才停）；
2. 正整数原样生效；未设回退默认 50；
3. 新号保护模式的窗口份额永远优先（即使不限也会被截住，保号优先）。
"""

from __future__ import annotations

import asyncio

from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.dispatch import env_config, search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"


def _api_job(eid: str) -> dict:
    return {
        "encryptJobId": eid,
        "jobName": "AI 应用工程师",
        "brandName": "某公司",
        "cityName": "深圳",
        "salaryDesc": "15-25K",
        "jobDegree": "本科",
    }


def _ret(value):
    async def _impl(*args, **kwargs):
        return value

    return _impl()


# ---------------------------------------------------------------------------
# 1. 单元：_auto_send_max_sent 的 0/正数/默认/保护份额语义
# ---------------------------------------------------------------------------


def test_env_zero_means_unlimited(monkeypatch):
    monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "0")
    assert env_config._auto_send_max_sent() is None


def test_env_positive_value_passes(monkeypatch):
    monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "30")
    assert env_config._auto_send_max_sent() == 30


def test_env_unset_falls_back_to_default(monkeypatch):
    monkeypatch.delenv("BOSS_AUTO_SEND_MAX_SENT", raising=False)
    assert env_config._auto_send_max_sent() == 50


def test_protection_share_overrides_even_unlimited(monkeypatch):
    """保护模式窗口份额永远优先：不限（0）也被截到份额。"""
    monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "0")
    monkeypatch.setenv("JOBHUNTER_WINDOW_MAX_SENT", "10")
    assert env_config._auto_send_max_sent() == 10


def test_protection_share_tightens_positive_value(monkeypatch):
    monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "30")
    monkeypatch.setenv("JOBHUNTER_WINDOW_MAX_SENT", "10")
    assert env_config._auto_send_max_sent() == 10


# ---------------------------------------------------------------------------
# 2. 流程级：设 0 后跑满日限才停（而不是旧 bug 的投 1 份就停）
# ---------------------------------------------------------------------------


def test_zero_run_max_runs_without_early_stop(monkeypatch):
    """单轮上限 0（不限）：全部 8 个岗位投完不提前停（旧 bug 是投 1 份就停）。

    dry_run 只计 sent_count 不计 daily_sent_count，故以"8 份全部投出 +
    自然扫完收尾"验证不提前停机。
    """
    collected: list[tuple[str, dict]] = []
    jobs = [job_api.parse_api_job(_api_job(f"e-{i}")) for i in range(8)]

    async def fake_fetch(tab, query, page):
        return jobs if page == 1 else []

    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(job_api, "fetch_search_page", fake_fetch)
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object())
    monkeypatch.setattr(search_api_flow, "_state_path", lambda name: None)
    monkeypatch.setattr(search_api_flow, "_profile_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_page_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_sent_today_count", lambda path, profile: 0)
    # 不 stub 读取函数：设 env "0" 走真实 _auto_send_max_sent 链路（0 → None）
    monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "0")
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: None)
    monkeypatch.setattr(search_api_flow, "_read_seen_job_keys", lambda path: set())
    monkeypatch.setattr(search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _ret(True))
    monkeypatch.setattr(search_api_flow, "_extract_detail_jd", lambda: _ret("岗位职责：负责AI应用开发。"))
    monkeypatch.setattr(finding_jobs, "get_text_by_css", lambda s, timeout=3: _ret("立即沟通"))
    monkeypatch.delenv("BOSS_LABEL", raising=False)

    from boss_zhipin.website_oper.core import browser_session

    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", lambda s, chunk=2.0: _ret(None))
    monkeypatch.setattr(browser_session, "human_pause", lambda a, b: _ret(None))

    asyncio.run(
        search_api_flow._run_search_api_flow(
            usr_name="测试",
            url="https://www.zhipin.com/web/geek/jobs?query=AI",
            dry_run=True,
            scan_only=False,
            greeting=GREETING,
        )
    )

    summaries = [p for k, p in collected if k == "api_flow_finished"]
    assert len(summaries) == 1
    # 不是旧 bug 的 max_sent=1 提前停：8 份全部投出、自然扫完收尾
    assert summaries[0]["stop_reason"] == "completed"
    assert summaries[0]["total"] == 8
