"""浏览器可执行文件探测（2026-10-13 打包加固：无 Chrome 电脑自愈兜底）。

背景：nodriver 在 Windows 下只探测 Google Chrome。国内大量普通用户
电脑只装系统自带 Microsoft Edge（100% 兼容的 Chromium 内核）——没装
Chrome 的机器上 ``uc.start`` 直接抛 FileNotFoundError，界面毫无反应。

本模块在构建 nodriver ``Config`` 时给出兜底路径：优先 Chrome，缺失时
自动降级 Edge（社区实测 nodriver + msedge.exe 走 CDP 完全可用）。
两者都没有时返回 None，保持 nodriver 自身的默认探测与报错行为。
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)

_SENTINEL = object()
# 探测结果缓存：路径在进程生命周期内不会变，避免每次开浏览器都扫盘。
# None=还没探测过；""=探测过但两者都没有；其他=可执行文件绝对路径。
_cached: str | None = None


def _chrome_candidates() -> list[str]:
    return [
        os.path.join(
            os.environ.get("PROGRAMFILES", ""), "Google", "Chrome", "Application", "chrome.exe"
        ),
        os.path.join(
            os.environ.get("PROGRAMFILES(X86)", ""),
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
        ),
        os.path.join(
            os.environ.get("LOCALAPPDATA", ""),
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
        ),
    ]


def _edge_candidates() -> list[str]:
    return [
        os.path.join(
            os.environ.get("PROGRAMFILES(X86)", ""),
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
        ),
        os.path.join(
            os.environ.get("PROGRAMFILES", ""), "Microsoft", "Edge", "Application", "msedge.exe"
        ),
        os.path.join(
            os.environ.get("LOCALAPPDATA", ""),
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
        ),
    ]


def find_available_browser() -> str | None:
    """优先系统 Chrome；没有 Chrome 则返回 Edge（Chromium 兼容内核）。

    返回 None = 两者都没找到（保持 nodriver 默认探测行为，报它原生的错）。
    """
    global _cached
    if _cached is not None:
        return _cached or None

    for path in _chrome_candidates():
        if path and os.path.isfile(path):
            _cached = path
            return path
    for path in _edge_candidates():
        if path and os.path.isfile(path):
            log.info("未检测到 Chrome，自动降级 Microsoft Edge（Chromium 内核）：%s", path)
            _cached = path
            return path
    _cached = ""
    return None


def apply_browser_fallback(config) -> None:
    """给 nodriver Config 打浏览器兜底补丁（原地，无返回值）。

    仅在探测到可用浏览器且 Config 尚未显式指定时写入，绝不覆盖用户
    自己设置的 ``browser_executable_path``。
    """
    if getattr(config, "browser_executable_path", None):
        return
    path = find_available_browser()
    if path:
        config.browser_executable_path = path


def reset_browser_lookup_cache() -> None:
    """清缓存（测试用：monkeypatch 环境变量后重新探测）。"""
    global _cached
    _cached = None
