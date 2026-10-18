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
ActionType = Literal[
    "get_stats",
    "preview_jobs",
    "prepare_run",
    "switch_theme",
    "open_settings",
    "navigate",
    "switch_lang",
]

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
    theme: Literal["monochrome", "classic", "system"] | None = None
    modal: Literal["settings", "policy", "rules", "greeting", "model"] | None = None
    tab: Literal[
        "general",
        "schedule",
        "profile",
        "appearance",
        "shortcuts",
        "model",
        "notifications",
        "about",
    ] | None = None
    to: Literal[
        "workbench",
        "profile",
        "resumes",
        "polish",
        "copilot",
        "analytics",
        "live",
    ] | None = None
    lang: Literal["zh", "en"] | None = None

    @field_validator("n", mode="before")
    @classmethod
    def _clamp_n(cls, value: Any) -> int:
        if value is None:
            return 5
        try:
            num = int(value)
        except (TypeError, ValueError) as e:
            raise ValueError(f"params.n 不是整数: {value!r}") from e
        return max(1, min(10, num))

    @field_validator("theme", mode="before")
    @classmethod
    def _normalize_theme(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        v = value.strip().lower()
        if v in ("classic", "orange", "amber", "warm", "经典", "橙色", "琥珀"):
            return "classic"
        if v in ("monochrome", "mono", "black", "white", "dark", "极简", "黑白"):
            return "monochrome"
        if v in ("system", "follow", "系统"):
            return "system"
        return value

    @field_validator("modal", mode="before")
    @classmethod
    def _normalize_modal(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        v = value.strip().lower()
        if v in ("policy", "security", "safety", "strategy", "defense", "防封", "安全", "策略"):
            return "policy"
        if v in ("model", "llm", "ai", "模型"):
            return "model"
        if v in ("rules", "rule", "filter", "keyword", "规则", "关键词"):
            return "rules"
        if v in ("greeting", "greet", "sayhi", "招呼", "招呼语"):
            return "greeting"
        if v in ("settings", "setting", "setup", "设置"):
            return "settings"
        return value

    @field_validator("to", mode="before")
    @classmethod
    def _normalize_to(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        v = value.strip().lower()
        if v in ("resumes", "resume", "简历", "简历库", "简历资料库"):
            return "resumes"
        if v in ("workbench", "home", "dashboard", "工作台", "巡航工作台"):
            return "workbench"
        if v in ("analytics", "statistic", "statistics", "stats", "数据", "统计", "数据统计"):
            return "analytics"
        if v in ("live", "cruise", "monitor", "巡航", "实时巡航"):
            return "live"
        if v in ("polish", "diagnose", "精修", "简历精修"):
            return "polish"
        if v in ("profile", "portrait", "画像", "求职画像"):
            return "profile"
        if v in ("copilot", "agent", "assistant", "管家", "智能管家"):
            return "copilot"
        return value


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
    # 1. 过滤思考模型可能输出的 <think>...</think> 标签
    text = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()

    # 2. 优先提取 markdown json 代码块（避免代码块外部文本干扰）
    m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.IGNORECASE)
    if m:
        try:
            candidate = m.group(1).strip()
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    # 3. 尝试直接反序列化
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
    slice_text = text[start : end + 1]
    try:
        return json.loads(slice_text)
    except json.JSONDecodeError:
        # 常见容错：修复 JSON 尾随逗号 (e.g. {"a": 1,})
        fixed = re.sub(r",\s*([\}\]])", r"\1", slice_text)
        try:
            return json.loads(fixed)
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
    return action.model_dump(exclude_none=True)


def _compact_validation_error(e: ValidationError) -> str:
    parts = []
    for err in e.errors()[:5]:
        loc = ".".join(str(piece) for piece in err["loc"])
        parts.append(f"{loc}: {err['msg']}")
    return "；".join(parts) or str(e)
