"""岗位预览（只读）：读当前受控页面的岗位列表前 N 个 + 本地规则匹配标注。

给智能助手的 ``preview_jobs`` 工具用。**零投递动作**：遍历会点击岗位卡
切换详情（scan 模式同款遍历方式），但绝不点「立即沟通 / 发消息 / 发简历」。
要求浏览器已经打开 BOSS 岗位页（GUI 的「打开 BOSS 页面手动筛选」）。
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

MAX_PREVIEW_JOBS = 10


async def preview_jobs(n: int = 5) -> dict[str, Any]:
    """预览当前岗位列表前 ``n`` 个（1~10），返回给前端展示的结构。

    Returns::

        {"status": "ok", "type": "preview_jobs", "text": "多行摘要",
         "data": {"jobs": [{"index", "title", "company", "salary",
                            "location", "matched", "reason"}], "scanned": n}}
        {"status": "error", "type": "preview_jobs", "code", "message"}
    """
    count = max(1, min(MAX_PREVIEW_JOBS, int(n)))
    from boss_zhipin.website_oper import finding_jobs

    if finding_jobs.get_tab() is None:
        return _error(
            "no_browser",
            "浏览器还没打开。请先点「打开 BOSS 页面手动筛选」，在网页里选好岗位列表，再让我预览。",
        )
    loaded = await finding_jobs.get_loaded_job_count()
    if not loaded:
        return _error(
            "no_jobs",
            "当前页面上没有岗位卡片。请先在 BOSS 网页里打开推荐流或搜索结果页。",
        )

    filters = _profile_filters()
    jobs: list[dict[str, Any]] = []
    for index in range(1, count + 1):
        job = await finding_jobs.get_job_by_index(index)
        if job is None:
            break
        match = _match(job, filters)
        jobs.append(
            {
                "index": index,
                "title": job.title,
                "company": job.company,
                "salary": job.salary,
                "location": job.location,
                "matched": match["matched"],
                "reason": match["reason"],
            }
        )
        await asyncio.sleep(1)

    text_lines = []
    for item in jobs:
        flag = "√" if item["matched"] else "×"
        text_lines.append(
            f"{item['index']}. [{flag}] {item['title']} | {item['company'] or '?'}"
            f" | {item['salary'] or '-'}"
        )
    return {
        "status": "ok",
        "type": "preview_jobs",
        "text": "\n".join(text_lines) or "没有读到岗位",
        "data": {"jobs": jobs, "scanned": len(jobs)},
    }


def _match(job, filters: dict) -> dict[str, Any]:
    """按当前 profile 的本地规则标注单个岗位（复用 filter_rules）。"""
    from boss_zhipin.config.filter_rules import (
        JobPosting as FilterJobPosting,
        match_posting,
    )

    if not filters:
        return {"matched": True, "reason": "未配置筛选规则"}
    posting = FilterJobPosting(
        title=job.title,
        description=job.description or "",
        company=job.company,
        location=job.location,
        salary=job.salary,
        tags=job.tags or [],
        boss_name=job.boss_name,
        boss_active_status=job.boss_active_status,
        education=job.education,
        detail_url=job.detail_url,
    )
    result = match_posting(posting, filters)
    return {"matched": result.matched, "reason": result.reason}


def _profile_filters() -> dict:
    """读 GUI/CLI 同款的 profile 筛选规则（BOSS_PROFILE_FILTERS_JSON）。"""
    import json

    raw = os.getenv("BOSS_PROFILE_FILTERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _error(code: str, message: str) -> dict[str, Any]:
    return {"status": "error", "type": "preview_jobs", "code": code, "message": message}
