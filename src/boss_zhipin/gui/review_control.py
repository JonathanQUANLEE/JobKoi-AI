"""GUI review 模式的待审核岗位控制器。"""

from __future__ import annotations

import asyncio
from typing import Any, Literal

ReviewDecision = Literal["send", "skip", "quit"]

_pending: dict[str, Any] | None = None
_future: asyncio.Future[ReviewDecision] | None = None


async def request_review(payload: dict[str, Any]) -> ReviewDecision:
    """登记一个待审核岗位，并等待 GUI 按钮提交决策。"""
    global _pending, _future
    if _future is not None and not _future.done():
        raise RuntimeError("已有待审核岗位")
    loop = asyncio.get_running_loop()
    _pending = payload
    _future = loop.create_future()
    try:
        return await _future
    finally:
        _pending = None
        _future = None


def decide(decision: ReviewDecision) -> dict[str, str]:
    """由 GUI 按钮提交审核结果。"""
    if decision not in ("send", "skip", "quit"):
        raise ValueError("审核决策只能是 send、skip 或 quit")
    if _future is None or _future.done():
        raise RuntimeError("没有待审核岗位")
    _future.set_result(decision)
    return {"status": "accepted", "decision": decision}


def get_state() -> dict[str, Any]:
    """返回当前待审核岗位，供 GUI 刷新后恢复显示。"""
    return {"pending": _pending}


def reset() -> None:
    """清理状态；测试和 runner 结束时使用。"""
    global _pending, _future
    if _future is not None and not _future.done():
        _future.cancel()
    _pending = None
    _future = None
