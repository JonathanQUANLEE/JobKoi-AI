"""Profile schema models and sanitization logic."""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator, model_validator

log = logging.getLogger(__name__)

# 回传给模型的聊天历史条数上限
MAX_HISTORY = 10

# 关键词护栏：总数 / 单条长度
MAX_KEYWORDS = 30
MAX_KEYWORD_LEN = 40

ScopeType = Literal["title", "description", "title_description", "location", "all"]
MatchType = Literal["contains", "regex", "exact"]
ModeType = Literal["scan", "review", "auto"]
ActionType = Literal["get_stats", "preview_jobs", "prepare_run"]

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


def _clamp_int(value: Any, lo: int, hi: int, name: str) -> int:
    """把数字收敛到 [lo, hi]；非数字直接报错。"""
    try:
        num = int(value)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{name} 不是整数: {value!r}") from e
    return max(lo, min(hi, num))


class _SendConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mode: ModeType = "scan"
    greeting_file: str = DEFAULT_GREETING_FILE
    delay_min: int = 10
    delay_max: int = 60
    max_sent: int = 30
    daily_sent_limit: int = 50
    stop_on_captcha: bool = True
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


def sanitize_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """白名单校验 + 收敛 LLM 生成的 profile。"""
    try:
        profile = _Profile.model_validate(raw)
    except ValidationError as e:
        raise ProfileSanitizeError(_compact_validation_error(e)) from e
    data = profile.model_dump()
    data["send"]["greeting_file"] = DEFAULT_GREETING_FILE
    data["state"] = dict(DEFAULT_STATE)
    return data


def parse_llm_json(content: str) -> dict[str, Any]:
    """从模型输出里取出 JSON 对象。"""
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


def sanitize_action(raw: Any) -> dict[str, Any] | None:
    """净化 LLM 声明的工具意图。"""
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
