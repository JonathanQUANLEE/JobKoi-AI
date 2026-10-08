"""把用户的一句话需求翻译成可执行投递配置（profile）。

流程（里程碑 1 的「翻译官 + 确认制」）：

.. code-block:: text

    用户消息 + 聊天历史 + 当前表单值
        └─ generate()（async，LLM 调用放 to_thread 不卡 UI）
             └─ chat_completion_with_retry（OpenAI 兼容端点）
                  └─ 模型输出 JSON：{"reply": ..., "profile": ...}
                       ├─ parse_llm_json   —— 剥代码栅栏 / 前后闲话，取出 JSON
                       └─ sanitize_profile —— pydantic 白名单校验 + 数值 clamp
                            └─ 前端拿到后仅做「预览」；用户点「应用到表单」
                               才回填表单；点「开始运行」才会真投递。

安全设计（为什么 sanitize 这么严）：
- LLM 输出是**不可信输入**。它可能幻觉出奇怪的键、超范围的数字、恶意
  路径（写任意文件）或坏正则（RE DoS）。所有字段走 pydantic 白名单模型，
  未知键忽略、数字收敛到安全区间、正则预编译验证。
- ``state`` 三个日志路径和 ``greeting_file`` **不采纳** LLM 的值，强制
  默认——防路径注入。
- ``start_url`` 只接受 zhipin.com 域（本工具只操作 BOSS）。
- mode 默认 ``scan``（只扫描不发送）——宁可让用户手动升级到 auto，
  也不让模型替用户做「真实发送」的决定。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator, model_validator

from boss_zhipin.agent.config_io import read_config
from boss_zhipin.agent.llm_client import (
    LLMClientError,
    chat_completion_with_retry,
    extract_content,
)

log = logging.getLogger(__name__)

# 回传给模型的聊天历史条数上限（控制 token；后端无会话状态，历史由前端持有）
MAX_HISTORY = 10

# 关键词护栏：总数 / 单条长度（防 LLM 塞一坨垃圾关键词或超长串）
MAX_KEYWORDS = 30
MAX_KEYWORD_LEN = 40

ScopeType = Literal["title", "description", "title_description", "location", "all"]
MatchType = Literal["contains", "regex", "exact"]
ModeType = Literal["scan", "review", "auto"]

# 不采纳 LLM 值的固定字段（防路径注入写任意文件）
DEFAULT_GREETING_FILE = "./greetings/default.txt"
DEFAULT_STATE = {
    "seen_jobs_file": "./logs/seen_jobs.jsonl",
    "sent_log_file": "./logs/sent_jobs.jsonl",
    "skipped_log_file": "./logs/skipped_jobs.jsonl",
}


class ProfileParseError(RuntimeError):
    """模型输出里取不出合法 JSON。"""


class ProfileSanitizeError(RuntimeError):
    """模型生成的 profile 没通过白名单校验。"""


# ---------- pydantic 白名单模型（字段与 tauri-ui profileForm 的 BuiltProfileData 同构） ----------


class _RuleBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    enabled: bool = True
    scope: ScopeType = "title"
    match: MatchType = "contains"
    case_sensitive: bool = False
    keywords: list[str] = []

    @field_validator("keywords")
    @classmethod
    def _clean_keywords(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in value:
            text = str(item).strip()
            if not text or len(text) > MAX_KEYWORD_LEN or text in cleaned:
                continue
            cleaned.append(text)
            if len(cleaned) >= MAX_KEYWORDS:
                break
        return cleaned

    @model_validator(mode="after")
    def _validate_regex_keywords(self) -> "_RuleBlock":
        if self.match == "regex":
            for keyword in self.keywords:
                try:
                    re.compile(keyword)
                except re.error as e:
                    raise ValueError(f"无效正则关键词 {keyword!r}: {e}") from e
        return self


class _PageFilterItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    values: list[str] = []

    @field_validator("values")
    @classmethod
    def _clean_values(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in value:
            text = str(item).strip()
            if not text or len(text) > MAX_KEYWORD_LEN or text in cleaned:
                continue
            cleaned.append(text)
            if len(cleaned) >= MAX_KEYWORDS:
                break
        return cleaned


class _PageFilters(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strict: bool = False
    city: _PageFilterItem = _PageFilterItem()
    education: _PageFilterItem = _PageFilterItem()
    boss_active: _PageFilterItem = _PageFilterItem()


class _TitleFilters(BaseModel):
    model_config = ConfigDict(extra="ignore")

    required: _RuleBlock = _RuleBlock(enabled=False)
    any: _RuleBlock = _RuleBlock()
    exclude: _RuleBlock = _RuleBlock()


class _Filters(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: _TitleFilters = _TitleFilters()


class _SearchConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    query: str = ""
    start_url: str = ""

    @field_validator("query")
    @classmethod
    def _clip_query(cls, value: str) -> str:
        return value.strip()[:MAX_KEYWORD_LEN]

    @field_validator("start_url")
    @classmethod
    def _only_zhipin_domain(cls, value: str) -> str:
        text = value.strip()
        if not text:
            return ""
        host = urlsplit(text).netloc.lower()
        if host == "zhipin.com" or host.endswith(".zhipin.com"):
            return text
        log.warning("agent 丢弃非 zhipin.com 域的 start_url: %r", text[:100])
        return ""


class _SendConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mode: ModeType = "scan"
    greeting_file: str = DEFAULT_GREETING_FILE
    delay_min: int = 10
    delay_max: int = 60
    max_sent: int = 30
    daily_sent_limit: int = 50
    stop_on_captcha: bool = True
    # F2/F3/F5 三个 opt-in 开关：默认全关，用户在 GUI 勾选才生效。
    send_resume_after_greeting: bool = False
    auto_send_resume_on_reply: bool = False
    ai_greeting: bool = False

    @field_validator("delay_min", mode="before")
    @classmethod
    def _clamp_delay_min(cls, value: Any) -> int:
        return _clamp_int(value, 1, 600, "delay_min")

    @field_validator("delay_max", mode="before")
    @classmethod
    def _clamp_delay_max(cls, value: Any) -> int:
        return _clamp_int(value, 1, 1800, "delay_max")

    @field_validator("max_sent", mode="before")
    @classmethod
    def _clamp_max_sent(cls, value: Any) -> int:
        return _clamp_int(value, 1, 150, "max_sent")

    @field_validator("daily_sent_limit", mode="before")
    @classmethod
    def _clamp_daily_limit(cls, value: Any) -> int:
        return _clamp_int(value, 1, 200, "daily_sent_limit")

    @model_validator(mode="after")
    def _delay_min_le_max(self) -> "_SendConfig":
        if self.delay_min > self.delay_max:
            return self.model_copy(update={"delay_min": self.delay_max, "delay_max": self.delay_min})
        return self


class _Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    search: _SearchConfig = _SearchConfig()
    page_filters: _PageFilters = _PageFilters()
    filters: _Filters = _Filters()
    send: _SendConfig = _SendConfig()


# ---------- 工具协议（F4）：LLM 只声明意图，执行在 IPC 层 ----------

ActionType = Literal["get_stats", "preview_jobs", "prepare_run"]


class _ActionParams(BaseModel):
    model_config = ConfigDict(extra="ignore")

    n: int = 5

    @field_validator("n", mode="before")
    @classmethod
    def _clamp_n(cls, value: Any) -> int:
        try:
            num = int(value)
        except (TypeError, ValueError) as e:
            raise ValueError(f"params.n 不是整数: {value!r}") from e
        return max(1, min(10, num))


class _Action(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: ActionType
    params: _ActionParams = _ActionParams()


def _clamp_int(value: Any, lo: int, hi: int, name: str) -> int:
    """把数字收敛到 [lo, hi]；非数字直接报错（类型烂说明模型输出坏了）。"""
    try:
        num = int(value)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{name} 不是整数: {value!r}") from e
    return max(lo, min(hi, num))


# ---------- 对外 API ----------


def sanitize_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """白名单校验 + 收敛 LLM 生成的 profile，返回与 BuiltProfileData 同构的 dict。

    Raises:
        ProfileSanitizeError: 字段类型/枚举/正则不合法——整份拒绝，让用户重试。
    """
    try:
        profile = _Profile.model_validate(raw)
    except ValidationError as e:
        raise ProfileSanitizeError(_compact_validation_error(e)) from e
    data = profile.model_dump()
    # 强制默认：不采纳 LLM 的路径类字段（防注入）
    data["send"]["greeting_file"] = DEFAULT_GREETING_FILE
    data["state"] = dict(DEFAULT_STATE)
    return data


def parse_llm_json(content: str) -> dict[str, Any]:
    """从模型输出里取出 JSON 对象。

    模型经常无视「只输出 JSON」的指令，包一层 ```json 栅栏或前后闲话。
    先整段 parse，失败后截取首个 ``{`` 到末个 ``}`` 的片段再试。
    """
    text = (content or "").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = _parse_braced_slice(text)
    if not isinstance(data, dict):
        raise ProfileParseError("模型输出不是 JSON 对象")
    return data


def _parse_braced_slice(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ProfileParseError("模型输出里找不到 JSON 对象")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as e:
        raise ProfileParseError(f"模型输出 JSON 解析失败: {e}") from e


async def generate(
    message: str,
    history: list[dict[str, Any]] | None = None,
    current_form: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """一次对话轮：把用户消息交给 LLM，返回结构化结果。

    Returns（可预期错误也走返回值，不抛——前端要保留聊天历史）::

        {"status": "ok",    "reply": str, "profile": dict | None}
        {"status": "error", "code": str,  "message": str, "reply": "", "profile": None}
    """
    config = read_config()
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
            messages.append({"role": role, "content": content_text})
    messages.append({"role": "user", "content": _user_message(message, current_form)})

    try:
        data = await asyncio.to_thread(
            chat_completion_with_retry,
            messages,
            base_url=config.base_url,
            api_key=config.api_key,
            model=config.model,
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
        "action": _sanitize_action(parsed.get("action")),
    }


def _user_message(message: str, current_form: dict[str, Any] | None) -> str:
    parts = [message.strip()]
    if current_form:
        parts.append(
            "\n[当前投递配置(JSON)。用户没提到的字段保持这里的原值，不要自行改动]"
        )
        parts.append(json.dumps(current_form, ensure_ascii=False))
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


def _sanitize_action(raw: Any) -> dict[str, Any] | None:
    """净化 LLM 声明的工具意图。

    白名单 Literal 枚举 + params clamp；**校验失败 → 返回 None（丢弃 action，
    保留 reply）**——工具幻觉是常态，不该炸掉整轮对话。
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        log.warning("agent action 不是对象，丢弃: %r", str(raw)[:100])
        return None
    try:
        action = _Action.model_validate(raw)
    except ValidationError as e:
        log.warning("agent action 净化失败，丢弃: %s", _compact_validation_error(e))
        return None
    return action.model_dump()


def _compact_validation_error(e: ValidationError) -> str:
    parts = []
    for err in e.errors()[:5]:
        loc = ".".join(str(piece) for piece in err["loc"])
        parts.append(f"{loc}: {err['msg']}")
    return "；".join(parts) or str(e)


# ---------- 系统提示词 ----------

SYSTEM_PROMPT = """你是「智能投递助手」，内嵌在一个自动投简历的桌面应用里。用户是求职者，可能焦虑、可能是非技术背景，请用友好平实的中文交流。

你的两个职责：
1. 闲聊与情绪支持：用户只是聊天、吐槽、表达求职焦虑时，认真共情回应，此时 profile 必须是 null。
2. 配置翻译：用户表达求职意图（岗位方向、城市、数量、节奏等）时，把需求翻译成下面 schema 的 profile JSON，并在 reply 里用一两句话说明你改了什么、提醒用户确认。

输出格式（严格遵守，只输出一个 JSON 对象，不要 markdown 代码块，不要任何多余文字）：
{"reply": "给用户看的中文回复", "profile": <下面 schema 的对象，或 null>, "action": null 或 {"type": "动作名", "params": {"n": 5}}}

profile 的 schema（字段名固定，全部小写下划线，不要增删字段名）：
{
  "search": {"query": "岗位搜索词，如 'AI Agent实习'；用户没说方向就用当前配置原值", "start_url": "留空字符串即可"},
  "page_filters": {
    "strict": false,
    "city": {"enabled": true, "values": ["城市名"]},
    "education": {"enabled": false, "values": []},
    "boss_active": {"enabled": false, "values": []}
  },
  "filters": {"title": {
    "required": {"enabled": false, "scope": "title", "match": "contains", "case_sensitive": false, "keywords": []},
    "any": {"enabled": true, "scope": "title", "match": "contains", "case_sensitive": false, "keywords": ["方向关键词，如 AI Agent", "大模型"]},
    "exclude": {"enabled": true, "scope": "title", "match": "contains", "case_sensitive": false, "keywords": ["销售", "客服"]}
  }},
  "send": {"mode": "scan", "greeting_file": "./greetings/default.txt", "delay_min": 10, "delay_max": 60, "max_sent": 30, "daily_sent_limit": 50, "stop_on_captcha": true,
    "send_resume_after_greeting": false, "auto_send_resume_on_reply": false, "ai_greeting": false}
}
（send 的最后三个开关默认都是 false；只有用户明确要求时才设 true。）

动作（action）——你可以让应用替用户执行的事，需要时才给，闲聊时必须是 null：
- {"type": "get_stats"}：查三平台投递统计。用户问"今天投了多少/投递情况"时用。
- {"type": "preview_jobs", "params": {"n": 5}}：预览当前岗位列表的前 n 个（1~10，只读不投递）。用户说"看看有什么岗位"时用。
- {"type": "prepare_run"}：用户明确说"开始投递/跑起来"时用。应用会显示「开始投递」按钮，用户点了才会真投。
动作规则：一次最多声明一个动作；不能同时给 profile 和 prepare_run；执行结果由应用展示，你不许在 reply 里谎称已经执行或已经投递。

行为规则：
- 保守优先：用户没有明确说「自动发送/真实投递」时，mode 一律用 "scan"（只扫描记录，不发送）。用户明确要求自动投递才用 "auto"。
- 用户给了城市就填 city.values；用户说了数量上限（如「最多30个」）就填 max_sent，且不超过 150。
- exclude 默认排除明显非目标岗位的词，但要看用户的专业方向调整：文科/运营方向不要排除「运营」；电气等工科按其方向设置。
- 用户没提到的字段，一律保持消息末尾附带的「当前投递配置」原值，不要编造、不要自作主张改动。
- 回复（reply）里说明你改了什么 / 要执行什么动作，并提醒用户确认。
- 你只负责生成配置和声明动作，动作由应用执行、投递由用户确认；不要在 reply 里声称已经投递了简历。"""
