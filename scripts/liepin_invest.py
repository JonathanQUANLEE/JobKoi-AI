"""猎聘投递看门狗：调 src/liepin/apply.py 多轮，连续零新增就停。

与 BOSS 的 auto_invest.py 同思路，但猎聘走的是"聊一聊 + 发固定招呼语"，
去重维度 jobId + 公司名，日志在 logs/liepin_sent.jsonl / liepin_seen.jsonl。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SENT_LOG = ROOT / "logs" / "liepin_sent.jsonl"
DAILY_LIMIT = int(os.environ.get("LIEPIN_DAILY_LIMIT", "100"))
MAX_ROUNDS = 12          # 最多跑 12 轮（每轮 16 个关键词）
MAX_IDLE_ROUNDS = 3      # 连续 3 轮零新增就停（池子扫完）


def _today_sent() -> int:
    if not SENT_LOG.exists():
        return 0
    today = datetime.now().strftime("%Y-%m-%d")
    n = 0
    with SENT_LOG.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("sent") and str(r.get("ts") or "").startswith(today):
                n += 1
    return n


def _stamp() -> str:
    return datetime.now().strftime("%H:%M:%S")


def main() -> None:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["LIEPIN_DAILY_LIMIT"] = str(DAILY_LIMIT)
    rounds = 0
    idle = 0

    while True:
        today = _today_sent()
        if today >= DAILY_LIMIT:
            print(f"[{_stamp()}] 猎聘今日已投 {today}/{DAILY_LIMIT}，达上限，退出。")
            return
        rounds += 1
        if rounds > MAX_ROUNDS:
            print(f"[{_stamp()}] 已达 {MAX_ROUNDS} 轮，退出。")
            return

        before = today
        print(f"[{_stamp()}] ===== 猎聘第 {rounds} 轮（今日已投 {today}）=====")
        subprocess.run(
            [sys.executable, "src/liepin/apply.py"],
            cwd=str(ROOT),
            env=env,
        )

        gained = _today_sent() - before
        if gained > 0:
            idle = 0
            print(f"[{_stamp()}] 本轮新增 {gained} 条")
        else:
            idle += 1
            print(f"[{_stamp()}] 本轮零新增（连续 {idle}/{MAX_IDLE_ROUNDS} 轮）")
            if idle >= MAX_IDLE_ROUNDS:
                print(f"[{_stamp()}] 猎聘岗位池扫完或达限额，退出。")
                return
        time.sleep(3)


if __name__ == "__main__":
    main()
