"""api-flow 结束汇总事件单测。

背景（2026-10-12 用户实测）：150 个岗位全部被秒级跳过、0 投递，巡航正常
结束但没有任何解释——用户以为卡死。现在 ``_run_search_api_flow`` 结束时
必须 emit ``api_flow_finished`` 汇总（跳过分类计数 + 停机原因 + 人话解释）。
"""

from __future__ import annotations

import asyncio

from boss_zhipin.config.rule_models import PostingMatch
from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.dispatch import search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"


def _api_job(eid: str, name: str = "AI Agent 实习") -> dict:
    return {
        "encryptJobId": eid,
        "jobName": name,
        "brandName": "某公司",
        "cityName": "深圳",
        "salaryDesc": "200-300/天",
        "jobDegree": "本科",
    }


def _install_common_stubs(monkeypatch, pages: dict[int, list]) -> list[tuple[str, dict]]:
    """公共桩：事件收集 + 翻页 + tab/状态路径/计数。返回事件收集列表。"""
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )

    async def fake_fetch(tab, query, page):
        return pages.get(page, [])

    monkeypatch.setattr(job_api, "fetch_search_page", fake_fetch)
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object())
    monkeypatch.setattr(search_api_flow, "_state_path", lambda name: None)
    monkeypatch.setattr(search_api_flow, "_profile_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_sent_today_count", lambda path, profile: 0)
    monkeypatch.setattr(search_api_flow, "_auto_send_max_sent", lambda: 5)
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: 10)

    async def fast_sleep(_s):
        return None

    monkeypatch.setattr(search_api_flow.asyncio, "sleep", fast_sleep)
    return collected


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


def test_api_flow_summary_all_duplicates(monkeypatch):
    """全部岗位已投过：汇总必须说清「0 投递因为全部投过」。"""
    jobs = [job_api.parse_api_job(_api_job("e1")), job_api.parse_api_job(_api_job("e2"))]
    collected = _install_common_stubs(monkeypatch, pages={1: jobs})

    seen_keys = {finding_jobs.job_key(job_api.to_job_posting(j)) for j in jobs}
    monkeypatch.setattr(search_api_flow, "_read_seen_job_keys", lambda path: seen_keys)

    _run_flow()

    finished = [p for kind, p in collected if kind == "api_flow_finished"]
    assert len(finished) == 1
    payload = finished[0]
    assert payload["scanned"] == 2
    assert payload["skipped_duplicates"] == 2
    assert payload["total"] == 0
    assert payload["stop_reason"] == "completed"
    assert "已全部投递过" in payload["message"]


def test_api_flow_summary_all_filtered(monkeypatch):
    """全部岗位被规则过滤：汇总必须引导用户去调画像规则。"""
    jobs = [job_api.parse_api_job(_api_job("e1"))]
    collected = _install_common_stubs(monkeypatch, pages={1: jobs})
    monkeypatch.setattr(search_api_flow, "_read_seen_job_keys", lambda path: set())

    def never_match(posting, filters):
        return PostingMatch(
            matched=False,
            stage="any",
            reason="未命中方向关键词",
            matched_keywords=[],
            missing_keywords=["AI"],
        )

    monkeypatch.setattr(search_api_flow, "match_posting", never_match)

    _run_flow()

    finished = [p for kind, p in collected if kind == "api_flow_finished"]
    assert len(finished) == 1
    payload = finished[0]
    assert payload["scanned"] == 1
    assert payload["skipped_filtered"] == 1
    assert payload["total"] == 0
    assert "不匹配" in payload["message"]


def test_api_flow_summary_reports_api_error(monkeypatch):
    """搜索接口风控（code=37 同款路径）：汇总带 api_error 停机原因。"""
    collected: list[tuple[str, dict]] = []

    async def failing_fetch(tab, query, page):
        raise RuntimeError("搜索接口返回异常 code=37")

    monkeypatch.setattr(job_api, "fetch_search_page", failing_fetch)
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object())
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(search_api_flow, "_state_path", lambda name: None)
    monkeypatch.setattr(search_api_flow, "_profile_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_sent_today_count", lambda path, profile: 0)

    _run_flow()

    finished = [p for kind, p in collected if kind == "api_flow_finished"]
    assert len(finished) == 1
    assert finished[0]["stop_reason"] == "api_error"
    assert "风控限流" in finished[0]["message"]
    errors = [p for kind, p in collected if kind == "api_flow_error"]
    assert len(errors) == 1
