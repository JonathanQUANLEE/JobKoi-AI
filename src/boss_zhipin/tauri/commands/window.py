"""窗口控制域：最小化/最大化切换/关闭。"""
from __future__ import annotations

from pytauri.webview import WebviewWindow

import webbrowser
from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands


class _OpenExternalUrlBody(_CamelModel):
    url: str


@commands.command()
async def window_minimize(webview_window: WebviewWindow) -> dict[str, str]:
    """最小化主窗口。"""
    webview_window.minimize()
    return {"status": "ok"}


@commands.command()
async def window_toggle_maximize(webview_window: WebviewWindow) -> dict[str, str]:
    """最大化或还原主窗口。"""
    if webview_window.is_maximized():
        webview_window.unmaximize()
    else:
        webview_window.maximize()
    return {"status": "ok"}


@commands.command()
async def window_close(webview_window: WebviewWindow) -> dict[str, str]:
    """关闭主窗口。"""
    webview_window.close()
    return {"status": "ok"}


@commands.command()
async def open_external_url(body: _OpenExternalUrlBody) -> dict[str, str]:
    """打开用户操作系统默认外部浏览器（解决 Webview 内 window.open 被拦截或打不开的问题）。"""
    url = (body.url or "").strip()
    if url.startswith(("http://", "https://")):
        webbrowser.open(url)
        return {"status": "ok", "url": url}
    return {"status": "error", "message": "Invalid URL"}
