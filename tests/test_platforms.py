from __future__ import annotations

import asyncio
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

    # 模拟创建 Cookie 文件
    cookie_file = tmp_path / "chrome_profile" / "Default" / "Network" / "Cookies"
    cookie_file.parent.mkdir(parents=True, exist_ok=True)
    cookie_file.write_bytes(b"dummy_cookie_data")

    assert boss.check_login() is True


def test_zhaopin_platform_open_login_unsupported():
    zhaopin = ZhaopinPlatform()
    res = asyncio.run(zhaopin.open_login_browser())
    assert res["status"] == "unsupported"
