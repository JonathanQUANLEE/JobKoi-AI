"""打包加固（2026-10-13）测试：平台 Profile 路径解析 + 浏览器兜底探测。

四大隐患的验证对应：
1. UAC 权限隔离 → get_platform_profile_dir 三级优先级（env > standalone
   %APPDATA% > dev 仓库根）；
2. Cookie 刷盘 → 已由三处 shutdown 的关前缓冲覆盖（异步流程，此处不重测）；
3. Chrome 缺失 → find_available_browser 的 Edge 兜底；
4. 孤儿/SingletonLock → 既有 reap_profile_chrome 已覆盖（test_platforms.py）。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from boss_zhipin.paths import get_platform_profile_dir
from boss_zhipin.platforms.browser_lookup import (
    apply_browser_fallback,
    find_available_browser,
    reset_browser_lookup_cache,
)

REPO_ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# 1. Profile 路径三级优先级
# ---------------------------------------------------------------------------

def test_env_override_wins(monkeypatch, tmp_path):
    custom = tmp_path / "my_liepin_profile"
    monkeypatch.setenv("LIEPIN_CHROME_PROFILE", str(custom))
    assert get_platform_profile_dir("liepin") == custom.resolve()


def test_dev_mode_uses_repo_root_defaults(monkeypatch):
    monkeypatch.delenv("LIEPIN_CHROME_PROFILE", raising=False)
    monkeypatch.delenv("BOSS_TAURI_STANDALONE", raising=False)
    assert get_platform_profile_dir("liepin") == (REPO_ROOT / "liepin_profile").resolve()
    assert get_platform_profile_dir("job51") == (REPO_ROOT / "job51_profile").resolve()
    # BOSS 的历史目录名不带平台前缀
    assert get_platform_profile_dir("boss") == (REPO_ROOT / "chrome_profile").resolve()


def test_dev_root_injection_for_tests(monkeypatch, tmp_path):
    """tests/test_platforms.py 的 root_dir=tmp_path 注入用法保持兼容。"""
    monkeypatch.delenv("LIEPIN_CHROME_PROFILE", raising=False)
    monkeypatch.delenv("BOSS_TAURI_STANDALONE", raising=False)
    result = get_platform_profile_dir("liepin", dev_root=tmp_path)
    assert result == (tmp_path / "liepin_profile").resolve()


def test_standalone_mode_goes_to_appdata(monkeypatch, tmp_path):
    """打包模式：profile 强制进 %APPDATA%（安装目录 UAC 只读，装哪个盘都炸）。"""
    monkeypatch.setenv("BOSS_TAURI_STANDALONE", "1")
    monkeypatch.setenv("BOSS_APP_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("LIEPIN_CHROME_PROFILE", raising=False)
    result = get_platform_profile_dir("liepin")
    assert result == tmp_path / "profiles" / "liepin"
    assert result.is_dir()  # 自动建目录


def test_standalone_env_still_wins(monkeypatch, tmp_path):
    """standalone 下用户显式 env 覆盖依然最高优先级。"""
    monkeypatch.setenv("BOSS_TAURI_STANDALONE", "1")
    custom = tmp_path / "custom"
    monkeypatch.setenv("JOB51_CHROME_PROFILE", str(custom))
    assert get_platform_profile_dir("job51") == custom.resolve()


def test_browser_and_cookie_probe_are_consistent(monkeypatch):
    """浏览器实际用的目录与平台适配器 cookie 探测的目录必须同源（核心回归）。"""
    monkeypatch.delenv("BOSS_TAURI_STANDALONE", raising=False)
    for env_key in ("BOSS_CHROME_PROFILE", "LIEPIN_CHROME_PROFILE", "JOB51_CHROME_PROFILE"):
        monkeypatch.delenv(env_key, raising=False)

    from boss_zhipin.platforms.boss import BossPlatform
    from boss_zhipin.platforms.job51 import Job51Platform
    from boss_zhipin.platforms.liepin import LiepinPlatform

    import job51.driver as job51_driver
    import liepin.driver as liepin_driver
    from boss_zhipin.website_oper.core import browser_session

    assert Path(browser_session.CHROME_PROFILE_DIR) == BossPlatform()._get_profile_dir()
    assert Path(liepin_driver.PROFILE_DIR) == LiepinPlatform()._get_profile_dir()
    assert Path(job51_driver.PROFILE_DIR) == Job51Platform()._get_profile_dir()


# ---------------------------------------------------------------------------
# 3. 浏览器兜底探测（无 Chrome 的电脑自动降级 Edge）
# ---------------------------------------------------------------------------

@pytest.fixture()
def fresh_lookup(monkeypatch, tmp_path):
    """隔离环境：清缓存 + 假的 ProgramFiles 指向临时目录。"""
    reset_browser_lookup_cache()
    monkeypatch.setenv("PROGRAMFILES", str(tmp_path / "pf"))
    monkeypatch.setenv("PROGRAMFILES(X86)", str(tmp_path / "pf86"))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "la"))
    for d in ("pf", "pf86", "la"):
        (tmp_path / d).mkdir(exist_ok=True)
    yield tmp_path
    reset_browser_lookup_cache()


def test_chrome_found_when_present(fresh_lookup, monkeypatch):
    chrome = fresh_lookup / "pf" / "Google" / "Chrome" / "Application" / "chrome.exe"
    chrome.parent.mkdir(parents=True, exist_ok=True)
    chrome.write_text("")
    assert find_available_browser() == str(chrome)


def test_edge_fallback_when_chrome_missing(fresh_lookup, monkeypatch):
    edge = fresh_lookup / "pf86" / "Microsoft" / "Edge" / "Application" / "msedge.exe"
    edge.parent.mkdir(parents=True, exist_ok=True)
    edge.write_text("")
    assert find_available_browser() == str(edge)


def test_none_when_no_browser_at_all(fresh_lookup):
    assert find_available_browser() is None


def test_apply_fallback_never_overrides_explicit_path(fresh_lookup):
    class FakeConfig:
        browser_executable_path = "/explicit/chrome.exe"

    cfg = FakeConfig()
    apply_browser_fallback(cfg)
    assert cfg.browser_executable_path == "/explicit/chrome.exe"


def test_apply_fallback_sets_detected_path(fresh_lookup):
    chrome = fresh_lookup / "pf" / "Google" / "Chrome" / "Application" / "chrome.exe"
    chrome.parent.mkdir(parents=True, exist_ok=True)
    chrome.write_text("")

    class FakeConfig:
        browser_executable_path = None

    cfg = FakeConfig()
    apply_browser_fallback(cfg)
    assert cfg.browser_executable_path == str(chrome)
