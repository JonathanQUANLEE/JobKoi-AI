"""受控浏览器窗口强制前置（2026-10-18 用户需求）。

背景（用户实测痛点）：用户点「启动巡航」后去电脑上干别的事，浏览器被
其他窗口盖住或最小化。巡航途中遇到验证码/安全验证时，旧版只在后台日志
里写一行然后静默停机——用户根本不知道需要去浏览器完成验证，巡航就
"莫名其妙"结束了。用户要求：一旦遇到验证码，受控浏览器窗口要**突然
前置到屏幕最上层**，强提醒用户赶紧完成验证。

实现策略（Windows）：
- 通过 nodriver ``Browser._process`` 拿到 Chrome 主进程 PID，用
  ``EnumWindows`` 找到该 PID 的顶层可见窗口；
- ``ShowWindow(SW_RESTORE)`` 还原最小化，``SetWindowPos(HWND_TOPMOST)``
  置顶一瞬再取消置顶（``HWND_NOTOPMOST``），最后 ``SetForegroundWindow``
  抢焦点——"弹出来强调一下"而不是永久钉在最上层。
- 全程 ``asyncio.to_thread`` 执行（Win32 调用是阻塞的），不卡 pytauri
  事件循环；非 Windows / 找不到窗口 / 任何异常都静默降级（只记日志），
  绝不影响巡航主流程——这是提醒功能，不是保命功能。
"""

from __future__ import annotations

import asyncio
import logging
import sys
from typing import Any

log = logging.getLogger(__name__)


def _find_window_pid(pid: int) -> int | None:
    """找到 ``pid`` 进程的第一个可见顶层窗口 HWND；找不到返回 None。"""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    found: list[int] = []

    # argtypes 必须声明（2026-10-18 审查同款隐患）：不声明时 64 位下 HWND
    # 会被截断成 32 位，EnumWindows 回调拿到的是坏句柄。
    user32.GetWindowThreadProcessId.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(wintypes.DWORD),
    ]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.IsWindowVisible.argtypes = [ctypes.c_void_p]
    user32.IsWindowVisible.restype = wintypes.BOOL
    user32.GetWindowRect.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.RECT)]
    user32.GetWindowRect.restype = wintypes.BOOL
    user32.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(
        wintypes.BOOL, wintypes.HWND, wintypes.LPARAM
    ), wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL

    WNDENUMPROC = ctypes.WINFUNCTYPE(
        wintypes.BOOL, wintypes.HWND, wintypes.LPARAM
    )

    def _enum(hwnd, _lparam):
        window_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
        if window_pid.value != pid:
            return True
        if not user32.IsWindowVisible(hwnd):
            return True
        # 过滤掉零尺寸的隐藏壳窗口（Chrome 会建一些 0x0 的辅助窗口）
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        if rect.right - rect.left <= 0 or rect.bottom - rect.top <= 0:
            return True
        found.append(hwnd)
        return False  # 找到即停

    user32.EnumWindows(WNDENUMPROC(_enum), 0)
    return found[0] if found else None


def _force_foreground_sync(browser: Any) -> bool:
    """同步实现：把 ``browser``（nodriver Browser）的 Chrome 窗口强制前置。"""
    if sys.platform != "win32":
        return False
    proc = getattr(browser, "_process", None)
    pid = getattr(proc, "pid", None)
    if not pid:
        return False

    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    hwnd = _find_window_pid(int(pid))
    if not hwnd:
        log.debug("强制前置：未找到 Chrome 窗口（pid=%s）", pid)
        return False

    # 显式声明 argtypes（2026-10-18 实测事故修复）：HWND_TOPMOST/-NOTOPMOST 是
    # 负数伪句柄（-1/-2），不声明时 ctypes 按 32 位 c_int 传参，64 位 Windows
    # 上不会符号扩展成 64 位 HWND——SetWindowPos 返回 0（GetLastError=1400），
    # 置顶从未生效。HWND 统一按 c_void_p 传，伪句柄用 c_void_p(-1)/(-2)。
    user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
    user32.ShowWindow.restype = wintypes.BOOL
    user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
    user32.SetForegroundWindow.restype = wintypes.BOOL
    user32.SetWindowPos.argtypes = [
        ctypes.c_void_p,  # hWnd
        ctypes.c_void_p,  # hWndInsertAfter（HWND_TOPMOST/NOTOPMOST）
        ctypes.c_int,  # X
        ctypes.c_int,  # Y
        ctypes.c_int,  # cx
        ctypes.c_int,  # cy
        wintypes.UINT,  # uFlags
    ]
    user32.SetWindowPos.restype = wintypes.BOOL

    SW_RESTORE = 9
    HWND_TOPMOST = ctypes.c_void_p(-1)
    HWND_NOTOPMOST = ctypes.c_void_p(-2)
    SWP_NOMOVE = 0x0002
    SWP_NOSIZE = 0x0001
    SWP_SHOWWINDOW = 0x0040
    flags = SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW

    # 1) 还原最小化（用户点了减号也能弹回来）
    user32.ShowWindow(hwnd, SW_RESTORE)
    # 2) 置顶一瞬——"突然弹出来强调一下"
    topmost_ok = bool(user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, flags))
    if not topmost_ok:
        log.warning(
            "强制前置：SetWindowPos(HWND_TOPMOST) 失败（GetLastError=%s）",
            ctypes.get_last_error(),
        )
    # 3) 抢前台焦点（Windows 前台锁可能拒绝，失败也继续）
    user32.SetForegroundWindow(hwnd)
    # 4) 立刻取消永久置顶（不要永久钉在最上层，用户还要继续干别的）
    notopmost_ok = bool(user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, flags))
    if not notopmost_ok:
        log.warning(
            "强制前置：SetWindowPos(HWND_NOTOPMOST) 失败（GetLastError=%s）",
            ctypes.get_last_error(),
        )
    if not (topmost_ok or notopmost_ok):
        return False
    log.info("🚨 已强制前置受控浏览器窗口（验证码/安全验证需要用户处理）")
    return True


async def force_foreground(browser: Any | None = None) -> bool:
    """异步入口：把受控 Chrome 窗口强制前置。任何失败静默降级。

    ``browser`` 为 None 时自动取 BOSS 的 ``finding_jobs._browser``。
    """
    if sys.platform != "win32":
        return False
    if browser is None:
        try:
            from boss_zhipin.website_oper import finding_jobs

            browser = finding_jobs._browser
        except Exception:
            return False
    if browser is None:
        return False
    try:
        return await asyncio.to_thread(_force_foreground_sync, browser)
    except Exception as e:  # noqa: BLE001 — 提醒失败绝不影响巡航
        log.debug("强制前置浏览器窗口失败（忽略）: %s", e)
        return False


async def focus_platform_browser(platform: str) -> bool:
    """按平台 id 找到对应的受控浏览器并强制前置（三平台统一入口）。"""
    platform = (platform or "boss").strip().lower()
    browser = None
    try:
        if platform == "liepin":
            import liepin.driver as _d

            browser = getattr(_d, "_browser", None)
        elif platform == "job51":
            import job51.driver as _d

            browser = getattr(_d, "_browser", None)
        else:
            from boss_zhipin.website_oper import finding_jobs

            browser = finding_jobs._browser
    except Exception:
        browser = None
    return await force_foreground(browser)
