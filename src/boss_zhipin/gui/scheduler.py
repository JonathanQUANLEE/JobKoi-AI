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
    *, time: str, repeat_days: list[int], command: str | None = None
) -> dict:
    """创建/覆盖每天的定时巡航计划任务。``time`` 形如 ``HH:MM``。

    ``repeat_days`` 为空或 7 天 → 每天（DAILY）；否则按星期（WEEKLY）。
    """
    if not _SAFE_TIME.match(time or ""):
        raise ValueError(f"时间格式必须是 HH:MM（24 小时制），收到: {time!r}")
    days = sorted({int(day) for day in (repeat_days or []) if 0 <= int(day) <= 6})
    trigger_cmd = _cruise_command() if command is None else command

    if not days or len(days) >= 7:
        args = [
            "schtasks", "/Create", "/F",
            "/TN", TASK_NAME,
            "/SC", "DAILY",
            "/ST", time,
            "/TR", trigger_cmd,
        ]
        scope = "daily"
    else:
        day_codes = ",".join(_WEEKDAY_CODES[day] for day in days)
        args = [
            "schtasks", "/Create", "/F",
            "/TN", TASK_NAME,
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
    log.info("计划任务已创建：%s 每天 %s，%s", TASK_NAME, time, scope)
    return {"status": "ok", "task": TASK_NAME, "time": time, "scope": scope}


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