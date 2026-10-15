"""Windows 计划任务封装：GUI 闹钟的「系统级落点」。

背景（2026-10-11 用户拍板）：宠物闹钟原本只存 localStorage——App 关掉
就永远不会响。升级方案：用户在 GUI 设定时间 → 保存时把配置写成真正的
Windows 计划任务（App 关了也到点自动巡航），宠物端保留即时预览。

- 任务名固定 ``JobHunter定时巡航``，一天最多一个闹钟。
- ``/TR`` 命令完全由本模块拼接（任务名/时间/日期均无用户注入面）。
- 到点执行 ``scripts/scheduled_cruise.py``：三平台并行 + 使用 GUI 画像。
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)

TASK_NAME = "JobHunter定时巡航"
_SAFE_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# schtasks /SC WEEKLY /D 要求的三字母缩写
_WEEKDAY_CODES = {0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT"}

# repo 根（gui/scheduler.py → boss_zhipin → src → repo）
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _uv_path() -> str:
    found = shutil.which("uv")
    return found or "uv"


def _cruise_command() -> str:
    return (
        f'cmd /c "cd /d {REPO_ROOT} && '
        f'{(REPO_ROOT / "scripts" / "scheduled_cruise.py").as_posix()}"'
    )


def create_scheduled_task(
    *,
    time: str,
    repeat_days: list[int],
    command: str | None = None,
    task_name: str = TASK_NAME,
) -> dict:
    """创建/覆盖定时巡航计划任务。``time`` 形如 ``HH:MM``。

    ``repeat_days`` 为空或 7 天 → 每天（DAILY）；否则按星期（WEEKLY）。
    ``task_name`` 供新号保护模式注册多任务复用（默认单一闹钟，零回归）。
    """
    if not _SAFE_TIME.match(time or ""):
        raise ValueError(f"时间格式必须是 HH:MM（24 小时制），收到: {time!r}")
    days = sorted({int(day) for day in (repeat_days or []) if 0 <= int(day) <= 6})
    trigger_cmd = _cruise_command() if command is None else command

    if not days or len(days) >= 7:
        args = [
            "schtasks", "/Create", "/F",
            "/TN", task_name,
            "/SC", "DAILY",
            "/ST", time,
            "/TR", trigger_cmd,
        ]
        scope = "daily"
    else:
        day_codes = ",".join(_WEEKDAY_CODES[day] for day in days)
        args = [
            "schtasks", "/Create", "/F",
            "/TN", task_name,
            "/SC", "WEEKLY",
            "/D", day_codes,
            "/ST", time,
            "/TR", trigger_cmd,
        ]
        scope = f"weekly({','.join(str(d) for d in days)})"
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as e:
        log.warning("创建计划任务失败: %s", e)
        return {"status": "error", "message": str(e)}
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "").strip()[-300:]
        log.warning("schtasks 返回 %s: %s", result.returncode, message)
        return {"status": "error", "message": message}
    log.info("计划任务已创建：%s 每天 %s，%s", task_name, time, scope)
    return {"status": "ok", "task": task_name, "time": time, "scope": scope}


def delete_scheduled_task() -> dict:
    """删除定时巡航计划任务（不存在也返回 ok，幂等）。"""
    try:
        result = subprocess.run(
            ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as e:
        return {"status": "error", "message": str(e)}
    return {"status": "ok", "deleted": True}


def get_scheduled_task_status() -> dict:
    """查询定时巡航任务是否存在（返回给前端展示闹钟落盘状态）。"""
    try:
        result = subprocess.run(
            ["schtasks", "/Query", "/TN", TASK_NAME, "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as e:
        return {"exists": False, "error": str(e)}
    exists = result.returncode == 0 and TASK_NAME in result.stdout
    return {"exists": exists, "raw": result.stdout[:200]}


# ---------------------------------------------------------------------------
# 新号保护模式：每日三时段计划任务（2026-10-15）
#
# 三个任务执行**同一条命令**（scheduled_cruise.py 自己读保护配置算份额），
# 区别只在 /ST 触发时间。任务名独立于单一闹钟（JobHunter定时巡航），
# 互不干扰；保护模式开启时由 IPC 层负责删掉单一闹钟（接管语义）。
# ---------------------------------------------------------------------------

PROTECTION_TASK_PREFIX = "JobHunter新号保护巡航"


def _protection_task_name(index: int) -> str:
    return f"{PROTECTION_TASK_PREFIX}-{index}"


def create_protection_tasks(times: list[str]) -> list[dict]:
    """按时段列表创建保护巡航任务（每天重复，覆盖式 /F）。

    ``times`` 已由上层 validate_times 校验；这里再过一道 _SAFE_TIME
    （纵深防御：本模块是 schtasks 的唯一拼装点）。
    """
    results: list[dict] = []
    for index, time in enumerate(times, start=1):
        results.append(
            create_scheduled_task(
                time=time,
                repeat_days=[],  # 空 = DAILY（每天）
                task_name=_protection_task_name(index),
            )
        )
    return results


def delete_protection_tasks() -> dict:
    """删除全部保护巡航任务（不存在也返回 ok，幂等）。"""
    deleted: list[str] = []
    for index in range(1, 4):  # 上限 3 个时段
        name = _protection_task_name(index)
        try:
            result = subprocess.run(
                ["schtasks", "/Delete", "/TN", name, "/F"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except (OSError, subprocess.SubprocessError) as e:
            log.warning("删除保护任务 %s 失败: %s", name, e)
            continue
        if result.returncode == 0:
            deleted.append(name)
    return {"status": "ok", "deleted": deleted}


def get_protection_tasks_status() -> dict:
    """查询保护任务落盘状态（逐个查存在性，供前端展示）。"""
    statuses: dict[str, bool] = {}
    for index in range(1, 4):
        name = _protection_task_name(index)
        try:
            result = subprocess.run(
                ["schtasks", "/Query", "/TN", name, "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            statuses[name] = result.returncode == 0
        except (OSError, subprocess.SubprocessError):
            statuses[name] = False
    return {"exists": statuses, "count": sum(statuses.values())}