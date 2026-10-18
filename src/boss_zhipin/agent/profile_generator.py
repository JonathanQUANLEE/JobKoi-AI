"""把用户的一句话需求翻译成可执行投递配置（profile）。

Facade 模块：对外提供 generate、sanitize_profile、parse_llm_json 等接口，
底层数据校验模型拆分至 profile_schema，提示词拆分至 profile_prompts。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from boss_zhipin.agent.config_io import effective_config
from boss_zhipin.agent.llm_client import (
    LLMClientError,
    chat_completion_with_retry,
    extract_content,
)
from boss_zhipin.agent.profile_prompts import SYSTEM_PROMPT
from boss_zhipin.agent.profile_schema import (
    DEFAULT_GREETING_FILE,
    DEFAULT_STATE,
    MAX_HISTORY,
    MAX_KEYWORD_LEN,
    MAX_KEYWORDS,
    ActionType,
    MatchType,
    ModeType,
    ProfileParseError,
    ProfileSanitizeError,
    ScopeType,
    parse_llm_json,
    sanitize_action,
    sanitize_profile,
)

log = logging.getLogger(__name__)

# 保持与旧接口及测试用例兼容的别名导出
_sanitize_action = sanitize_action


async def generate(
    message: str,
    history: list[dict[str, Any]] | None = None,
    current_form: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """一次对话轮：把用户消息交给 LLM，返回结构化结果。

    Returns::
        {"status": "ok",    "reply": str, "profile": dict | None}
        {"status": "error", "code": str,  "message": str, "reply": "", "profile": None}
    """
    # V0.4：未配置时回落开箱默认（智谱+公共 Key），新用户开箱即用
    config = effective_config()
    if not config.is_configured():
        return _error(
            "not_configured",
            "还没有配置模型：请先展开「模型设置」，填写并保存 base_url / API key / 模型名。",
        )

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in (history or [])[-MAX_HISTORY:]:
        role = item.get("role")
        content_text = item.get("content")
        if role in ("user", "assistant") and isinstance(content_text, str) and content_text.strip():
            # 过滤历史中的系统报错回显（如"出错了："），防止错误样本在上下文里形成误导
            if role == "assistant" and (content_text.startswith("出错了：") or content_text.startswith("出错了:")):
                continue
            messages.append({"role": role, "content": content_text})
    messages.append({"role": "user", "content": _user_message(message, current_form)})

    # 审查修复（2026-10-18）：与项目其他 env 解析（_unit_quotas 等）同款
    # 容错——误配非法值时回退默认，绝不炸穿 generate（原 float() 裸调用
    # 在 try 外，BOSS_AGENT_TIMEOUT="35s" 这类带单位的值会直接 ValueError）。
    try:
        agent_timeout = float(os.getenv("BOSS_AGENT_TIMEOUT", "35.0"))
        if agent_timeout <= 0:
            raise ValueError
    except ValueError:
        log.warning("BOSS_AGENT_TIMEOUT 配置非法，回退默认 35.0s")
        agent_timeout = 35.0
    try:
        data = await asyncio.to_thread(
            chat_completion_with_retry,
            messages,
            base_url=config.base_url,
            api_key=config.api_key,
            model=config.model,
            timeout=agent_timeout,
        )
        content = extract_content(data)
    except LLMClientError as e:
        log.warning("agent LLM 调用失败 [%s]: %s", e.code, e.message[:200])
        return _error("llm_error", f"模型调用失败 [{e.code}]：{e.message[:300]}")

    try:
        parsed = parse_llm_json(content)
    except ProfileParseError as e:
        log.warning("agent 模型输出解析失败: %s", e)
        return _error("bad_model_output", f"模型输出不是合法 JSON，请重试或换个模型：{e}")

    reply = parsed.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        return _error("bad_model_output", "模型输出缺少 reply 字段，请重试。")

    profile = parsed.get("profile")
    if profile is not None and not isinstance(profile, dict):
        return _error("bad_model_output", "模型输出的 profile 不是对象，请重试。")

    safe_profile = None
    if profile is not None:
        try:
            safe_profile = sanitize_profile(profile)
        except ProfileSanitizeError as e:
            log.warning("agent profile 净化失败: %s", e)
            return _error("sanitize_failed", f"模型生成的配置未通过安全校验，请重试：{e}")

    return {
        "status": "ok",
        "reply": reply.strip(),
        "profile": safe_profile,
        "action": sanitize_action(parsed.get("action")),
    }


def _user_message(message: str, current_form: dict[str, Any] | None) -> str:
    parts = [message.strip()]
    if current_form:
        cfg = dict(current_form)
        resume_name = cfg.pop("resume_name", None)
        resume_text = cfg.pop("resume_text", None)
        if resume_text:
            parts.append(
                f"\n[用户关联简历资料 ({resume_name or '默认简历'})]\n{str(resume_text).strip()}"
            )
        if cfg:
            parts.append(
                "\n[当前投递配置(JSON)。用户没提到的字段保持这里的原值，不要自行改动]"
            )
            parts.append(json.dumps(cfg, ensure_ascii=False))
    return "\n".join(parts)


def _error(code: str, message: str) -> dict[str, Any]:
    return {
        "status": "error",
        "code": code,
        "message": message,
        "reply": "",
        "profile": None,
        "action": None,
    }


__all__ = [
    "DEFAULT_GREETING_FILE",
    "DEFAULT_STATE",
    "MAX_HISTORY",
    "MAX_KEYWORDS",
    "MAX_KEYWORD_LEN",
    "ScopeType",
    "MatchType",
    "ModeType",
    "ActionType",
    "SYSTEM_PROMPT",
    "ProfileParseError",
    "ProfileSanitizeError",
    "sanitize_profile",
    "parse_llm_json",
    "sanitize_action",
    "generate",
    "read_config",
    "chat_completion_with_retry",
]
