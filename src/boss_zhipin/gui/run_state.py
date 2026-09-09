"""GUI 运行面板的轻量状态缓存。

前端实时运行时主要靠 ProgressEvent 更新；用户刷新窗口或重新打开页面时，
``get_run_state`` 用这里缓存的最近事件恢复运行面板。
"""

from __future__ import annotations

from typing import Any

from boss_zhipin.gui.events import ProgressEvent

_stats = {"scanned": 0, "sent": 0, "skipped": 0}
_current_job: dict[str, Any] | None = None
_latest_skip: dict[str, Any] | None = None
_latest_sent: dict[str, Any] | None = None
_page: dict[str, Any] | None = None
_page_filters: list[dict[str, Any]] = []


def record(event: ProgressEvent) -> None:
    """记录一条进度事件，供 ``get_run_state`` 汇总给 GUI。"""
    global _current_job, _latest_skip, _latest_sent, _page

    if event.kind == "page_opened":
        _page = dict(event.payload)
    elif event.kind == "page_filter":
        _page_filters.append(dict(event.payload))
    elif event.kind == "job_found":
        _stats["scanned"] += 1
        _current_job = dict(event.payload)
    elif event.kind == "job_skipped":
        _stats["skipped"] += 1
        _latest_skip = dict(event.payload)
    elif event.kind == "letter_sent":
        _latest_sent = dict(event.payload)
        if event.payload.get("status") == "sent":
            _stats["sent"] += 1
    elif event.kind == "review_requested":
        job = event.payload.get("job")
        if isinstance(job, dict):
            _current_job = dict(job)


def get_state(*, running: bool, review: dict[str, Any] | None = None) -> dict[str, Any]:
    """返回运行面板可直接消费的状态快照。"""
    return {
        "running": running,
        "review": review or {"pending": None},
        "stats": dict(_stats),
        "current_job": _current_job,
        "latest_skip": _latest_skip,
        "latest_sent": _latest_sent,
        "page": _page,
        "page_filters": list(_page_filters),
    }


def reset() -> None:
    """清空缓存；新一轮运行开始或测试清理时调用。"""
    global _current_job, _latest_skip, _latest_sent, _page

    _stats.update({"scanned": 0, "sent": 0, "skipped": 0})
    _current_job = None
    _latest_skip = None
    _latest_sent = None
    _page = None
    _page_filters.clear()
