"""定时巡航闹钟域（系统级 Windows 计划任务）。

用户设定时间保存后 → 写成计划任务「JobHunter定时巡航」，App 关掉也到点自动跑；
执行体是 scripts/scheduled_cruise.py（三平台并行 + GUI 画像 gui-default）。
"""
from __future__ import annotations

from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands


class _SaveScheduleBody(_CamelModel):
    time: str = "09:00"
    enabled: bool = False
    repeat_days: list[int] = []
    auto_run: bool = False


@commands.command()
async def get_schedule_status() -> dict:
    """查询定时巡航计划任务落盘状态。"""
    from boss_zhipin.gui.scheduler import get_scheduled_task_status

    return get_scheduled_task_status()


@commands.command()
async def save_schedule(body: _SaveScheduleBody) -> dict:
    """保存闹钟：启用则创建/覆盖 Windows 计划任务，停用则删除。

    守卫（2026-10-15）：新号保护模式开启中，单一闹钟被三时段保护任务
    接管——这里直接跳过创建（防宠物 popover 等入口复注册导致双倍投递），
    返回 superseded 让前端能识别「不是失败，是被接管」。
    """
    from boss_zhipin.config.protection import load_protection_config
    from boss_zhipin.gui.scheduler import (
        create_scheduled_task,
        delete_scheduled_task,
    )

    protection = load_protection_config()
    if protection and bool(protection.get("enabled")):
        return {
            "status": "ok",
            "superseded": True,
            "message": "新号保护模式接管中，单一闹钟暂不生效。",
        }

    if not body.enabled or not body.auto_run:
        return delete_scheduled_task()
    return create_scheduled_task(time=body.time, repeat_days=body.repeat_days)


@commands.command()
async def cancel_schedule() -> dict:
    """停用闹钟：删除计划任务。"""
    from boss_zhipin.gui.scheduler import delete_scheduled_task

    return delete_scheduled_task()
