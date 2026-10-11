"""人工确认决策（CLI 终端确认与 GUI 弹窗确认）。"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from boss_zhipin.gui import events

if TYPE_CHECKING:
    from boss_zhipin.website_oper.core.models import JobPosting

log = logging.getLogger(__name__)


async def _ask_review_decision(
    *,
    index: int,
    job_description: str,
    details: dict,
    greeting: str,
) -> str:
    print("\n" + "=" * 80)
    print(f"岗位 #{index}")
    print("- 匹配信息:")
    if details.get("matched_keywords") is not None:
        print(f"  命中关键词: {details.get('matched_keywords')}")
    if details.get("score") is not None:
        print(f"  匹配评分: {details.get('score')}/{details.get('threshold')}")
    if details.get("reason"):
        print(f"  理由: {details.get('reason')}")
    print("- 岗位详情:")
    print(job_description)
    print("- 将发送的固定招呼语:")
    print(greeting)
    print("=" * 80)

    while True:
        choice = await asyncio.to_thread(
            input,
            "发送这一条？输入 y 发送 / n 跳过 / q 退出：",
        )
        choice = choice.strip().lower()
        if choice in {"y", "yes"}:
            return "send"
        if choice in {"n", "no", ""}:
            return "skip"
        if choice in {"q", "quit", "exit"}:
            return "quit"
        print("只接受 y / n / q")


async def _ask_gui_review_decision(
    *,
    index: int,
    job: JobPosting,
    job_description: str,
    details: dict,
    greeting: str,
) -> str:
    from boss_zhipin.gui import review_control
    from boss_zhipin.website_oper.dispatch import history_logger

    payload = {
        "index": index,
        "job": history_logger._job_payload(job),
        "job_description": job_description,
        "details": details,
        "greeting": greeting,
    }
    events.emit("review_requested", **payload)
    decision = await review_control.request_review(payload)
    events.emit("review_cleared", index=index, decision=decision)
    return decision
