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


def test_boss_platform_accepts_session_bst(tmp_path: Path):
    """bst 是会话 cookie（is_persistent=0）→ 也是登录证据（2026-10-11 实测回归）。

    用户实测：bst 以会话 cookie 形态存在（浏览器重启自动恢复登录），
    旧规则"排除所有会话 cookie"把它误杀成未登录，出现
    「网页已登录、平台卡待扫码」的矛盾状态。
    """
    import sqlite3

    boss = BossPlatform(root_dir=tmp_path)
    db_file = tmp_path / "chrome_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    # bst：会话 cookie（expires=0, is_persistent=0）——旧规则误杀的形态
    conn.execute(
        "INSERT INTO cookies VALUES ('.zhipin.com', 'bst', 0, 0)"
    )
    # 游客会话 cookie 依然不算数（不能因为有它就误判）
    conn.execute(
        "INSERT INTO cookies VALUES ('.zhipin.com', '__zp_stoken__', 0, 0)"
    )
    conn.commit()
    conn.close()

    assert boss.check_login() is True


def test_liepin_rejects_tourist_session_cookies(tmp_path: Path):
    """游客 cookie 不算登录（即使是持久 cookie 也必须命中凭证）。"""
    import sqlite3

    liepin = LiepinPlatform(root_dir=tmp_path)
    db_file = tmp_path / "liepin_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    future_micros = (int(time.time()) + 86400 * 30) * 1_000_000 + 11644473600000000
    # 模拟游客访问留下的持久统计与设备追踪 cookie（无 lt_auth 等凭证）
    conn.execute(
        "INSERT INTO cookies VALUES ('.liepin.com', '__uuid', ?, 1)", (future_micros,)
    )
    conn.execute(
        "INSERT INTO cookies VALUES ('.liepin.com', '_ga', ?, 1)", (future_micros,)
    )
    conn.execute(
        "INSERT INTO cookies VALUES ('.liepin.com', 'Hm_lvt_xxx', ?, 1)", (future_micros,)
    )
    conn.execute(
        "INSERT INTO cookies VALUES ('.liepin.com', 'UniqueKey', ?, 1)", (future_micros,)
    )
    conn.commit()
    conn.close()

    assert liepin.check_login() is False


def test_liepin_accepts_valid_credential_cookie(tmp_path: Path):
    """拥有 lt_auth 等登录凭证 -> 判定为已登录。"""
    import sqlite3

    liepin = LiepinPlatform(root_dir=tmp_path)
    db_file = tmp_path / "liepin_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    future_micros = (int(time.time()) + 86400 * 30) * 1_000_000 + 11644473600000000
    conn.execute(
        "INSERT INTO cookies VALUES ('.liepin.com', 'lt_auth', ?, 1)", (future_micros,)
    )
    conn.commit()
    conn.close()

    assert liepin.check_login() is True
    assert "已就绪" in liepin.get_info().status_text


def test_job51_rejects_tourist_cookies(tmp_path: Path):
    """51job：只有游客统计追踪 cookie 时，必须判定为未登录（防止假就绪误导）。"""
    import sqlite3

    job51 = Job51Platform(root_dir=tmp_path)
    db_file = tmp_path / "job51_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    future_micros = (int(time.time()) + 86400 * 30) * 1_000_000 + 11644473600000000
    # 模拟仅打开过 51job 登录页所留下的百度统计/神策/设备 guid
    for name in ("guid", "uid", "sensorsdata2015jssdkcross", "Hm_lvt_xxx"):
        conn.execute(
            "INSERT INTO cookies VALUES ('.51job.com', ?, ?, 1)", (name, future_micros)
        )
    conn.commit()
    conn.close()

    assert job51.check_login() is False
    assert "未登录" in job51.get_info().status_text


def test_job51_accepts_valid_credential_cookie(tmp_path: Path):
    """51job：存在 accountid 凭证 cookie -> 判定为已登录。"""
    import sqlite3

    job51 = Job51Platform(root_dir=tmp_path)
    db_file = tmp_path / "job51_profile" / "Default" / "Network" / "Cookies"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, is_persistent INTEGER)"
    )
    future_micros = (int(time.time()) + 86400 * 30) * 1_000_000 + 11644473600000000
    conn.execute(
        "INSERT INTO cookies VALUES ('.51job.com', '51job', ?, 1)", (future_micros,)
    )
    conn.commit()
    conn.close()

    assert job51.check_login() is True
    assert "已就绪" in job51.get_info().status_text


def test_zhaopin_platform_open_login_unsupported():
    zhaopin = ZhaopinPlatform()
    res = asyncio.run(zhaopin.open_login_browser())
    assert res["status"] == "unsupported"


def test_liepin_driver_is_logged_in_memory_detection():
    """猎聘 is_logged_in：URL 处于 c.liepin.com 或标题有'我的首页'即秒回 True，无需 CDP 慢调用。"""
    import liepin.driver as liepin_drv

    class DummyTarget:
        def __init__(self, title: str):
            self.title = title

    class DummyTab:
        def __init__(self, url: str, title: str = ""):
            self.url = url
            self.target = DummyTarget(title)

    # 1. 登录页 -> False
    login_tab = DummyTab("https://www.liepin.com/login", "用户登录 - 猎聘")
    assert asyncio.run(liepin_drv.is_logged_in(login_tab)) is False

    # 2. 用户个人首页 URL -> True
    c_tab = DummyTab("https://c.liepin.com/", "马先生 - 猎聘")
    assert asyncio.run(liepin_drv.is_logged_in(c_tab)) is True

    # 3. 标题命中"我的首页" -> True
    home_tab = DummyTab("https://www.liepin.com/", "我的首页_猎聘")
    assert asyncio.run(liepin_drv.is_logged_in(home_tab)) is True


def test_job51_driver_is_logged_in_memory_detection():
    """51job is_logged_in：登录页或游客搜索页判 False；个人中心或凭证 cookie 判 True。"""
    import job51.driver as job51_drv

    class DummyTarget:
        def __init__(self, title: str):
            self.title = title

    class DummyTab:
        def __init__(self, url: str, title: str = ""):
            self.url = url
            self.target = DummyTarget(title)

    # 1. 登录页 -> False
    login_tab = DummyTab("https://login.51job.com/login.php?lang=c", "会员登录")
    assert asyncio.run(job51_drv.is_logged_in(login_tab)) is False

    # 2. 游客公开搜索页（无登录态、无个人中心字样）-> False（2026-10-12 假就绪回归测试）
    guest_tab = DummyTab("https://we.51job.com/pc/search?keyword=python", "职位搜索 - 前程无忧")
    assert asyncio.run(job51_drv.is_logged_in(guest_tab)) is False

    # 3. 个人中心主页 -> True
    we_tab = DummyTab("https://we.51job.com/pc/search", "个人中心 - 前程无忧")
    assert asyncio.run(job51_drv.is_logged_in(we_tab)) is True

    # 4. i.51job.com -> True
    i_tab = DummyTab("https://i.51job.com/users/my_51Job.php", "我的51Job")
    assert asyncio.run(job51_drv.is_logged_in(i_tab)) is True

    # 5. 用户扫码后停留在 www.51job.com 首页，DOM 包含「我的投递」/ localStorage 有 token -> True
    class DummyLiveTab:
        def __init__(self, url: str, is_authed: bool):
            self.url = url
            self.target = DummyTarget("招聘网_人才网_找工作_求职_上前程无忧")
            self._is_authed = is_authed

        async def evaluate(self, js: str):
            return self._is_authed

    live_tab = DummyLiveTab("https://www.51job.com/", True)
    assert asyncio.run(job51_drv.is_logged_in(live_tab)) is True


def test_check_login_status_command_with_live_tabs(monkeypatch):
    """验证 check_login_status 命令在受控页面登录成功后能秒级返回 logged_in: True, verified: True。"""
    from boss_zhipin.tauri.commands.platform import _PlatformLoginBody, check_login_status
    import liepin.driver as liepin_drv

    class DummyTarget:
        def __init__(self, title: str):
            self.title = title

    class DummyTab:
        def __init__(self, url: str, title: str = ""):
            self.url = url
            self.target = DummyTarget(title)

    # 模拟用户扫码后 tab 跳转到 c.liepin.com
    monkeypatch.setattr(liepin_drv, "_tab", DummyTab("https://c.liepin.com/", "马先生 - 猎聘"))
    body = _PlatformLoginBody(platform_id="liepin")
    res = asyncio.run(check_login_status(body))
    assert res == {"logged_in": True, "verified": True}


def test_liepin_open_login_browser_contract(monkeypatch):
    """验证 open_login_browser 对齐 BOSS 规范：必须返回 logged_in 字段。"""
    liepin = LiepinPlatform()

    class DummyTab:
        url = "https://c.liepin.com/"
        async def activate(self): pass
        async def bring_to_front(self): pass

    class DummyBrowser:
        tabs = []
        async def get(self, url):
            return DummyTab()

    import nodriver as uc
    import liepin.driver as liepin_drv

    monkeypatch.setattr(liepin_drv, "shutdown", lambda: asyncio.sleep(0))
    monkeypatch.setattr(liepin_drv, "cleanup_profile", lambda: None)
    monkeypatch.setattr(uc, "start", lambda **kwargs: asyncio.sleep(0, result=DummyBrowser()))
    monkeypatch.setattr(liepin_drv, "is_logged_in", lambda tab: asyncio.sleep(0, result=True))

    res = asyncio.run(liepin.open_login_browser())
    assert res["status"] == "opened"
    assert res["logged_in"] is True
    assert "c.liepin.com" in res["url"]


def test_job51_open_login_browser_contract(monkeypatch):
    """验证 51job open_login_browser 规范：直达 login.51job.com，返回 logged_in=False 供扫码。"""
    job51 = Job51Platform()

    class DummyTab:
        url = "https://login.51job.com/login.php?lang=c"
        async def activate(self): pass
        async def bring_to_front(self): pass

    class DummyBrowser:
        tabs = []
        async def get(self, url):
            return DummyTab()

    import nodriver as uc
    import job51.driver as job51_drv

    monkeypatch.setattr(job51_drv, "shutdown", lambda: asyncio.sleep(0))
    monkeypatch.setattr(job51_drv, "cleanup_profile", lambda: None)
    monkeypatch.setattr(uc, "start", lambda **kwargs: asyncio.sleep(0, result=DummyBrowser()))
    monkeypatch.setattr(job51_drv, "is_logged_in", lambda tab: asyncio.sleep(0, result=False))

    res = asyncio.run(job51.open_login_browser())
    assert res["status"] == "opened"
    assert res["logged_in"] is False
    assert res["platform"] == "job51"
    assert "login.51job.com" in res["url"]




