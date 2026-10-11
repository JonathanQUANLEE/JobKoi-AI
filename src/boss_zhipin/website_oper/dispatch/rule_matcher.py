"""关键词匹配策略、规则校验与匹配日志记录。"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
from typing import Literal

from boss_zhipin.website_oper.dispatch.env_config import _csv_env

log = logging.getLogger(__name__)

SCAN_MATCH_LOG_PATH = Path(
    os.getenv("SCAN_MATCH_LOG_PATH", "./logs/scan_matches.jsonl")
)


def _contains_term(text: str, term: str) -> bool:
    return term.lower() in text.lower()


@dataclass(frozen=True)
class KeywordPolicy:
    """Reusable keyword policy for matching a selected job text scope."""

    required_terms: list[str]
    any_groups: list[list[str]]
    scope: Literal["title", "description", "both"] = "title"
    scope_label: str = "岗位名称"
    any_label: str = "方向关键词"

    def match(self, *, title: str, description: str) -> tuple[bool, str]:
        text = self._text_for_scope(title=title, description=description)
        required_ok, required_reason = _matches_required_terms(
            text, self.required_terms
        )
        if not required_ok:
            missing = required_reason.removeprefix("未命中必需关键词: ")
            return False, f"未命中{self.scope_label}必需关键词: {missing}"

        if not self.any_groups:
            return True, f"命中{self.scope_label}必需关键词"

        matched_groups = [
            group
            for group in self.any_groups
            if any(_contains_term(text, term) for term in group)
        ]
        if not matched_groups:
            expected = "/".join(term for group in self.any_groups for term in group)
            return False, f"未命中{self.scope_label}{self.any_label}: {expected}"

        matched_terms = [
            term
            for group in matched_groups
            for term in group
            if _contains_term(text, term)
        ]
        return True, f"命中{self.scope_label}自动发送条件: {'/'.join(matched_terms)}"

    def _text_for_scope(self, *, title: str, description: str) -> str:
        if self.scope == "description":
            return description
        if self.scope == "both":
            return f"{title}\n{description}"
        return title


def _matches_all_groups(text: str, groups: list[list[str]]) -> tuple[bool, str]:
    for group in groups:
        if group and not any(_contains_term(text, item) for item in group):
            return False, "未命中: " + "/".join(group)
    return True, "命中扫描条件"


def _matches_required_terms(text: str, required_terms: list[str]) -> tuple[bool, str]:
    for term in required_terms:
        if term and not _contains_term(text, term):
            return False, f"未命中必需关键词: {term}"
    return True, "命中必需关键词"


def _scan_required_terms() -> list[str]:
    return _csv_env("BOSS_SCAN_REQUIRED_TERMS")


def _review_required_terms() -> list[str]:
    return _csv_env("BOSS_REVIEW_REQUIRED_TERMS")


def _review_locations() -> list[str]:
    return _csv_env("BOSS_REVIEW_LOCATIONS")


def _auto_required_terms() -> list[str]:
    return (
        _csv_env("BOSS_AUTO_TITLE_REQUIRED_TERMS")
        or _csv_env("BOSS_AUTO_REQUIRED_TERMS")
    )


def _auto_title_keywords() -> list[str]:
    return (
        _csv_env("BOSS_AUTO_TITLE_KEYWORDS")
        or _csv_env("BOSS_AUTO_DIRECTION_TERMS")
        or ["后端开发", "ai"]
    )


def _auto_send_policy() -> KeywordPolicy:
    return KeywordPolicy(
        required_terms=_auto_required_terms(),
        any_groups=[_auto_title_keywords()],
        scope="title",
        scope_label="岗位名称",
        any_label="方向关键词",
    )


def _matches_auto_send_job(
    text: str | None = None,
    *,
    title: str | None = None,
    description: str | None = None,
) -> tuple[bool, str]:
    if title is None:
        title = text or ""
    return _auto_send_policy().match(title=title, description=description or "")


def _scan_groups() -> list[list[str]]:
    keyword_groups = [[item] for item in _csv_env("BOSS_SCAN_KEYWORDS")]
    locations = _csv_env("BOSS_SCAN_LOCATIONS")
    if locations:
        keyword_groups.append(locations)
    return keyword_groups


def _log_scan_match(*, index: int, job_description: str, details: dict) -> None:
    SCAN_MATCH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "index": index,
        "details": details,
        "job_description": job_description,
    }
    with SCAN_MATCH_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
