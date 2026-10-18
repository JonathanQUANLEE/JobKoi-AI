"""验证码停机时保留受控浏览器窗口（2026-10-18 用户需求）。

背景（用户实测痛点）：旧版在详情页检出验证码后，``runner._wrap`` 的
finally 分支会立刻"优雅关闭"受控浏览器——用户看到窗口一闪而过，根本
来不及完成验证，下一轮又因为会话被风控而继续失败。

语义：哪个平台检出了验证码/安全验证，就把该平台的受控浏览器窗口保留
在屏幕上（不自动关闭），等用户完成验证后自行继续。手动停止巡航、正常
结束等场景不受影响（照旧自动关浏览器）。

实现：模块级集合（一个 GUI 进程只跑一个 run，与 ``gui.events`` 同一
契约），captcha 检出点调 ``request_keep_open(platform)``，
``runner._wrap`` 收尾时用 ``should_keep_open(platform)`` 决定是否跳过
shutdown，最后 ``reset()`` 清空。
"""

from __future__ import annotations

_keep_open: set[str] = set()


def request_keep_open(platform: str = "boss") -> None:
    """登记某平台：巡航结束时保留其受控浏览器窗口。"""
    _keep_open.add((platform or "boss").strip().lower())


def should_keep_open(platform: str = "boss") -> bool:
    return (platform or "boss").strip().lower() in _keep_open


def reset() -> None:
    """清空登记；runner 收尾与测试清理时调用。"""
    _keep_open.clear()
