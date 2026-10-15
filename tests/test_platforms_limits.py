"""platforms/limits.py 安全数值单一来源的回归测试。

历史上默认上限散落 5+ 处并发生过漂移（quick_stats 200 vs 实际 150）。
本测试钉住「所有消费方都引用同一来源」，谁再硬编码一个数字谁就挂测试。
2026-10-12 新增：拟人化节流安全区间 [15, 45]s（用户拍板，依据同类工具
风控调研——影刀 RPA 文档「打招呼至少 15s 一次」；红线：本工具不提速）。
"""
from __future__ import annotations

from boss_zhipin.gui.stats_io import (
    BOSS_DAILY_LIMIT,
    JOB51_DAILY_LIMIT,
    LIEPIN_DAILY_LIMIT,
)
from boss_zhipin.platforms.limits import BOSS_DELAY_RANGE_SECONDS, DEFAULT_DAILY_LIMITS


def test_default_daily_limits_values():
    # BOSS 100（2026-10-15 保号拍板：调研实证平台主动沟通上限 100/天）/
    # 猎聘 50 / 51job 40（封号复盘：安全量级 20~50/天）。
    assert DEFAULT_DAILY_LIMITS == {"boss": 100, "liepin": 50, "job51": 40}


def test_stats_io_limits_come_from_single_source():
    assert BOSS_DAILY_LIMIT == DEFAULT_DAILY_LIMITS["boss"]
    assert LIEPIN_DAILY_LIMIT == DEFAULT_DAILY_LIMITS["liepin"]
    assert JOB51_DAILY_LIMIT == DEFAULT_DAILY_LIMITS["job51"]


# ---------- 拟人化节流安全区间（2026-10-12） ----------


def test_delay_range_values():
    # 下限 15s = 同类工具文档最保守建议；上限 = 3×下限
    assert BOSS_DELAY_RANGE_SECONDS == (15.0, 45.0)


def test_delay_range_clamps_low_high_and_defaults(monkeypatch):
    from boss_zhipin.website_oper.dispatch.env_config import _auto_send_delay_range

    # 危险低值（旧雾化弹窗默认 3-6s）→ 钳到下限 15
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MIN", "3")
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MAX", "6")
    assert _auto_send_delay_range() == (15.0, 15.0)

    # 旧默认 10-60 → 钳到 (15, 45)
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MIN", "10")
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MAX", "60")
    assert _auto_send_delay_range() == (15.0, 45.0)

    # 未设置 → 新默认 = GUI「标准」档 20-40
    monkeypatch.delenv("BOSS_AUTO_SEND_DELAY_MIN", raising=False)
    monkeypatch.delenv("BOSS_AUTO_SEND_DELAY_MAX", raising=False)
    assert _auto_send_delay_range() == (20.0, 40.0)

    # 区间内的值原样保留（如用户画像 0my 的 15-30）
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MIN", "15")
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MAX", "30")
    assert _auto_send_delay_range() == (15.0, 30.0)

    # min > max 仍然交换（既有行为）
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MIN", "40")
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MAX", "20")
    assert _auto_send_delay_range() == (20.0, 40.0)
