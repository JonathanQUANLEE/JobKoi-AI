"""Profile 本地筛选规则匹配。

该模块只处理结构化岗位和配置规则，不操作浏览器，也不发送消息。
"""
from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any, Literal


MatchMode = Literal["contains", "regex", "exact"]
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


def match_posting(posting: JobPosting, filters: dict[str, Any]) -> PostingMatch:
    """按 exclude -> required -> any 的顺序匹配岗位。"""
    for scope_name, groups in (filters or {}).items():
        if not isinstance(groups, dict):
            continue

        exclude = groups.get("exclude")
        if _is_enabled(exclude):
            result = match_rule_group(posting, _with_default_scope(exclude, scope_name), require_all=False)
            if result.matched:
                return PostingMatch(
                    matched=False,
                    stage="exclude",
                    reason="命中排除关键词: " + "/".join(result.matched_keywords),
                    matched_keywords=result.matched_keywords,
                )

        required = groups.get("required")
        if _is_enabled(required):
            result = match_rule_group(posting, _with_default_scope(required, scope_name), require_all=True)
            if not result.matched:
                return PostingMatch(
                    matched=False,
                    stage="required",
                    reason=result.reason,
                    matched_keywords=result.matched_keywords,
                    missing_keywords=result.missing_keywords,
                )

        any_group = groups.get("any")
        if _is_enabled(any_group):
            result = match_rule_group(posting, _with_default_scope(any_group, scope_name), require_all=False)
            if not result.matched:
                return PostingMatch(
                    matched=False,
                    stage="any",
                    reason=result.reason,
                    matched_keywords=result.matched_keywords,
                    missing_keywords=result.missing_keywords,
                )

    return PostingMatch(matched=True, stage="matched", reason="命中本地筛选规则")


def explain_posting_match(posting: JobPosting, filters: dict[str, Any]) -> dict[str, Any]:
    """返回本地规则匹配的结构化中文解释。

    该函数给 GUI 日志和 JSONL 使用；`match_posting` 保持旧返回类型，避免破坏现有调用。
    """
    result = match_posting(posting, filters)
    summary: dict[str, Any] = {
        "matched": result.matched,
        "stage": result.stage,
        "reason": result.reason,
        "scope": "title",
        "scope_label": _SCOPE_LABELS["title"],
        "required": {"keywords": [], "matched": [], "missing": []},
        "any": {"keywords": [], "matched": [], "missing": []},
        "exclude": {"keywords": [], "matched": []},
        "explanation": result.reason,
    }

    explanations: list[str] = []
    for scope_name, groups in (filters or {}).items():
        if not isinstance(groups, dict):
            continue
        group_summary = {
            "scope": str(scope_name),
            "scope_label": _SCOPE_LABELS.get(str(scope_name), str(scope_name)),
            "required": {"keywords": [], "matched": [], "missing": []},
            "any": {"keywords": [], "matched": [], "missing": []},
            "exclude": {"keywords": [], "matched": []},
        }
        for group_name, require_all in (
            ("exclude", False),
            ("required", True),
            ("any", False),
        ):
            rule = groups.get(group_name)
            if not _is_enabled(rule):
                continue
            rule_with_scope = _with_default_scope(rule, str(scope_name))
            scope = str(rule_with_scope.get("scope") or scope_name)
            keywords = [str(item) for item in rule_with_scope.get("keywords") or [] if str(item)]
            group_result = match_rule_group(
                posting,
                rule_with_scope,
                require_all=require_all,
            )
            group_summary["scope"] = scope
            group_summary["scope_label"] = _SCOPE_LABELS.get(scope, scope)
            if group_name == "exclude":
                group_summary["exclude"] = {
                    "keywords": keywords,
                    "matched": group_result.matched_keywords,
                }
            else:
                missing_keywords = [
                    keyword
                    for keyword in keywords
                    if keyword not in group_result.matched_keywords
                ]
                group_summary[group_name] = {
                    "keywords": keywords,
                    "matched": group_result.matched_keywords,
                    "missing": missing_keywords,
                }

        group_explanation = _build_scope_explanation(group_summary)
        if group_explanation != "命中本地筛选规则":
            explanations.append(group_explanation)
        if result.stage in ("required", "any", "exclude") or summary["required"]["keywords"] == []:
            summary.update(group_summary)

    summary["explanation"] = "；".join(explanations) if explanations else _build_explanation(summary)
    return summary


def match_rule_group(
    posting: JobPosting,
    rule: dict[str, Any] | None,
    *,
    require_all: bool = True,
) -> RuleMatch:
    if not _is_enabled(rule):
        return RuleMatch(matched=True, reason="规则未启用")

    scope = str(rule.get("scope") or "title")
    mode = str(rule.get("match") or "contains")
    keywords = [str(item) for item in rule.get("keywords") or [] if str(item)]
    case_sensitive = bool(rule.get("case_sensitive", False))
    text = _scope_text(posting, scope)

    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    for keyword in keywords:
        if _match_keyword(text, keyword, mode, case_sensitive=case_sensitive):
            matched_keywords.append(keyword)
        else:
            missing_keywords.append(keyword)

    if require_all:
        matched = len(missing_keywords) == 0
    else:
        matched = bool(matched_keywords)

    if matched:
        return RuleMatch(matched=True, reason="命中关键词: " + "/".join(matched_keywords), matched_keywords=matched_keywords)
    return RuleMatch(
        matched=False,
        reason="未命中关键词: " + "/".join(missing_keywords),
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
    )


def _is_enabled(rule: Any) -> bool:
    return isinstance(rule, dict) and bool(rule.get("enabled", True))


def _with_default_scope(rule: dict[str, Any], scope_name: str) -> dict[str, Any]:
    if "scope" in rule:
        return rule
    copied = dict(rule)
    copied["scope"] = scope_name
    return copied


def _scope_text(posting: JobPosting, scope: str) -> str:
    if scope == "title":
        return posting.title
    if scope == "description":
        return posting.description
    if scope == "title_description":
        return "\n".join([posting.title, posting.description])
    if scope == "company":
        return posting.company
    if scope == "boss":
        return "\n".join([posting.boss_name, posting.boss_active_status])
    if scope == "location":
        return posting.location
    if scope == "all":
        return "\n".join(
            [
                posting.title,
                posting.company,
                posting.location,
                posting.salary,
                " ".join(posting.tags),
                posting.boss_name,
                posting.boss_active_status,
                posting.education,
                posting.description,
                posting.detail_url,
            ]
        )
    raise FilterConfigError(f"未知匹配作用域: {scope}")


def _match_keyword(text: str, keyword: str, mode: str, *, case_sensitive: bool) -> bool:
    haystack = text if case_sensitive else text.lower()
    needle = keyword if case_sensitive else keyword.lower()

    if mode == "contains":
        return needle in haystack
    if mode == "exact":
        return haystack == needle
    if mode == "regex":
        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            return re.search(keyword, text, flags=flags) is not None
        except re.error as e:
            raise FilterConfigError(f"正则表达式无效: {keyword}") from e
    raise FilterConfigError(f"未知匹配方式: {mode}")


def _quote_keywords(keywords: list[str]) -> str:
    return "、".join(f"「{keyword}」" for keyword in keywords)


def _build_explanation(summary: dict[str, Any]) -> str:
    scope_label = str(summary.get("scope_label") or "当前范围")
    exclude_matched = list(summary.get("exclude", {}).get("matched") or [])
    if exclude_matched:
        return f"{scope_label}命中排除关键词{_quote_keywords(exclude_matched)}"

    required = summary.get("required", {})
    required_missing = list(required.get("missing") or [])
    if required_missing:
        return f"{scope_label}缺少必须关键词{_quote_keywords(required_missing)}"

    any_group = summary.get("any", {})
    any_keywords = list(any_group.get("keywords") or [])
    any_matched = list(any_group.get("matched") or [])
    if any_keywords and not any_matched:
        return f"{scope_label}未命中任一方向关键词{_quote_keywords(any_keywords)}"

    parts: list[str] = []
    required_matched = list(required.get("matched") or [])
    if required_matched:
        parts.append(f"{scope_label}命中必须关键词{_quote_keywords(required_matched)}")
    if any_matched:
        parts.append(f"并命中方向关键词{_quote_keywords(any_matched)}")
    return "，".join(parts) if parts else "命中本地筛选规则"


def _build_scope_explanation(summary: dict[str, Any]) -> str:
    """生成单个匹配范围的解释，便于多 scope 日志阅读。"""
    explanation = _build_explanation(summary)
    scope_label = str(summary.get("scope_label") or "")
    if explanation.startswith("并命中方向关键词") and scope_label:
        return scope_label + explanation[1:]
    return explanation
