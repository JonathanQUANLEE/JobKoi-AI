"""三平台未读消息能力测试（2026-10-13 数据统计与早报需求）。

覆盖：
1. 猎聘 ``driver.check_unread``——没开浏览器自己开读完即关；已开则复用
   当前受控页绝不导航、不关浏览器；
2. IPC ``check_platform_replies``——BOSS/猎聘读数、未登录降级、51job
   unsupported（PC 端无消息中心，probe 实证）。
"""

from __future__ import annotations

import asyncio
import json

import pytest


# ---------------------------------------------------------------------------
# 猎聘 check_unread
# ---------------------------------------------------------------------------


class _FakeTab:
    def __init__(self, unread_json: str):
        self._unread_json = unread_json
        self.evaluated = 0

    async def evaluate(self, js):
        self.evaluated += 1
        return self._unread_json


@pytest.fixture()
def liepin_driver_state(monkeypatch):
    """重置 liepin.driver 的模块级浏览器状态，避免测试互相污染。"""
    import liepin.driver as liepin_driver

    monkeypatch.setattr(liepin_driver, "_browser", None)
    monkeypatch.setattr(liepin_driver, "_tab", None)
    return liepin_driver


def test_liepin_check_unread_opens_then_closes(liepin_driver_state, monkeypatch):
    """浏览器没开 → 自己开到 c.liepin.com，读完立即关闭（不常驻）。"""
    driver = liepin_driver_state
    events: list[str] = []

    async def fake_open_browser(url, headless=False):
        events.append(f"open:{url}")
        return _FakeTab(json.dumps({"found": True, "unread": 19}))

    async def fake_shutdown():
        events.append("shutdown")

    monkeypatch.setattr(driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(driver, "shutdown", fake_shutdown)
    monkeypatch.setattr(driver.asyncio, "sleep", _no_sleep)

    result = asyncio.run(driver.check_unread())
    assert result == {
        "status": "ok",
        "unread": 19,
        "chat_url": "https://c.liepin.com/",
    }
    assert events == ["open:https://c.liepin.com/", "shutdown"]


def test_liepin_check_unread_reuses_without_closing(liepin_driver_state, monkeypatch):
    """浏览器已开（巡航中/登录后）→ 复用当前受控页读取，绝不关浏览器。"""
    driver = liepin_driver_state
    fake_tab = _FakeTab(json.dumps({"found": True, "unread": 7}))
    monkeypatch.setattr(driver, "_browser", object())  # 浏览器在
    monkeypatch.setattr(driver, "_tab", fake_tab)

    shutdown_called: list[bool] = []

    async def fake_shutdown():
        shutdown_called.append(True)

    async def fail_open(url):
        raise AssertionError("已开浏览器时不得重新 open")

    monkeypatch.setattr(driver, "shutdown", fake_shutdown)
    monkeypatch.setattr(driver, "open_browser", fail_open)

    result = asyncio.run(driver.check_unread())
    assert result["status"] == "ok"
    assert result["unread"] == 7
    assert fake_tab.evaluated == 1
    assert shutdown_called == []


def test_liepin_check_unread_no_widget(liepin_driver_state):
    """当前页没有角标（巡航中的搜索/详情页）→ no_widget，如实报错。"""
    driver = liepin_driver_state
    driver._browser = object()
    driver._tab = _FakeTab(json.dumps({"found": False, "unread": 0}))

    result = asyncio.run(driver.check_unread())
    assert result["status"] == "error"
    assert result["code"] == "no_widget"


def test_liepin_check_unread_no_tab(liepin_driver_state):
    """浏览器开着但受控 tab 不存在 → no_tab（不猜、不导航）。"""
    driver = liepin_driver_state
    driver._browser = object()
    driver._tab = None

    result = asyncio.run(driver.check_unread())
    assert result["status"] == "error"
    assert result["code"] == "no_tab"


async def _no_sleep(seconds):
    return None


# ---------------------------------------------------------------------------
# IPC check_platform_replies
# ---------------------------------------------------------------------------


class _StubPlatform:
    def __init__(self, logged_in: bool):
        self._logged_in = logged_in

    def check_login(self) -> bool:
        return self._logged_in


class _StubManager:
    def __init__(self, boss_login: bool, liepin_login: bool):
        self._platforms = {
            "boss": _StubPlatform(boss_login),
            "liepin": _StubPlatform(liepin_login),
        }

    def get_platform(self, pid):
        return self._platforms.get(pid)


@pytest.fixture()
def ipc_env(monkeypatch):
    """隔离 IPC 命令依赖：BOSS/猎聘的浏览器层 + 平台管理器全换桩。"""
    import boss_zhipin.platforms as platforms_mod
    import liepin.driver as liepin_driver
    from boss_zhipin.website_oper import finding_jobs, message_check

    state = {
        "boss_tab": None,  # None = 浏览器没开
        "boss_opened": 0,
        "boss_unread": None,  # None = snapshot 报 no_browser
        "liepin_result": None,
        "liepin_called": 0,
    }

    def fake_get_tab():  # finding_jobs.get_tab 是同步的
        return state["boss_tab"]

    def fake_current_url():  # 重试循环里的登录重定向检测（"" = 不在登录页）
        return state.get("boss_url", "")

    async def fake_snapshot():
        if state["boss_unread"] is None:
            return {
                "status": "error",
                "code": "no_browser",
                "message": "浏览器还没打开，检测不到新回复。",
            }
        return {
            "status": "ok",
            "unread": state["boss_unread"],
            "chat_url": "https://www.zhipin.com/web/geek/chat",
        }

    async def fake_boss_open(url, browser):
        state["boss_opened"] += 1
        state["boss_tab"] = object()

    async def fake_boss_shutdown():
        state["boss_tab"] = None

    async def fake_liepin_check_unread():
        state["liepin_called"] += 1
        return state["liepin_result"]

    monkeypatch.setattr(finding_jobs, "get_tab", fake_get_tab)
    monkeypatch.setattr(finding_jobs, "get_current_url", fake_current_url)
    monkeypatch.setattr(message_check, "snapshot", fake_snapshot)
    monkeypatch.setattr(finding_jobs, "open_browser_with_options", fake_boss_open)
    monkeypatch.setattr(finding_jobs, "shutdown", fake_boss_shutdown)
    monkeypatch.setattr(liepin_driver, "check_unread", fake_liepin_check_unread)
    monkeypatch.setattr(liepin_driver, "_browser", None)  # 猎聘浏览器默认没开

    def install_manager(boss_login: bool, liepin_login: bool):
        monkeypatch.setattr(
            platforms_mod, "get_platform_manager", lambda: _StubManager(boss_login, liepin_login)
        )

    state["install_manager"] = install_manager
    return state


def test_ipc_boss_browser_open_reads_snapshot(ipc_env, monkeypatch):
    """BOSS 浏览器开着 → 直接 snapshot，不重新开浏览器。"""
    import liepin.driver as liepin_driver
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    monkeypatch.setattr(liepin_driver, "_browser", object())
    ipc_env["install_manager"](True, True)
    ipc_env["boss_tab"] = object()
    ipc_env["boss_unread"] = 21
    ipc_env["liepin_result"] = {
        "status": "ok",
        "unread": 19,
        "chat_url": "https://c.liepin.com/",
    }

    result = asyncio.run(check_platform_replies())
    assert result["boss"] == {
        "status": "ok",
        "unread": 21,
        "chat_url": "https://www.zhipin.com/web/geek/chat",
    }
    assert result["liepin"]["status"] == "ok"
    assert result["liepin"]["unread"] == 19
    assert result["job51"]["status"] == "unsupported"
    assert "微信" in result["job51"]["message"]
    assert ipc_env["boss_opened"] == 0


def test_ipc_boss_closed_logged_in_never_opens_browser(ipc_env):
    """BOSS 浏览器没开但已登录 → 严禁私自开启或关闭桌面浏览器，安全返回 offline。"""
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    ipc_env["install_manager"](True, True)
    ipc_env["boss_tab"] = None
    ipc_env["liepin_result"] = {
        "status": "error",
        "code": "not_logged_in",
        "message": "猎聘未登录，无法读取未读消息。",
    }

    result = asyncio.run(check_platform_replies())
    assert result["boss"]["status"] in ("offline", "cached")
    assert result["boss"]["code"] == "browser_closed"
    assert "未运行" in result["boss"]["message"] or "未开启" in result["boss"]["message"]
    # 核心安全红线断言：绝不调用任何 open_browser
    assert ipc_env["boss_opened"] == 0


def test_ipc_boss_login_expired_detected(ipc_env, monkeypatch):
    """受控浏览器开着且被重定向到登录页 → login_expired（已失效）。"""
    import liepin.driver as liepin_driver
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    monkeypatch.setattr(liepin_driver, "_browser", object())
    ipc_env["install_manager"](True, True)
    ipc_env["boss_tab"] = object()
    ipc_env["boss_url"] = "https://www.zhipin.com/web/user/?ka=header-login"
    ipc_env["boss_unread"] = 5
    ipc_env["liepin_result"] = {
        "status": "ok",
        "unread": 19,
        "chat_url": "https://c.liepin.com/",
    }

    result = asyncio.run(check_platform_replies())
    assert result["boss"]["status"] == "error"
    assert result["boss"]["code"] == "login_expired"
    assert "重新扫码" in result["boss"]["message"]
    # 猎聘不受影响
    assert result["liepin"]["status"] == "ok"


def test_ipc_liepin_closed_logged_in_never_opens_browser(ipc_env):
    """猎聘浏览器没开但已登录 → 统计快照严禁新开无头进程，安全返回 offline。"""
    import liepin.driver as liepin_driver
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    ipc_env["install_manager"](True, True)
    ipc_env["boss_tab"] = object()
    ipc_env["boss_unread"] = 10
    liepin_driver._browser = None

    result = asyncio.run(check_platform_replies())
    assert result["boss"]["status"] == "ok"
    assert result["boss"]["unread"] == 10
    assert result["liepin"]["status"] == "offline"
    assert result["liepin"]["code"] == "browser_closed"
    assert ipc_env["liepin_called"] == 0


def test_ipc_not_logged_in_degrades_gracefully(ipc_env):
    """两边都没登录 → error/not_logged_in，绝不开浏览器。"""
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    ipc_env["install_manager"](False, False)
    result = asyncio.run(check_platform_replies())
    assert result["boss"]["status"] == "error"
    assert result["boss"]["code"] == "not_logged_in"
    assert result["liepin"]["status"] == "error"
    assert result["liepin"]["code"] == "not_logged_in"
    assert ipc_env["boss_opened"] == 0
    assert ipc_env["liepin_called"] == 0


def test_ipc_liepin_exception_converges(ipc_env, monkeypatch):
    """单平台异常收敛为 error 项，不拖死整个命令。"""
    import liepin.driver as liepin_driver
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    monkeypatch.setattr(liepin_driver, "_browser", object())
    ipc_env["install_manager"](True, True)

    async def boom():
        raise RuntimeError("猎聘读角标炸了")

    monkeypatch.setattr(liepin_driver, "check_unread", boom)
    result = asyncio.run(check_platform_replies())
    assert result["liepin"]["status"] == "error"
    assert result["liepin"]["code"] == "exception"
    # 另一个平台不受影响
    assert result["job51"]["status"] == "unsupported"


def test_ipc_cruise_running_liepin_not_opened_returns_busy(ipc_env, monkeypatch):
    """巡航运行中（仅巡航 BOSS）：猎聘浏览器未开 → 返回 busy，绝不弹窗、绝不开浏览器。"""
    from boss_zhipin.gui import runner
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    monkeypatch.setattr(runner, "is_running", lambda: True)
    ipc_env["install_manager"](True, True)
    ipc_env["boss_tab"] = object()
    ipc_env["boss_unread"] = 12

    result = asyncio.run(check_platform_replies())
    # BOSS 正常复用现有受控 tab 读取
    assert result["boss"]["status"] == "ok"
    assert result["boss"]["unread"] == 12
    # 猎聘被巡航保护拦截，绝不调用后台探测
    assert result["liepin"]["status"] == "busy"
    assert result["liepin"]["unread"] == 0
    assert "巡航运行中" in result["liepin"]["message"]
    assert ipc_env["liepin_called"] == 0


def test_ipc_cruise_running_liepin_open_reads_safely(ipc_env, monkeypatch):
    """巡航运行中（多平台巡航，猎聘也开着）：复用已打开的猎聘受控页读取未读。"""
    import liepin.driver as liepin_driver
    from boss_zhipin.gui import runner
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    monkeypatch.setattr(runner, "is_running", lambda: True)
    monkeypatch.setattr(liepin_driver, "_browser", object())
    ipc_env["install_manager"](True, True)
    ipc_env["boss_tab"] = object()
    ipc_env["boss_unread"] = 8
    ipc_env["liepin_result"] = {
        "status": "ok",
        "unread": 5,
        "chat_url": "https://c.liepin.com/",
    }

    result = asyncio.run(check_platform_replies())
    assert result["boss"]["status"] == "ok"
    assert result["boss"]["unread"] == 8
    assert result["liepin"]["status"] == "ok"
    assert result["liepin"]["unread"] == 5
    assert ipc_env["liepin_called"] == 1


def test_ipc_cruise_running_boss_tab_none_returns_busy(ipc_env, monkeypatch):
    """巡航运行中但 BOSS tab 暂未就绪：返回 busy，绝不在后台开新浏览器或调用 shutdown。"""
    from boss_zhipin.gui import runner
    from boss_zhipin.tauri.commands.platform import check_platform_replies

    monkeypatch.setattr(runner, "is_running", lambda: True)
    ipc_env["install_manager"](True, True)
    ipc_env["boss_tab"] = None

    result = asyncio.run(check_platform_replies())
    assert result["boss"]["status"] == "busy"
    assert result["boss"]["unread"] == 0
    assert ipc_env["boss_opened"] == 0


def test_liepin_check_unread_opens_headless(liepin_driver_state, monkeypatch):
    """非巡航期读未读（浏览器没开）：必须以 headless=True 运行，绝不弹窗打扰用户。"""
    driver = liepin_driver_state
    passed_headless: list[bool] = []

    async def fake_open_browser(url, headless=False):
        passed_headless.append(headless)
        return _FakeTab(json.dumps({"found": True, "unread": 3}))

    async def fake_shutdown():
        pass

    monkeypatch.setattr(driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(driver, "shutdown", fake_shutdown)
    monkeypatch.setattr(driver.asyncio, "sleep", _no_sleep)

    result = asyncio.run(driver.check_unread())
    assert result["status"] == "ok"
    assert result["unread"] == 3
    assert passed_headless == [True]

