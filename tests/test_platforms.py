from __future__ import annotations

import asyncio
import time
from pathlib import Path

from boss_zhipin.platforms.base import BasePlatform
from boss_zhipin.platforms.boss import BossPlatform
from boss_zhipin.platforms.job51 import Job51Platform
from boss_zhipin.platforms.liepin import LiepinPlatform
from boss_zhipin.platforms.manager import PlatformManager, get_platform_manager
from boss_zhipin.platforms.zhaopin import ZhaopinPlatform


def test_platform_manager_lists_all_platforms():
    mgr = PlatformManager()
    platforms = mgr.list_platforms()
    ids = [p["id"] for p in platforms]
    assert "boss" in ids
    assert "liepin" in ids
    assert "job51" in ids
    assert "zhaopin" in ids


def test_platform_metadata_consistency():
    mgr = PlatformManager()
    boss = mgr.get_platform("boss")
    assert boss is not None
    info = boss.get_info()
    assert info.daily_limit == 150
    assert info.is_supported is True
    assert "#00bebd" in info.theme_color

    zhaopin = mgr.get_platform("zhaopin")
    assert zhaopin is not None
    z_info = zhaopin.get_info()
    assert z_info.is_supported is False
    assert "筹备" in z_info.status_text


def test_boss_platform_login_detection_with_temp_dir(tmp_path: Path):
    # 空目录 -> False
    boss = BossPlatform(root_dir=tmp_path)
    assert boss.check_login() is False

    # 只放一个非 SQLite 的假 cookie 文件（旧行为会误报已登录）→ 读不出且无有效 cookie -> False
    cookie_file = tmp_path / "chrome_profile" / "Default" / "Network" / "Cookies"
    cookie_file.parent.mkdir(parents=True, exist_ok=True)
    cookie_file.write_bytes(b"dummy_cookie_data")

    assert boss.check_login() is False


def test_boss_platform_login_detection_with_real_cookie_db(tmp_path: Path):
    """真实 Chrome Cookies SQLite：zhipin 域存在未过期的 bst 登录凭证 → 已就绪。

    这是 2026-10-11 假就绪事故的回归测试：判定必须认登录凭证 cookie
    （BOSS = bst，游客绝无），而不是"域内任意 cookie 存在"。
    """
    import sqlite3

    boss = BossPlatform(root_dir=tmp_path)
    db_file = tmp_path / "chrome_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    # Chrome 时间基准 1601-01-01；给一个远未来的过期时间（即未过期）
    future_micros = (int(time.time()) + 86400 * 30) * 1_000_000 + 11644473600000000
    # 游客 cookie（防爬 token）+ 登录凭证 bst——两者都该存在
    conn.execute(
        "INSERT INTO cookies VALUES ('.zhipin.com', '__zp_stoken__', ?, 1)",
        (future_micros,),
    )
    conn.execute(
        "INSERT INTO cookies VALUES ('.zhipin.com', 'bst', ?, 1)", (future_micros,)
    )
    conn.commit()
    conn.close()

    assert boss.check_login() is True


def test_boss_platform_rejects_tourist_only_cookies(tmp_path: Path):
    """只有游客 cookie（无 bst 登录凭证）→ 必须判未登录（假就绪回归）。"""
    import sqlite3

    boss = BossPlatform(root_dir=tmp_path)
    db_file = tmp_path / "chrome_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    future_micros = (int(time.time()) + 86400 * 30) * 1_000_000 + 11644473600000000
    # 复刻 2026-10-11 实测的用户库：7 条游客 cookie、无 bst → 当时误判已就绪
    for name in ("__zp_stoken__", "ab_guid", "lastCity", "__a", "__snaker__id", "isOHPC"):
        conn.execute(
            "INSERT INTO cookies VALUES ('.zhipin.com', ?, ?, 1)", (name, future_micros)
        )
    conn.commit()
    conn.close()

    assert boss.check_login() is False


def test_boss_platform_rejects_expired_bst(tmp_path: Path):
    """bst 已过期 → 未登录。"""
    import sqlite3

    boss = BossPlatform(root_dir=tmp_path)
    db_file = tmp_path / "chrome_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    conn.execute(
        "INSERT INTO cookies VALUES ('.zhipin.com', 'bst', ?, 1)", (1,)
    )
    conn.commit()
    conn.close()

    assert boss.check_login() is False


def test_zhaopin_platform_open_login_unsupported():
    zhaopin = ZhaopinPlatform()
    res = asyncio.run(zhaopin.open_login_browser())
    assert res["status"] == "unsupported"
