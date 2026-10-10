"""定时巡航入口（被 Windows 计划任务「JobHunter定时巡航」调用）。

与旧 auto_apply.py 的区别：
- 使用 **GUI 求职画像**（默认 ``gui-default``，可用 BOSS_PROFILE 覆盖），
  投递口径跟随用户在软件里配置的画像；
- 三平台并行（BOSS 直聘 + 猎聘 + 前程无忧），各自登录态/去重/限额独立；
- BOSS 链带看门狗（挂死自动重启），猎聘/51job 各自一条龙脚本自带登录兜底。

用法（也可手动跑）：
    uv run python scripts/scheduled_cruise.py

环境变量：
    BOSS_PROFILE          BOSS 用的画像名（默认 gui-default）
    LIEPIN_DAILY_LIMIT    猎聘每日上限（默认 100）
    JOB51_DAILY_LIMIT     51job 每日上限（默认 40）
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _env(**extra: str) -> dict:
    e = os.environ.copy()
    e["PYTHONIOENCODING"] = "utf-8"
    e.update(extra)
    return e


def _run_boss() -> None:
    print("[boss] 启动 BOSS 链（登录 → 自动巡航投递 → 画像 gui-default）", flush=True)
    env = _env(
        BOSS_CLICK_ONLY="1",
        BOSS_AUTO_INVEST="1",
        BOSS_PROFILE=os.environ.get("BOSS_PROFILE", "gui-default"),
    )
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ensure_login.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[boss] BOSS 链结束", flush=True)


def _run_liepin() -> None:
    print("[liepin] 启动猎聘链（聊一聊 + 招呼语）", flush=True)
    env = _env(LIEPIN_DAILY_LIMIT=os.environ.get("LIEPIN_DAILY_LIMIT", "100"))
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "liepin_auto.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[liepin] 猎聘链结束", flush=True)


def _run_job51() -> None:
    print("[job51] 启动前程无忧链（投简历）", flush=True)
    env = _env(JOB51_DAILY_LIMIT=os.environ.get("JOB51_DAILY_LIMIT", "40"))
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "job51_auto.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[job51] 前程无忧链结束", flush=True)


def main() -> int:
    print("=" * 56)
    print(f"定时巡航启动：三平台并行 | BOSS 画像={os.environ.get('BOSS_PROFILE', 'gui-default')}")
    print("=" * 56, flush=True)

    threads = [
        threading.Thread(target=_run_boss, name="boss"),
        threading.Thread(target=_run_liepin, name="liepin"),
        threading.Thread(target=_run_job51, name="job51"),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    print("定时巡航结束。", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())