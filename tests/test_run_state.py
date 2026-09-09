from __future__ import annotations

from boss_zhipin.gui import run_state
from boss_zhipin.gui.events import ProgressEvent


def test_run_state_records_dashboard_fields_from_events():
    run_state.reset()

    run_state.record(
        ProgressEvent(
            kind="job_found",
            payload={
                "index": 1,
                "title": "后端开发实习",
                "company": "测试公司",
                "location": "深圳",
                "match_reason": "标题命中后端开发和实习",
            },
        )
    )
    run_state.record(
        ProgressEvent(
            kind="job_skipped",
            payload={"index": 2, "reason": "标题缺少实习"},
        )
    )
    run_state.record(
        ProgressEvent(
            kind="letter_sent",
            payload={"index": 3, "status": "sent"},
        )
    )

    state = run_state.get_state(running=True)

    assert state["running"] is True
    assert state["current_job"] == {
        "index": 1,
        "title": "后端开发实习",
        "company": "测试公司",
        "location": "深圳",
        "match_reason": "标题命中后端开发和实习",
    }
    assert state["latest_skip"] == {"index": 2, "reason": "标题缺少实习"}
    assert state["latest_sent"] == {"index": 3, "status": "sent"}
    assert state["stats"] == {"scanned": 1, "sent": 1, "skipped": 1}


def test_run_state_counts_only_real_sent_letters():
    run_state.reset()

    run_state.record(ProgressEvent(kind="letter_sent", payload={"status": "dry_run"}))
    run_state.record(ProgressEvent(kind="letter_sent", payload={"status": "blocked"}))
    run_state.record(ProgressEvent(kind="letter_sent", payload={"status": "sent"}))

    assert run_state.get_state(running=False)["stats"]["sent"] == 1


def test_run_state_reset_clears_previous_events():
    run_state.reset()
    run_state.record(ProgressEvent(kind="job_found", payload={"index": 1}))

    run_state.reset()

    state = run_state.get_state(running=False)
    assert state["stats"] == {"scanned": 0, "sent": 0, "skipped": 0}
    assert state["current_job"] is None


def test_run_state_records_url_and_page_filter_status():
    run_state.reset()

    run_state.record(
        ProgressEvent(
            kind="page_opened",
            payload={
                "requested_url": "https://www.zhipin.com/web/geek/jobs?city=101280600",
                "actual_url": "https://www.zhipin.com/web/geek/jobs?city=101280600",
                "redirected": False,
            },
        )
    )
    run_state.record(
        ProgressEvent(
            kind="page_filter",
            payload={
                "group": "city",
                "value": "深圳",
                "status": "failed",
                "message": "页面筛选失败：城市=深圳。已继续运行，本地规则继续兜底。",
            },
        )
    )

    state = run_state.get_state(running=True)

    assert state["page"] == {
        "requested_url": "https://www.zhipin.com/web/geek/jobs?city=101280600",
        "actual_url": "https://www.zhipin.com/web/geek/jobs?city=101280600",
        "redirected": False,
    }
    assert state["page_filters"] == [
        {
            "group": "city",
            "value": "深圳",
            "status": "failed",
            "message": "页面筛选失败：城市=深圳。已继续运行，本地规则继续兜底。",
        }
    ]
