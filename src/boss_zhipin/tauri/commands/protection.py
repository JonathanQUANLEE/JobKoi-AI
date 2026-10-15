"""新号保护模式域（每日三时段自动分配日限额，2026-10-15）。

开启 = 持久化配置快照 + 删除单一闹钟（接管，防双倍投递）+ 注册 N 个
保护巡航计划任务；关闭 = 删除保护任务（单一闹钟配置留在前端
localStorage，用户去定时页重新保存即可恢复）。
"""
from __future__ import annotations

from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands


class _SaveProtectionBody(_CamelModel):
    enabled: bool = False
    times: list[str] = []


@commands.command()
async def get_protection_mode() -> dict:
    """读取保护配置 + Windows 任务落盘状态（前端卡片回显用）。"""
    from boss_zhipin.config.protection import (
        DEFAULT_TIMES,
        load_protection_config,
    )
    from boss_zhipin.gui.scheduler import get_protection_tasks_status

    cfg = load_protection_config() or {}
    tasks = get_protection_tasks_status()
    return {
        "enabled": bool(cfg.get("enabled")),
        "times": list(cfg.get("times") or DEFAULT_TIMES),
        "bossDaily": cfg.get("boss_daily"),
        "liepinDaily": cfg.get("liepin_daily"),
        "job51Daily": cfg.get("job51_daily"),
        "tasks": tasks,
    }


@commands.command()
async def save_protection_mode(body: _SaveProtectionBody) -> dict:
    """保存保护模式：持久化配置 + 同步 Windows 计划任务。

    - enabled：校验时段（1~3 个互异 HH:MM）→ 写配置快照 → 删单一闹钟
      （接管）→ 创建 N 个保护任务（每天重复）；
    - disabled：写 enabled=False → 删除全部保护任务。
    """
    from boss_zhipin.config.protection import (
        build_config,
        save_protection_config,
    )
    from boss_zhipin.gui.scheduler import (
        create_protection_tasks,
        delete_protection_tasks,
        delete_scheduled_task,
    )

    try:
        cfg = build_config(enabled=body.enabled, times=body.times)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    save_protection_config(cfg)

    if not body.enabled:
        result = delete_protection_tasks()
        return {"status": "ok", "enabled": False, **result}

    # 接管语义：删单一闹钟，防止双调度并存 = 双倍日投递
    delete_scheduled_task()
    created = create_protection_tasks(cfg["times"])
    failed = [r for r in created if r.get("status") != "ok"]
    if failed:
        return {
            "status": "error",
            "message": "；".join(str(r.get("message") or r) for r in failed),
            "enabled": True,
        }
    return {
        "status": "ok",
        "enabled": True,
        "tasks": [r.get("task") for r in created],
        "times": cfg["times"],
    }
