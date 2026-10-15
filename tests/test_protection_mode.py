"""新号保护模式测试（2026-10-15：每日三时段自动分配日限额）。

覆盖四层：
1. 配置 IO（app_data_dir/protection_mode.json 往返 + 容错）；
2. 份额计算（ceil(日额/时段数) → env 包络）；
3. scheduler 三任务注册/删除（schtasks 拼装参数断言，零回归兜底）；
4. IPC 命令（save_protection_mode 接管语义 + save_schedule 守卫 +
   env_config 钳制）。
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from boss_zhipin.config import protection
from boss_zhipin.gui import scheduler


def _use_tmp_appdata(monkeypatch, tmp_path: Path) -> Path:
    """把保护配置隔离进临时目录（conftest 会清 BOSS_APP_DATA_DIR）。"""
    monkeypatch.setenv("BOSS_APP_DATA_DIR", str(tmp_path))
    return tmp_path


def _fake_schtasks(monkeypatch) -> list[list[str]]:
    """替身 schtasks：记录全部调用，永远返回成功。"""
    calls: list[list[str]] = []

    class _R:
        returncode = 0
        stdout = "成功"
        stderr = ""

    def fake_run(args, capture_output=True, text=True, timeout=30):
        calls.append(list(args))
        return _R()

    monkeypatch.setattr("boss_zhipin.gui.scheduler.subprocess.run", fake_run)
    return calls


def _task_name_of(call: list[str]) -> str:
    return call[call.index("/TN") + 1]


# ---------------------------------------------------------------------------
# 1. 配置 IO
# ---------------------------------------------------------------------------


def test_config_roundtrip_and_preset_snapshot(monkeypatch, tmp_path):
    _use_tmp_appdata(monkeypatch, tmp_path)
    assert protection.load_protection_config() is None  # 未写过 → None（视为关闭）

    cfg = protection.build_config(enabled=True, times=["10:00", "15:00", "20:00"])
    protection.save_protection_config(cfg)

    loaded = protection.load_protection_config()
    assert loaded == cfg
    # 预设数字快照落盘（后续调预设不影响已开启用户）
    assert loaded["boss_daily"] == 30
    assert loaded["liepin_daily"] == 15
    assert loaded["job51_daily"] == 10


def test_corrupt_config_returns_none(monkeypatch, tmp_path):
    _use_tmp_appdata(monkeypatch, tmp_path)
    (tmp_path / protection.CONFIG_FILENAME).write_text("{not json", encoding="utf-8")
    assert protection.load_protection_config() is None


# ---------------------------------------------------------------------------
# 2. 时段校验与份额计算
# ---------------------------------------------------------------------------


def test_validate_times_dedupes_and_limits():
    assert protection.validate_times(["10:00", "10:00", "15:00"]) == ["10:00", "15:00"]
    assert protection.validate_times([" 20:00 ", ""]) == ["20:00"]
    with pytest.raises(ValueError):
        protection.validate_times(["25:00"])  # 非法 HH:MM
    with pytest.raises(ValueError):
        protection.validate_times([])
    with pytest.raises(ValueError):
        protection.validate_times(["10:00", "11:00", "12:00", "13:00"])  # >3


def test_protection_env_shares_three_windows():
    cfg = protection.build_config(enabled=True, times=["10:00", "15:00", "20:00"])
    env = protection.protection_env(cfg)
    assert env["JOBHUNTER_WINDOW_MAX_SENT"] == "10"  # ceil(30/3)
    assert env["JOBHUNTER_PROTECTION_DAILY"] == "30"
    assert env["LIEPIN_DAILY_LIMIT"] == "15"
    assert env["LIEPIN_RUN_MAX"] == "5"
    assert env["JOB51_DAILY_LIMIT"] == "10"
    assert env["JOB51_RUN_MAX"] == "4"  # ceil(10/3)


def test_protection_env_two_windows():
    cfg = protection.build_config(enabled=True, times=["10:00", "20:00"])
    env = protection.protection_env(cfg)
    assert env["JOBHUNTER_WINDOW_MAX_SENT"] == "15"
    assert env["LIEPIN_RUN_MAX"] == "8"
    assert env["JOB51_RUN_MAX"] == "5"


def test_apply_protection_env_off_by_default(monkeypatch, tmp_path):
    _use_tmp_appdata(monkeypatch, tmp_path)
    target: dict[str, str] = {}
    assert protection.apply_protection_env(target) is False
    assert target == {}


def test_apply_protection_env_injects_when_enabled(monkeypatch, tmp_path):
    _use_tmp_appdata(monkeypatch, tmp_path)
    protection.save_protection_config(
        protection.build_config(enabled=True, times=["10:00", "15:00", "20:00"])
    )
    target: dict[str, str] = {}
    assert protection.apply_protection_env(target) is True
    assert target["JOBHUNTER_WINDOW_MAX_SENT"] == "10"
    assert target["LIEPIN_RUN_MAX"] == "5"


# ---------------------------------------------------------------------------
# 3. scheduler：三任务注册 / 删除 / 零回归
# ---------------------------------------------------------------------------


def test_create_protection_tasks_registers_three_daily(monkeypatch):
    calls = _fake_schtasks(monkeypatch)
    results = scheduler.create_protection_tasks(["10:00", "15:00", "20:00"])
    assert all(r["status"] == "ok" for r in results)
    assert [_task_name_of(c) for c in calls] == [
        "JobHunter新号保护巡航-1",
        "JobHunter新号保护巡航-2",
        "JobHunter新号保护巡航-3",
    ]
    for call, time in zip(calls, ["10:00", "15:00", "20:00"]):
        assert call[call.index("/SC") + 1] == "DAILY"
        assert call[call.index("/ST") + 1] == time


def test_delete_protection_tasks_idempotent(monkeypatch):
    calls = _fake_schtasks(monkeypatch)
    result = scheduler.delete_protection_tasks()
    assert result["status"] == "ok"
    assert len(calls) == 3  # 不存在也逐个尝试删除（幂等）


def test_create_scheduled_task_default_name_unchanged(monkeypatch):
    """零回归：不传 task_name 时仍是单一闹钟任务名（现有行为一分不动）。"""
    calls = _fake_schtasks(monkeypatch)
    result = scheduler.create_scheduled_task(time="09:00", repeat_days=[])
    assert result["status"] == "ok"
    assert result["task"] == "JobHunter定时巡航"
    assert _task_name_of(calls[0]) == "JobHunter定时巡航"


# ---------------------------------------------------------------------------
# 4. IPC 命令 + 守卫 + env 钳制
# ---------------------------------------------------------------------------


def test_save_protection_mode_takes_over_single_alarm(monkeypatch, tmp_path):
    """开启 = 删单一闹钟（接管）+ 注册 3 个保护任务 + 配置落盘。"""
    _use_tmp_appdata(monkeypatch, tmp_path)
    calls = _fake_schtasks(monkeypatch)
    from boss_zhipin.tauri.commands import protection as protection_cmd

    body = protection_cmd._SaveProtectionBody(
        enabled=True, times=["10:00", "15:00", "20:00"]
    )
    result = asyncio.run(protection_cmd.save_protection_mode(body))
    assert result["status"] == "ok"
    assert result["enabled"] is True
    # 第一笔是删单一闹钟（接管语义）
    assert calls[0][0] == "schtasks" and "/Delete" in calls[0]
    assert _task_name_of(calls[0]) == "JobHunter定时巡航"
    # 随后注册 3 个保护任务
    assert [_task_name_of(c) for c in calls[1:]] == [
        "JobHunter新号保护巡航-1",
        "JobHunter新号保护巡航-2",
        "JobHunter新号保护巡航-3",
    ]
    # 配置已持久化
    assert protection.load_protection_config()["enabled"] is True


def test_save_protection_mode_disable_removes_tasks(monkeypatch, tmp_path):
    _use_tmp_appdata(monkeypatch, tmp_path)
    calls = _fake_schtasks(monkeypatch)
    from boss_zhipin.tauri.commands import protection as protection_cmd

    body = protection_cmd._SaveProtectionBody(enabled=False, times=["10:00"])
    result = asyncio.run(protection_cmd.save_protection_mode(body))
    assert result["status"] == "ok"
    assert len(calls) == 3  # 只删除，不注册
    assert protection.load_protection_config()["enabled"] is False


def test_save_protection_mode_rejects_bad_times(monkeypatch, tmp_path):
    _use_tmp_appdata(monkeypatch, tmp_path)
    calls = _fake_schtasks(monkeypatch)
    from boss_zhipin.tauri.commands import protection as protection_cmd

    body = protection_cmd._SaveProtectionBody(enabled=True, times=["9:00"])  # 非法
    result = asyncio.run(protection_cmd.save_protection_mode(body))
    assert result["status"] == "error"
    assert calls == []  # 未碰 schtasks
    assert protection.load_protection_config() is None  # 配置也没写


def test_save_schedule_guard_when_protection_on(monkeypatch, tmp_path):
    """保护模式开启中，单一闹钟保存被守卫拦截（防宠物 popover 复注册）。"""
    _use_tmp_appdata(monkeypatch, tmp_path)
    calls = _fake_schtasks(monkeypatch)
    protection.save_protection_config(
        protection.build_config(enabled=True, times=["10:00", "15:00", "20:00"])
    )
    from boss_zhipin.tauri.commands import schedule as schedule_cmd

    body = schedule_cmd._SaveScheduleBody(
        time="09:00", enabled=True, auto_run=True, repeat_days=[]
    )
    result = asyncio.run(schedule_cmd.save_schedule(body))
    assert result.get("superseded") is True
    assert calls == []  # 未创建任何任务


def test_env_config_caps_max_sent(monkeypatch):
    """BOSS 单轮上限钳制：只收紧不放宽；未设 = 旧行为。"""
    from boss_zhipin.website_oper.dispatch import env_config

    monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "50")
    monkeypatch.setenv("JOBHUNTER_WINDOW_MAX_SENT", "10")
    assert env_config._auto_send_max_sent() == 10
    monkeypatch.setenv("JOBHUNTER_WINDOW_MAX_SENT", "999")
    assert env_config._auto_send_max_sent() == 50  # 只收紧
    monkeypatch.setenv("JOBHUNTER_WINDOW_MAX_SENT", "abc")
    assert env_config._auto_send_max_sent() == 50  # 非法忽略
    monkeypatch.delenv("JOBHUNTER_WINDOW_MAX_SENT")
    assert env_config._auto_send_max_sent() == 50


def test_env_config_caps_daily_limit(monkeypatch):
    """BOSS 日额钳制：画像没设日限时保护日额仍生效（保护不依赖画像保存）。"""
    from boss_zhipin.website_oper.dispatch import env_config

    monkeypatch.setenv("BOSS_AUTO_SEND_DAILY_LIMIT", "80")
    monkeypatch.setenv("JOBHUNTER_PROTECTION_DAILY", "30")
    assert env_config._auto_send_daily_limit() == 30
    monkeypatch.delenv("BOSS_AUTO_SEND_DAILY_LIMIT")
    assert env_config._auto_send_daily_limit() == 30  # 无画像日额 → 保护日额兜底
    monkeypatch.setenv("BOSS_AUTO_SEND_DAILY_LIMIT", "20")
    assert env_config._auto_send_daily_limit() == 20  # 用户更保守 → 尊重更小值
    monkeypatch.delenv("JOBHUNTER_PROTECTION_DAILY")
    monkeypatch.delenv("BOSS_AUTO_SEND_DAILY_LIMIT")
    assert env_config._auto_send_daily_limit() is None  # 都没设 = 旧行为
