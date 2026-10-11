"""platforms/limits.py 每日限额单一来源的回归测试。

历史上默认上限散落 5+ 处并发生过漂移（quick_stats 200 vs 实际 150）。
本测试钉住「所有消费方都引用同一来源」，谁再硬编码一个数字谁就挂测试。
"""
from __future__ import annotations

from boss_zhipin.gui.stats_io import (
    BOSS_DAILY_LIMIT,
    JOB51_DAILY_LIMIT,
    LIEPIN_DAILY_LIMIT,
)
from boss_zhipin.platforms.limits import DEFAULT_DAILY_LIMITS


def test_default_daily_limits_values():
    # 用户要求：BOSS 150（与 profiles/0my.yml 一致）/ 猎聘 100 / 51job 40
    assert DEFAULT_DAILY_LIMITS == {"boss": 150, "liepin": 100, "job51": 40}


def test_stats_io_limits_come_from_single_source():
    assert BOSS_DAILY_LIMIT == DEFAULT_DAILY_LIMITS["boss"]
    assert LIEPIN_DAILY_LIMIT == DEFAULT_DAILY_LIMITS["liepin"]
    assert JOB51_DAILY_LIMIT == DEFAULT_DAILY_LIMITS["job51"]
