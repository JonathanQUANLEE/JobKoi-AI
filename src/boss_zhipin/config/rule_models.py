"""Data models and errors for filter rules."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

MatchMode = Literal["contains", "regex", "exact", "smart"]
Scope = Literal["title", "description", "title_description", "company", "boss", "location", "all"]

_SCOPE_LABELS = {
    "title": "只看岗位名称",
    "description": "只看岗位正文",
    "title_description": "岗位名称 + 正文",
    "company": "公司名称",
    "boss": "BOSS 信息",
    "location": "工作地点",
    "all": "全部字段",
}


class FilterConfigError(RuntimeError):
    """筛选规则配置错误。"""


@dataclass(frozen=True)
class JobPosting:
    title: str = ""
    company: str = ""
    location: str = ""
    salary: str = ""
    tags: list[str] = field(default_factory=list)
    boss_name: str = ""
    boss_active_status: str = ""
    education: str = ""
    description: str = ""
    detail_url: str = ""


@dataclass(frozen=True)
class RuleMatch:
    matched: bool
    reason: str
    matched_keywords: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class PostingMatch:
    matched: bool
    stage: str
    reason: str
    matched_keywords: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)
