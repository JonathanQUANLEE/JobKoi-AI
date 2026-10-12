"""Profile 本地筛选规则匹配。

该模块只处理结构化岗位和配置规则，不操作浏览器，也不发送消息。
"""
from __future__ import annotations

import re
from typing import Any

from boss_zhipin.config.rule_explainer import (
    build_explanation,
    build_scope_explanation,
    explain_match,
    quote_keywords,
)
from boss_zhipin.config.rule_models import (
    FilterConfigError,
    JobPosting,
    MatchMode,
    PostingMatch,
    RuleMatch,
    Scope,
    _SCOPE_LABELS,
)

# 兼容私有符号导出
_quote_keywords = quote_keywords
_build_explanation = build_explanation
_build_scope_explanation = build_scope_explanation


def match_posting(posting: JobPosting, filters: dict[str, Any]) -> PostingMatch:
    """按 exclude -> required -> any 的顺序匹配岗位。

    命中时 reason 保留 required/any 组的命中说明（smart 分层的 L1-L4
    就从这里透传到投递日志），而不是笼统的"命中本地筛选规则"。
    """
    hit_reason = ""
    for scope_name, groups in (filters or {}).items():
        if not isinstance(groups, dict):
            continue

        exclude = groups.get("exclude")
        if _is_enabled(exclude):
            result = match_rule_group(
                posting, _with_default_scope(exclude, scope_name), require_all=False
            )
            if result.matched:
                return PostingMatch(
                    matched=False,
                    stage="exclude",
                    reason="命中排除关键词: " + "/".join(result.matched_keywords),
                    matched_keywords=result.matched_keywords,
                )

        required = groups.get("required")
        if _is_enabled(required):
            result = match_rule_group(
                posting, _with_default_scope(required, scope_name), require_all=True
            )
            if not result.matched:
                return PostingMatch(
                    matched=False,
                    stage="required",
                    reason=result.reason,
                    matched_keywords=result.matched_keywords,
                    missing_keywords=result.missing_keywords,
                )
            if not hit_reason:
                hit_reason = result.reason

        any_group = groups.get("any")
        if _is_enabled(any_group):
            result = match_rule_group(
                posting, _with_default_scope(any_group, scope_name), require_all=False
            )
            if not result.matched:
                return PostingMatch(
                    matched=False,
                    stage="any",
                    reason=result.reason,
                    matched_keywords=result.matched_keywords,
                    missing_keywords=result.missing_keywords,
                )
            if not hit_reason:
                hit_reason = result.reason

    return PostingMatch(
        matched=True,
        stage="matched",
        reason=hit_reason or "命中本地筛选规则",
    )


def explain_posting_match(posting: JobPosting, filters: dict[str, Any]) -> dict[str, Any]:
    """返回本地规则匹配的结构化中文解释。"""
    return explain_match(
        posting,
        filters,
        match_posting_fn=match_posting,
        match_rule_group_fn=match_rule_group,
        is_enabled_fn=_is_enabled,
        with_default_scope_fn=_with_default_scope,
    )


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

    # Smart 意图分层（2026-10-13 重做）：关键词先解析成「方向×性质」意图，
    # 再对文本分层判定（L1 完整意图 → L2 强方向 → L3 同族+性质 → L4 泛方向），
    # 分层原因写进 reason。业务背景与业界依据见 config/intent_lexicon.py。
    if mode == "smart":
        return _match_smart_group(text, keywords, require_all=require_all)

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
        return RuleMatch(
            matched=True,
            reason="命中关键词: " + "/".join(matched_keywords),
            matched_keywords=matched_keywords,
        )
    return RuleMatch(
        matched=False,
        reason="未命中关键词: " + "/".join(missing_keywords),
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
    )


def _match_smart_group(text: str, keywords: list[str], *, require_all: bool) -> RuleMatch:
    """smart 模式的组级匹配：每个关键词独立解析意图并分层判定。"""
    from boss_zhipin.config.intent_lexicon import classify_text, parse_intent

    matched_keywords: list[str] = []
    matched_reasons: list[str] = []
    missing_keywords: list[str] = []
    missing_reasons: list[str] = []
    for keyword in keywords:
        intent = parse_intent(keyword)
        hit, layer_reason = classify_text(text, intent)
        if hit:
            matched_keywords.append(keyword)
            matched_reasons.append(f"{keyword}→{layer_reason}")
        else:
            missing_keywords.append(keyword)
            missing_reasons.append(f"{keyword}→{layer_reason}")

    matched = (len(missing_keywords) == 0) if require_all else bool(matched_keywords)
    if matched:
        return RuleMatch(
            matched=True,
            reason="意图分层命中: " + "；".join(matched_reasons),
            matched_keywords=matched_keywords,
        )
    return RuleMatch(
        matched=False,
        reason="未命中意图词族: " + "；".join(missing_reasons),
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


__all__ = [
    "FilterConfigError",
    "JobPosting",
    "MatchMode",
    "PostingMatch",
    "RuleMatch",
    "Scope",
    "_SCOPE_LABELS",
    "_build_explanation",
    "_build_scope_explanation",
    "_is_enabled",
    "_match_keyword",
    "_quote_keywords",
    "_scope_text",
    "_with_default_scope",
    "explain_posting_match",
    "match_posting",
    "match_rule_group",
]
