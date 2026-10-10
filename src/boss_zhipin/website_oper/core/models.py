"""BOSS 岗位数据模型与文本规范化工具。"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class JobPosting:
    title: str
    description: str
    company: str = ""
    location: str = ""
    salary: str = ""
    tags: list[str] | None = None
    boss_name: str = ""
    boss_active_status: str = ""
    education: str = ""
    detail_url: str = ""


# BOSS 详情面板顶部的 UI 文字（按钮 / 区块标题），不是 JD 正文。
_JD_NOISE_LINES = frozenset({"举报", "微信扫码分享", "微信分享", "分享", "职位描述", "立即沟通", "收藏"})


def _strip_jd_noise(text: str) -> str:
    """剥掉 JD 文本**开头连续**的页面 UI 噪声行。"""
    lines = (text or "").split("\n")
    i = 0
    while i < len(lines) and lines[i].strip() in _JD_NOISE_LINES:
        i += 1
    return "\n".join(lines[i:]).strip()


def normalize_job_key(key: str) -> str:
    """规范去重 key：job_detail 链接剥掉查询参数。"""
    key = (key or "").strip()
    if key.startswith("http") and "?" in key:
        return key.split("?", 1)[0]
    return key


def job_key(job: JobPosting) -> str:
    """生成岗位去重 key；详情 URL 优先，其次用标题/公司/地点/BOSS。"""
    if job.detail_url:
        return normalize_job_key(job.detail_url)
    parts = [job.title, job.company, job.location, job.boss_name]
    if any(part.strip() for part in parts):
        return "|".join(parts)
    return (job.description or "").strip()[:120]
