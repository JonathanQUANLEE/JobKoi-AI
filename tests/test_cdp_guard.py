"""cdp_call 防挂死护栏单元测试（2026-10-18 事故回归）。

事故场景：nodriver ``tab.xpath`` 在 finally 里再做一次 CDP send——外层
wait_for 超时 cancel 后任务在 finally 二次挂死，wait_for 等不到任务退出
而永久卡死（浏览器假死 + 巡航死寂）。cdp_call 必须在该模式下仍按时
返回，这是本组测试的核心断言。

项目没装 pytest-asyncio，每个用例自己用 ``asyncio.run`` 包一下。
"""
from __future__ import annotations

import asyncio
import time

from boss_zhipin.website_oper.core.cdp_guard import _ZOMBIES, cdp_call, zombie_count


def test_cdp_call_returns_result_on_time():
    """正常完成：透传结果。"""

    async def quick():
        await asyncio.sleep(0.01)
        return "ok"

    async def scenario():
        return await cdp_call(quick(), timeout=1.0)

    assert asyncio.run(scenario()) == "ok"


def test_cdp_call_propagates_inner_exception():
    """内部异常：原样传播（调用方既有 except 分支零漂移）。"""

    async def boom():
        raise ValueError("inner")

    async def scenario():
        return await cdp_call(boom(), timeout=1.0)

    try:
        asyncio.run(scenario())
        raise AssertionError("应当抛出 ValueError")
    except ValueError as e:
        assert "inner" in str(e)


def test_cdp_call_timeout_with_clean_cancel():
    """超时且任务可干净取消：按 asyncio.TimeoutError 语义抛出。"""

    async def slow():
        await asyncio.sleep(10)

    async def scenario():
        start = time.monotonic()
        try:
            await cdp_call(slow(), timeout=0.05, grace=0.1)
        except asyncio.TimeoutError:
            return time.monotonic() - start
        raise AssertionError("应当超时")

    elapsed = asyncio.run(scenario())
    assert elapsed < 2.0


def test_cdp_call_survives_finally_reawait_pattern():
    """事故根因模式：CancelledError 后在 finally 阶段再次挂死。

    模拟 nodriver ``tab.xpath``：try 里挂起 → 第一次 cancel 注入
    CancelledError → except/finally 里再次 await 且挂死（对死 CDP 通道
    的 dom.disable）。第二次 cancel 必须能把这条链打断，cdp_call 按时
    返回 TimeoutError，绝不无限等待。
    """

    async def xpath_like():
        try:
            await asyncio.sleep(30)  # 第一次挂点（send dom.enable）
        except asyncio.CancelledError:
            # 模拟 finally 里的 dom.disable send：再次挂死
            await asyncio.sleep(30)

    async def scenario():
        start = time.monotonic()
        try:
            await cdp_call(xpath_like(), timeout=0.05, grace=0.2)
        except asyncio.TimeoutError:
            return time.monotonic() - start
        raise AssertionError("应当超时")

    elapsed = asyncio.run(scenario())
    # 两次 cancel（0.05 + 0.2 + 0.2）后必须已返回，绝不能等到 sleep(30)
    assert elapsed < 5.0


def test_cdp_call_abandons_uninterruptible_zombie():
    """极端不可中断任务：两次 cancel 后放弃为僵尸，调用方不死。"""

    async def uninterruptible():
        swallowed = 0
        while True:
            try:
                await asyncio.sleep(3600)
            except asyncio.CancelledError:
                # 吞掉 cdp_call 的两次 cancel（模拟彻底死掉的 CDP 通道）；
                # 第 3 次（asyncio.run 收尾的 _cancel_all_tasks）放行退出，
                # 否则测试进程自身无法收尾。
                swallowed += 1
                if swallowed >= 3:
                    raise
                continue

    async def scenario():
        _ZOMBIES.clear()
        start = time.monotonic()
        try:
            await cdp_call(
                uninterruptible(), timeout=0.05, grace=0.1, label="不可中断"
            )
        except asyncio.TimeoutError:
            return time.monotonic() - start, zombie_count()
        raise AssertionError("应当超时")

    elapsed, zombies = asyncio.run(scenario())
    assert elapsed < 5.0
    assert zombies == 1
    _ZOMBIES.clear()


def test_cdp_call_timeout_when_result_arrives_during_grace():
    """第一次 cancel 后任务在宽限内退出：同样按超时处理（与 wait_for 对齐）。"""

    async def stubborn_but_finite():
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            await asyncio.sleep(0.02)  # 收尾后完成
            return "late"

    async def scenario():
        try:
            await cdp_call(stubborn_but_finite(), timeout=0.05, grace=0.5)
        except asyncio.TimeoutError:
            return True
        return False

    assert asyncio.run(scenario()) is True


def test_zombie_done_callback_consumes_exception():
    """僵尸终结时异常被消费：不产生 'exception never retrieved' 警告。"""

    async def dying_zombie():
        swallowed = 0
        while True:
            try:
                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                swallowed += 1
                if swallowed >= 3:
                    # 第 3 次 cancel（事件循环收尾的 _cancel_all_tasks）
                    # 时退出并抛业务异常——模拟通道恢复
                    raise RuntimeError("通道恢复后的业务异常")
                continue

    async def scenario():
        _ZOMBIES.clear()
        try:
            await cdp_call(dying_zombie(), timeout=0.05, grace=0.1)
        except asyncio.TimeoutError:
            pass
        return zombie_count()

    # 放弃时僵尸在册；asyncio.run 收尾的第三次 cancel 使其终结，
    # done_callback 消费异常并从集合摘除。
    assert asyncio.run(scenario()) == 1
    assert zombie_count() == 0
