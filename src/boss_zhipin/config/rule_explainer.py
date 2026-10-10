"""Formatting and explanation helpers for rule matches."""
from __future__ import annotations

from typing import Any, Callable
from boss_zhipin.config.rule_models import JobPosting, PostingMatch, RuleMatch, _SCOPE_LABELS


def quote_keywords(keywords: list[str]) -> str:
    return "、".join(f"「{keyword}」" for keyword in keywords)


def build_explanation(summary: dict[str, Any]) -> str:
    scope_label = str(summary.get("scope_label") or "当前范围")
    exclude_matched = list(summary.get("exclude", {}).get("matched") or [])
    if exclude_matched:
        return f"{scope_label}命中排除关键词{quote_keywords(exclude_matched)}"

    required = summary.get("required", {})
    required_missing = list(required.get("missing") or [])
    if required_missing:
        return f"{scope_label}缺少必须关键词{quote_keywords(required_missing)}"

    any_group = summary.get("any", {})
    any_keywords = list(any_group.get("keywords") or [])
    any_matched = list(any_group.get("matched") or [])
    if any_keywords and not any_matched:
        return f"{scope_label}未命中任一方向关键词{quote_keywords(any_keywords)}"

    parts: list[str] = []
    required_matched = list(required.get("matched") or [])
    if required_matched:
        parts.append(f"{scope_label}命中必须关键词{quote_keywords(required_matched)}")
    if any_matched:
        parts.append(f"并命中方向关键词{quote_keywords(any_matched)}")
    return "，".join(parts) if parts else "命中本地筛选规则"


def build_scope_explanation(summary: dict[str, Any]) -> str:
    """生成单个匹配范围的解释，便于多 scope 日志阅读。"""
    explanation = build_explanation(summary)
    scope_label = str(summary.get("scope_label") or "")
    if explanation.startswith("并命中方向关键词") and scope_label:
        return scope_label + explanation[1:]
    return explanation


def explain_match(
    posting: JobPosting,
    filters: dict[str, Any],
    match_posting_fn: Callable[[JobPosting, dict[str, Any]], PostingMatch],
    match_rule_group_fn: Callable[..., RuleMatch],
    is_enabled_fn: Callable[[Any], bool],
    with_default_scope_fn: Callable[[dict[str, Any], str], dict[str, Any]],
) -> dict[str, Any]:
    """返回本地规则匹配的结构化中文解释。"""
    result = match_posting_fn(posting, filters)
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
            if not is_enabled_fn(rule):
                continue
            rule_with_scope = with_default_scope_fn(rule, str(scope_name))
            scope = str(rule_with_scope.get("scope") or scope_name)
            keywords = [str(item) for item in rule_with_scope.get("keywords") or [] if str(item)]
            group_result = match_rule_group_fn(
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

        group_explanation = build_scope_explanation(group_summary)
        if group_explanation != "命中本地筛选规则":
            explanations.append(group_explanation)
        if result.stage in ("required", "any", "exclude") or summary["required"]["keywords"] == []:
            summary.update(group_summary)

    summary["explanation"] = "；".join(explanations) if explanations else build_explanation(summary)
    return summary
