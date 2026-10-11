"""三平台自动投递调度：BOSS 直聘 + 猎聘 + 前程无忧 同时投（手动入口）。

三条独立的链，各自登录态、各自去重、各自限额，互不干扰；公共实现在
scripts/cruise_common.py。手动入口**不绑定** GUI 画像（沿用账号默认/启动 URL）；
定时巡航入口见 scheduled_cruise.py（绑定 gui-default 画像，由计划任务调用）。

用法：
    uv run python scripts/auto_apply.py          # 今天三平台各投一轮

环境变量：
    LIEPIN_DAILY_LIMIT  猎聘每日上限（默认 100）
    JOB51_DAILY_LIMIT   51job 每日上限（默认 40）
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.cruise_common import run_cruise_parallel  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="三平台自动投递调度")
    parser.add_argument("--days", type=int, default=1, help="保留参数，跨天续投由计划任务负责")
    parser.parse_args()

    print("=" * 60)
    print("三平台自动投递启动：BOSS 直聘 + 猎聘 + 前程无忧")
    print("=" * 60, flush=True)

    run_cruise_parallel()

    print("今日三平台投递结束。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
