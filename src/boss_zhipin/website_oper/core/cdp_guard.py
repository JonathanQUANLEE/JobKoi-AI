"""CDP 调用防挂死护栏（2026-10-18 事故复盘）。

事故根因：BOSS 页面 renderer 被风控/验证 JS 卡死时，nodriver 的
``tab.xpath`` 在 ``finally`` 里还有一次 CDP send（``dom.disable``）——
外层 ``asyncio.wait_for`` 超时后对内部 task 注入第一次 CancelledError，
任务随即进入 finally 并**再次挂死在 CDP 通道上**（取消只注入一次）；
而 ``wait_for`` 的语义是"取消后必须等任务真正退出才返回"，于是外层
也永久挂死 → 巡航主协程整链卡死（实测：浏览器假死 + 软件死寂 +
停止按钮无效，日志止于最后一条超时 warning）。

本模块提供 ``cdp_call``：与 ``wait_for`` 的本质区别是**不等被取消的
任务退出**（用 ``asyncio.wait`` 即时返回），并在放弃前做第二次 cancel
——第二次 cancel 会注入到任务"当前正在等待的 future"（即 finally 里
那个挂死的 CDP send 的 Transaction），绝大多数场景能把 finally 链打断、
任务干净退出；仍退不出的极罕见场景（彻底的死通道）才放弃为僵尸协程，
保证调用方与主循环**永远不被拖死**。僵尸在 CDP 通道恢复或浏览器关闭
后自然终结，异常由 done_callback 消费，不产生 GC 警告。
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Coroutine

log = logging.getLogger(__name__)

# 被 abandon 的僵尸任务引用：防 GC 提前回收 + 提供观测点。
_ZOMBIES: set[asyncio.Task[Any]] = set()


def zombie_count() -> int:
    """当前挂起的僵尸 CDP 任务数（观测/测试用）。"""
    return len(_ZOMBIES)


def _reap(task: asyncio.Task[Any]) -> None:
    """僵尸终结时：消费异常（避免 "exception never retrieved" 噪音）并摘除引用。"""
    _ZOMBIES.discard(task)
    if not task.cancelled() and task.exception() is not None:
        log.debug("僵尸 CDP 任务已终结：%s", task.exception())


async def cdp_call(
    coro: Coroutine[Any, Any, Any] | asyncio.Future,
    *,
    timeout: float,
    grace: float = 2.5,
    label: str = "",
) -> Any:
    """带"可放弃"语义的 CDP 调用护栏。

    行为契约（调用方只需按 ``asyncio.wait_for`` 的习惯写 except）：
    - 任务在 ``timeout`` 内完成：返回其结果（内部异常原样传播）；
    - 超时后第一次 cancel，``grace`` 秒内退出：按超时处理；
    - 仍未退出则第二次 cancel（打断 finally 链上挂死的 CDP send），
      再等 ``grace`` 秒：退出即按超时处理；
    - 仍不退出：放弃等待（记僵尸），按超时处理。

    超时统一抛 ``asyncio.TimeoutError``——与既有调用点的
    ``except asyncio.TimeoutError`` 分支完全兼容，替换零语义漂移。

    :param coro: nodriver 调用产生的 coroutine（如 ``tab.select(...)``）
    :param timeout: 正常等待秒数
    :param grace: 每次取消后给任务收尾的宽限秒数
    :param label: 日志标注（选择器/JS 片段），便于定位挂点
    """
    task = asyncio.ensure_future(coro)
    done, _ = await asyncio.wait({task}, timeout=timeout)
    if done:
        return task.result()

    # 第一次取消：给 finally / 清理链一个自然收尾的机会。
    task.cancel()
    done, _ = await asyncio.wait({task}, timeout=grace)
    if done:
        try:
            task.result()
        except asyncio.CancelledError:
            pass
        raise asyncio.TimeoutError()

    # 第二次取消：打断"已取消但 finally 里再次挂死"的链（事故根因点）。
    task.cancel()
    done, _ = await asyncio.wait({task}, timeout=grace)
    if done:
        try:
            task.result()
        except asyncio.CancelledError:
            pass
        raise asyncio.TimeoutError()

    # 彻底放弃：绝不无限等待，保调用方与主循环不死。
    _ZOMBIES.add(task)
    task.add_done_callback(_reap)
    log.error(
        "CDP 调用超时 %.1fs 且两次取消后仍未退出，放弃等待（协程：%s）——"
        "受控浏览器疑似假死，后续连续失败熔断将接管停机",
        timeout,
        label or "<未标注>",
    )
    raise asyncio.TimeoutError()
