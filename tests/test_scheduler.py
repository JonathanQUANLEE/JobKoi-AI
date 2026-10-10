"""定时巡航计划任务封装（gui/scheduler.py）单测——mock subprocess，不发真命令。"""
from __future__ import annotations

import subprocess

import pytest

from boss_zhipin.gui import scheduler
from boss_zhipin.gui.scheduler import (
    TASK_NAME,
    create_scheduled_task,
    delete_scheduled_task,
    get_scheduled_task_status,
)


@pytest.fixture(autouse=True)
def _fake_uv(monkeypatch):
    monkeypatch.setattr(scheduler.shutil, "which", lambda _: "C:/fake/uv.exe")


class _FakeCompleted:
    def __init__(self, rc: int = 0, stdout: str = "", stderr: str = ""):
        self.returncode = rc
        self.stdout = stdout
        self.stderr = stderr


def test_create_daily_task(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return _FakeCompleted(0, "", "")

    monkeypatch.setattr(scheduler.subprocess, "run", fake_run)
    result = create_scheduled_task(time="09:00", repeat_days=[])
    assert result["status"] == "ok"
    joined = " ".join(calls[0])
    assert TASK_NAME in joined
    assert "/SC" in joined and "DAILY" in joined
    assert "/ST" in joined and "09:00" in joined


def test_create_weekly_task_maps_days(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return _FakeCompleted(0, "", "")

    monkeypatch.setattr(scheduler.subprocess, "run", fake_run)
    result = create_scheduled_task(time="08:30", repeat_days=[1, 2, 3, 4, 5])
    assert result["status"] == "ok"
    joined = " ".join(calls[0])
    assert "WEEKLY" in joined
    assert "MON,TUE,WED,THU,FRI" in joined


def test_create_rejects_bad_time():
    with pytest.raises(ValueError):
        create_scheduled_task(time="9:00", repeat_days=[])
    with pytest.raises(ValueError):
        create_scheduled_task(time="25:00", repeat_days=[])
    with pytest.raises(ValueError):
        create_scheduled_task(time="hello", repeat_days=[])


def test_create_reports_schtasks_error(monkeypatch):
    def fake_run(args, **kwargs):
        return _FakeCompleted(1, "", "ERROR: Access is denied.")

    monkeypatch.setattr(scheduler.subprocess, "run", fake_run)
    result = create_scheduled_task(time="09:00", repeat_days=[])
    assert result["status"] == "error"
    assert "ERROR" in result["message"]


def test_delete_scheduled_task(monkeypatch):
    monkeypatch.setattr(
        scheduler.subprocess,
        "run",
        lambda args, **kwargs: _FakeCompleted(0, "成功: 已终止计划任务", ""),
    )
    result = delete_scheduled_task()
    assert result["status"] == "ok"


def test_get_status_exists(monkeypatch):
    monkeypatch.setattr(
        scheduler.subprocess,
        "run",
        lambda args, **kwargs: _FakeCompleted(0, f'"{TASK_NAME}"', ""),
    )
    status = get_scheduled_task_status()
    assert status["exists"] is True


def test_get_status_missing(monkeypatch):
    monkeypatch.setattr(
        scheduler.subprocess,
        "run",
        lambda args, **kwargs: _FakeCompleted(1, "", ""),
    )
    status = get_scheduled_task_status()
    assert status["exists"] is False