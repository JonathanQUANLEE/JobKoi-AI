"""定时巡航入口（被 Windows 计划任务「JobHunter定时巡航」调用）。

与手动入口 auto_apply.py 的区别：使用 **GUI 求职画像**（默认 ``gui-default``，
可用 BOSS_PROFILE 覆盖），投递口径跟随用户在软件里配置的画像。
三平台并行（BOSS 直聘 + 猎聘 + 前程无忧），各自登录态/去重/限额独立；
公共实现在 scripts/cruise_common.py。BOSS 链带看门狗（挂死自动重启）。

新号保护模式（2026-10-15）：三时段保护任务与本入口共用同一条命令——
启动时读保护配置（app_data_dir/protection_mode.json），开启则按
「日额/时段数」算出各平台单轮上限注入 env。单轮上限 × 日累计上限
（sent log 跨轮累计）相与，天然实现每时段 1/3、全天不超额的分配。

用法（也可手动跑）：
    uv run python scripts/scheduled_cruise.py

环境变量：
    BOSS_PROFILE          BOSS 用的画像名（默认 gui-default）
    LIEPIN_DAILY_LIMIT    猎聘每日上限（默认 100）
    JOB51_DAILY_LIMIT     51job 每日上限（默认 40）
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.cruise_common import run_cruise_parallel  # noqa: E402


def main() -> int:
    profile = os.environ.get("BOSS_PROFILE", "gui-default")
    print("=" * 56)
    print(f"定时巡航启动：三平台并行 | BOSS 画像={profile}")
    print("=" * 56, flush=True)

    # 新号保护模式：开启则注入保护包络（env 层强制，不依赖画像是否保存）
    from boss_zhipin.config.protection import apply_protection_env

    if apply_protection_env():
        from boss_zhipin.config.protection import load_protection_config

        cfg = load_protection_config() or {}
        print(
            f"[protection] 新号保护模式生效：每日 {len(cfg.get('times') or [])} 个时段，"
            "各平台按份额限流（单轮上限见 env）",
            flush=True,
        )

    run_cruise_parallel(boss_profile=profile)

    print("定时巡航结束。", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
