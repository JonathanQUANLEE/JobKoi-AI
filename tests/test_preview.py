"""preview_jobs + agent_execute_action 单测（mock 浏览器层，不发真请求）。"""
from __future__ import annotations

import asyncio
import json

import pytest

from boss_zhipin.gui import preview as preview_mod
from boss_zhipin.gui.preview import preview_jobs
from boss_zhipin.website_oper.finding_jobs import JobPosting


def _job(index: int, title: str = "AI Agent 实习") -> JobPosting:
    return JobPosting(
        title=title,
        description="负责 Agent 开发",
        company=f"公司{index}",
        location="深圳",
        salary="20-30K",
    )


def _mock_browser(monkeypatch, jobs: list[JobPosting] | None, loaded: int | None = None):
    """mock finding_jobs：jobs=None 表示没 tab；loaded=0 表示页面没岗位卡。"""
    from boss_zhipin.website_oper import finding_jobs

    async def fake_count() -> int:
        return loaded if loaded is not None else len(jobs or [])

    async def fake_get(index: int):
        if jobs is None or index > len(jobs):
            return None
        return jobs[index - 1]

    async def _fast_sleep(_delay: float):
        return None

    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object() if jobs is not None else None)
    monkeypatch.setattr(finding_jobs, "get_loaded_job_count", fake_count)
    monkeypatch.setattr(finding_jobs, "get_job_by_index", fake_get)
    monkeypatch.setattr(preview_mod.asyncio, "sleep", _fast_sleep)


def test_preview_jobs_without_browser(monkeypatch):
    _mock_browser(monkeypatch, jobs=None)
    result = asyncio.run(preview_jobs(5))
    assert result["status"] == "error"
    assert result["code"] == "no_browser"
    assert "打开 BOSS 页面" in result["message"]


def test_preview_jobs_empty_page(monkeypatch):
    _mock_browser(monkeypatch, jobs=[], loaded=0)
    result = asyncio.run(preview_jobs(5))
    assert result["status"] == "error"
    assert result["code"] == "no_jobs"


def test_preview_jobs_lists_and_matches(monkeypatch):
    _mock_browser(
        monkeypatch,
        jobs=[_job(1), _job(2, title="销售专员"), _job(3)],
    )
    result = asyncio.run(preview_jobs(3))
    assert result["status"] == "ok"
    assert result["data"]["scanned"] == 3
    titles = [item["title"] for item in result["data"]["jobs"]]
    assert "销售专员" in titles
    assert "√" in result["text"]


def test_preview_jobs_respects_profile_filters(monkeypatch):
    _mock_browser(monkeypatch, jobs=[_job(1, title="销售专员")])
    monkeypatch.setenv(
        "BOSS_PROFILE_FILTERS_JSON",
        json.dumps({"title": {"exclude": {"enabled": True, "keywords": ["销售"]}}}),
    )
    result = asyncio.run(preview_jobs(1))
    assert result["status"] == "ok"
    assert result["data"]["jobs"][0]["matched"] is False
    assert "×" in result["text"]


def test_preview_jobs_clamps_n(monkeypatch):
    _mock_browser(monkeypatch, jobs=[_job(i) for i in range(1, 4)])
    result = asyncio.run(preview_jobs(99))
    # 只 mock 了 3 个岗位，最多读 3 个（mock 的 get_job_by_index 越界返回 None）
    assert result["data"]["scanned"] == 3


# ---------- IPC 层 agent_execute_action ----------


def test_execute_get_stats(monkeypatch, tmp_path):
    from boss_zhipin.gui import stats_io
    from boss_zhipin.tauri import _AgentExecuteActionBody, agent_execute_action

    monkeypatch.setattr(stats_io, "query_stats", lambda: {"boss": {"label": "BOSS 直聘", "today": 3, "total": 100, "limit": 150, "remaining": 147, "recent": []}})
    result = asyncio.run(
        agent_execute_action(_AgentExecuteActionBody(type="get_stats"))
    )
    assert result["status"] == "ok"
    assert "BOSS 直聘" in result["text"]


def test_execute_unknown_action_raises():
    from boss_zhipin.tauri import _AgentExecuteActionBody, agent_execute_action

    with pytest.raises(ValueError):
        asyncio.run(
            agent_execute_action(_AgentExecuteActionBody(type="prepare_run"))
        )


def test_execute_preview_jobs_passthrough(monkeypatch):
    from boss_zhipin.tauri import _AgentExecuteActionBody, agent_execute_action

    async def fake_preview(n):
        return {"status": "ok", "type": "preview_jobs", "text": "x", "data": {"scanned": n}}

    monkeypatch.setattr("boss_zhipin.gui.preview.preview_jobs", fake_preview)
    result = asyncio.run(
        agent_execute_action(
            _AgentExecuteActionBody(type="preview_jobs", params={"n": 7})
        )
    )
    assert result["data"]["scanned"] == 7
