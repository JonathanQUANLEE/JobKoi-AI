"""双平台自动投递调度：BOSS 直聘 + 猎聘 同时投。

两条独立的链，各自登录态、各自去重、各自限额，互不干扰：
- BOSS：`ensure_login.py`（登录 → 接管 `auto_invest.py`），只点"立即沟通"零消息，每日 150
- 猎聘：`liepin_auto.py`（登录 → 接管 `liepin_invest.py`），点"聊一聊" + 发固定招呼语，每日 100（可调）

用法：
    uv run python scripts/auto_apply.py          # 今天两平台各投一轮
跨天续投靠 Windows 计划任务（每天 09:00 触发），不靠长驻进程（扛不住休眠/关机）。

环境变量：
    LIEPIN_DAILY_LIMIT  猎聘每日上限（默认 100）
"""

from __future__ import annotations

import argparse
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
    print("[boss] 启动 BOSS 链（登录 → 只点立即沟通 → 每日 150）", flush=True)
    env = _env(BOSS_CLICK_ONLY="1", BOSS_AUTO_INVEST="1")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ensure_login.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[boss] BOSS 链结束", flush=True)


def _run_liepin() -> None:
    print("[liepin] 启动猎聘链（登录 → 聊一聊+招呼语 → 每日上限）", flush=True)
    env = _env(LIEPIN_DAILY_LIMIT=os.environ.get("LIEPIN_DAILY_LIMIT", "100"))
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "liepin_auto.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[liepin] 猎聘链结束", flush=True)


def _run_job51() -> None:
    print("[job51] 启动前程无忧链（登录 → 投简历 → 每日上限）", flush=True)
    env = _env(JOB51_DAILY_LIMIT=os.environ.get("JOB51_DAILY_LIMIT", "40"))
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "job51_auto.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[job51] 前程无忧链结束", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="三平台自动投递调度")
    parser.add_argument("--days", type=int, default=1, help="保留参数，跨天续投由计划任务负责")
    parser.parse_args()

    print("=" * 60)
    print("三平台自动投递启动：BOSS 直聘 + 猎聘 + 前程无忧")
    print("=" * 60)

    threads = [
        threading.Thread(target=_run_boss, name="boss"),
        threading.Thread(target=_run_liepin, name="liepin"),
        threading.Thread(target=_run_job51, name="job51"),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    print("今日三平台投递结束。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
