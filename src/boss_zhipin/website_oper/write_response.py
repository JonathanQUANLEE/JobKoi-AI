"""单个岗位的主循环：抓 JD → 本地规则筛选 → 发送固定招呼语（或 dry-run）。

调用图：

.. code-block:: text

    main.py
      └─ send_job_descriptions_to_chat
           ├─ finding_jobs.open_browser_with_options / log_in
           ├─ finding_jobs.select_dropdown_option (一次)
           └─ while True:
                ├─ finding_jobs.get_job_by_index
                ├─ validate_letter / log_attempt
                └─ finding_jobs.{click_by_xpath,wait_for_css,send_chat_message,navigate_back}

终止条件：
- 连续 ``MAX_CONSECUTIVE_MISSES`` 次拿不到 JD（推测到列表底部）
- 任何 exception 命中外层 try
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import os
import random
import re
from pathlib import Path
from typing import Literal

from boss_zhipin.audit import log_attempt, validate_letter
from boss_zhipin.config.filter_rules import (
    JobPosting as FilterJobPosting,
    explain_posting_match,
    match_posting,
)
from boss_zhipin.gui.events import emit as _emit_progress
from boss_zhipin.website_oper import finding_jobs

log = logging.getLogger(__name__)

SCAN_MATCH_LOG_PATH = Path(
    os.getenv("SCAN_MATCH_LOG_PATH", "./logs/scan_matches.jsonl")
)


def _review_before_send_enabled() -> bool:
    return os.getenv("BOSS_REVIEW_BEFORE_SEND", "").lower() in ("1", "true", "yes")


def _gui_review_enabled() -> bool:
    return os.getenv("BOSS_GUI_REVIEW", "").lower() in ("1", "true", "yes")


def _auto_send_fixed_greeting_enabled() -> bool:
    return os.getenv("BOSS_AUTO_SEND_FIXED_GREETING", "").lower() in (
        "1",
        "true",
        "yes",
    )


def _fixed_greeting() -> str:
    return os.getenv("BOSS_FIXED_GREETING", "").strip()


def _profile_filters() -> dict:
    raw = os.getenv("BOSS_PROFILE_FILTERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log.warning(
            "BOSS_PROFILE_FILTERS_JSON 不是合法 JSON，本地 profile 规则将被忽略: %s", e
        )
        return {}
    if not isinstance(data, dict):
        log.warning("BOSS_PROFILE_FILTERS_JSON 顶层不是对象，本地 profile 规则将被忽略")
        return {}
    return data


def _boss_active_values(page_filters: dict) -> list[str]:
    """读取页面筛选里配置的 BOSS 活跃状态，用作本地 OR 规则。"""
    boss_active = page_filters.get("boss_active") if isinstance(page_filters, dict) else {}
    if not isinstance(boss_active, dict) or not bool(boss_active.get("enabled", True)):
        return []
    return [
        str(item).strip()
        for item in boss_active.get("values") or []
        if str(item).strip()
    ]


def _boss_active_filter_enabled(page_filters: dict) -> bool:
    """判断用户是否启用了 BOSS 活跃状态本地筛选。"""
    return bool(_boss_active_values(page_filters))


def _page_filters_for_click(page_filters: dict) -> dict:
    """页面控件层筛选配置。

    BOSS 网页端的 BOSS 活跃状态筛选是单选控件，多值连续点击会互相覆盖。
    因此活跃状态不再交给页面点击，改由本地岗位卡片/详情文本匹配兜底。
    """
    if not isinstance(page_filters, dict) or "boss_active" not in page_filters:
        return page_filters
    filtered = dict(page_filters)
    boss_active = filtered.get("boss_active")
    if isinstance(boss_active, dict):
        filtered["boss_active"] = {**boss_active, "enabled": False}
    return filtered


def _merge_boss_active_filter(profile_filters: dict, page_filters: dict) -> dict:
    """把页面配置的 BOSS 活跃状态同步成本地 OR 规则。"""
    values = _boss_active_values(page_filters)
    if not values:
        return profile_filters
    merged = dict(profile_filters or {})
    merged["boss_active"] = {
        "any": {
            "enabled": True,
            "scope": "boss",
            "match": "contains",
            "case_sensitive": False,
            "keywords": values,
        }
    }
    return merged


def _filter_rules_without_boss_active(profile_filters: dict) -> dict:
    """移除 BOSS 活跃状态规则，用于状态缺失时避免误杀岗位。"""
    if "boss_active" not in (profile_filters or {}):
        return profile_filters
    return {
        key: value
        for key, value in (profile_filters or {}).items()
        if key != "boss_active"
    }


def _should_select_label(label: str, url: str, use_current_page: bool) -> bool:
    """判断是否需要在 BOSS 推荐页里切换岗位标签。"""
    if not label:
        return False
    if use_current_page:
        return False
    if (url or "").strip() and (url or "").strip() != finding_jobs.RECOMMEND_URL:
        return False
    return True


def _page_filters() -> dict:
    raw = os.getenv("BOSS_PAGE_FILTERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log.warning("BOSS_PAGE_FILTERS_JSON 不是合法 JSON，页面筛选将被忽略: %s", e)
        return {}
    if not isinstance(data, dict):
        log.warning("BOSS_PAGE_FILTERS_JSON 顶层不是对象，页面筛选将被忽略")
        return {}
    return data


def _to_filter_posting(
    job: finding_jobs.JobPosting, description: str
) -> FilterJobPosting:
    """把浏览器层岗位对象转成配置 matcher 使用的结构。

    当前浏览器层只稳定提供标题和 JD；其他字段先留空，后续扩展 DOM 提取时再补。
    """
    return FilterJobPosting(
        title=job.title,
        description=description,
        company=job.company,
        location=job.location,
        salary=job.salary,
        tags=job.tags or [],
        boss_name=job.boss_name,
        boss_active_status=job.boss_active_status
        or finding_jobs.extract_boss_active_status(description),
        education=job.education,
        detail_url=job.detail_url,
    )


def _csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _scan_only_enabled() -> bool:
    return os.getenv("BOSS_SCAN_ONLY", "").lower() in ("1", "true", "yes")


def _profile_name() -> str:
    return os.getenv("BOSS_PROFILE_NAME", "").strip() or "env"


def _state_path(env_name: str) -> Path | None:
    raw = os.getenv(env_name, "").strip()
    return Path(raw) if raw else None


def _read_seen_job_keys(path: Path | None) -> set[str]:
    if path is None or not path.exists():
        return set()
    keys: set[str] = set()
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                log.warning("seen_jobs 文件有损坏行，已跳过：%s", line[:120])
                continue
            key = str(data.get("job_key") or data.get("key") or "").strip()
            if key:
                # 历史记录统一规范化（剥查询参数），保证新旧格式互相命中。
                keys.add(finding_jobs.normalize_job_key(key))
    return keys


def _normalize_company(name: str) -> str:
    """公司名规范化，用于"同一家公司只打一次招呼"。

    去掉所有空白、大小写归一，并剥掉常见法律后缀，避免
    "阿里巴巴集团" 和 "阿里巴巴（中国）有限公司" 被当成两家公司。
    """
    s = re.sub(r"[\s\u3000]+", "", str(name or "")).lower()
    # 先去掉括号及其内容：阿里巴巴（中国）有限公司 -> 阿里巴巴有限公司
    s = re.sub(r"[\(（\[][^)）\]]*[\)）\]]", "", s)
    for suffix in (
        "股份有限公司",
        "有限责任公司",
        "有限公司",
        "集团公司",
        "公司",
        "集团",
    ):
        if s.endswith(suffix) and len(s) > len(suffix):
            s = s[: -len(suffix)]
            break
    return s


def _read_contacted_companies(path: Path | None) -> set[str]:
    """读 sent 日志里已经联系过的公司名集合。

    用户要求：一家公司点过一次就记下来，以后这家公司的岗位全部跳过，
    免得天天只盯着同一家刷、其它公司反而投不到。
    """
    if path is None or not path.exists():
        return set()
    companies: set[str] = set()
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not data.get("sent"):
                continue
            job = data.get("job") or {}
            name = _normalize_company(job.get("company") or "")
            if name:
                companies.add(name)
    return companies


def _append_jsonl(path: Path | None, record: dict) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _job_payload(job: finding_jobs.JobPosting) -> dict:
    return {
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "salary": job.salary,
        "tags": job.tags or [],
        "boss_name": job.boss_name,
        "boss_active_status": job.boss_active_status,
        "education": job.education,
        "detail_url": job.detail_url,
    }


def _job_with_derived_fields(
    job: finding_jobs.JobPosting, description: str
) -> finding_jobs.JobPosting:
    """补齐岗位卡片偶尔没解析到的字段。"""
    boss_active_status = job.boss_active_status or finding_jobs.extract_boss_active_status(
        description
    )
    if boss_active_status == job.boss_active_status:
        return job
    return finding_jobs.JobPosting(
        title=job.title,
        description=job.description,
        company=job.company,
        location=job.location,
        salary=job.salary,
        tags=job.tags or [],
        boss_name=job.boss_name,
        boss_active_status=boss_active_status,
        education=job.education,
        detail_url=job.detail_url,
    )


def _has_stable_job_identity(job: finding_jobs.JobPosting) -> bool:
    """判断岗位是否有可跨滚动窗口复用的稳定身份字段。"""
    return any(
        str(value or "").strip()
        for value in (job.detail_url, job.title, job.company, job.location, job.boss_name)
    )


def _state_record(
    *,
    job: finding_jobs.JobPosting,
    job_key: str,
    send_mode: str,
    status: str,
    details: dict | None = None,
    reason: str = "",
    dry_run: bool = False,
    sent: bool = False,
) -> dict:
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "ts_local": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "profile": _profile_name(),
        "job_key": job_key,
        "job": _job_payload(job),
        "match": details or {},
        "reason": reason,
        "send_mode": send_mode,
        "status": status,
        "dry_run": dry_run,
        "sent": sent,
    }


def _log_seen(
    path: Path | None, *, job: finding_jobs.JobPosting, job_key: str, send_mode: str
) -> None:
    _append_jsonl(
        path,
        _state_record(job=job, job_key=job_key, send_mode=send_mode, status="seen"),
    )


def _log_skipped(
    path: Path | None,
    *,
    job: finding_jobs.JobPosting,
    job_key: str,
    send_mode: str,
    reason: str,
    details: dict | None = None,
) -> None:
    _append_jsonl(
        path,
        _state_record(
            job=job,
            job_key=job_key,
            send_mode=send_mode,
            status="skipped",
            details=details,
            reason=reason,
        ),
    )


def _log_sent(
    path: Path | None,
    *,
    job: finding_jobs.JobPosting,
    job_key: str,
    send_mode: str,
    status: str,
    details: dict | None = None,
    dry_run: bool = False,
    sent: bool = False,
) -> None:
    record = _state_record(
        job=job,
        job_key=job_key,
        send_mode=send_mode,
        status=status,
        details=details,
        dry_run=dry_run,
        sent=sent,
    )
    record["match_explanation"] = _match_explanation(details)
    _append_jsonl(path, record)


def _match_explanation(details: dict | None) -> str:
    """从本地规则详情中提取适合展示给 GUI 用户的通过原因。"""
    if not details:
        return ""
    explanation = details.get("explanation") or details.get("reason") or ""
    note = details.get("boss_active_note")
    if note:
        return "；".join([str(explanation), str(note)])
    return str(explanation)


def _send_mode_name(
    *, scan_only: bool, review_before_send: bool, auto_send_fixed_greeting: bool
) -> str:
    if scan_only:
        return "scan"
    if review_before_send:
        return "review"
    if auto_send_fixed_greeting:
        return "auto"
    return "unset"


def _scan_max_jobs() -> int:
    return _int_env("BOSS_SCAN_MAX_JOBS", 50, minimum=1)


def _auto_send_max_sent() -> int:
    return _int_env("BOSS_AUTO_SEND_MAX_SENT", 50, minimum=1)


def _auto_send_daily_limit() -> int | None:
    raw = os.getenv("BOSS_AUTO_SEND_DAILY_LIMIT", "").strip()
    if not raw:
        return None
    return _int_env("BOSS_AUTO_SEND_DAILY_LIMIT", 80, minimum=1)


def _stop_on_captcha_enabled() -> bool:
    raw = os.getenv("BOSS_STOP_ON_CAPTCHA", "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _sent_today_count(path: Path | None, *, profile: str) -> int:
    if path is None or not path.exists():
        return 0
    # 每日限额按用户本机自然日计算，避免北京时间凌晨被 UTC 日期错分到前一天。
    today = datetime.now().date()
    count = 0
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if profile and str(record.get("profile") or "") not in ("", profile):
                continue
            if not bool(record.get("sent")):
                continue
            # 用本机时间戳（ts_local）算自然日；UTC 的 ts 在北京时间 0-8 点会
            # 把今天凌晨的发送错分到昨天，导致每日限额失效（实测踩坑）。
            ts_local = str(record.get("ts_local") or "").strip()
            try:
                if ts_local:
                    ts_date = datetime.fromisoformat(ts_local).date()
                else:
                    ts_date = datetime.fromisoformat(
                        str(record.get("ts", "")).replace("Z", "+00:00")
                    ).astimezone().date()
            except ValueError:
                continue
            if ts_date == today:
                count += 1
    return count


def _int_env(name: str, default: int, minimum: int | None = None) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        log.warning("%s=%r 不是整数，回退默认 %d", name, raw, default)
        return default
    if minimum is not None:
        return max(minimum, value)
    return value


def _float_env(name: str, default: float, minimum: float | None = None) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        log.warning("%s=%r 不是数字，回退默认 %.1f", name, raw, default)
        return default
    if minimum is not None:
        return max(minimum, value)
    return value


def _auto_send_delay_range() -> tuple[float, float]:
    min_delay = _float_env("BOSS_AUTO_SEND_DELAY_MIN", 10.0, minimum=0.0)
    max_delay = _float_env("BOSS_AUTO_SEND_DELAY_MAX", 60.0, minimum=0.0)
    if max_delay < min_delay:
        log.warning(
            "BOSS_AUTO_SEND_DELAY_MAX=%.1f 小于 MIN=%.1f，已交换两者",
            max_delay,
            min_delay,
        )
        return max_delay, min_delay
    return min_delay, max_delay


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
    import json
    from datetime import datetime, timezone

    SCAN_MATCH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "index": index,
        "details": details,
        "job_description": job_description,
    }
    with SCAN_MATCH_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


async def _ask_review_decision(
    *,
    index: int,
    job_description: str,
    details: dict,
    greeting: str,
) -> str:
    print("\n" + "=" * 80)
    print(f"岗位 #{index}")
    print("- 匹配信息:")
    if details.get("matched_keywords") is not None:
        print(f"  命中关键词: {details.get('matched_keywords')}")
    if details.get("score") is not None:
        print(f"  匹配评分: {details.get('score')}/{details.get('threshold')}")
    if details.get("reason"):
        print(f"  理由: {details.get('reason')}")
    print("- 岗位详情:")
    print(job_description)
    print("- 将发送的固定招呼语:")
    print(greeting)
    print("=" * 80)

    while True:
        choice = await asyncio.to_thread(
            input,
            "发送这一条？输入 y 发送 / n 跳过 / q 退出：",
        )
        choice = choice.strip().lower()
        if choice in {"y", "yes"}:
            return "send"
        if choice in {"n", "no", ""}:
            return "skip"
        if choice in {"q", "quit", "exit"}:
            return "quit"
        print("只接受 y / n / q")


async def _ask_gui_review_decision(
    *,
    index: int,
    job: finding_jobs.JobPosting,
    job_description: str,
    details: dict,
    greeting: str,
) -> str:
    from boss_zhipin.gui import review_control

    payload = {
        "index": index,
        "job": _job_payload(job),
        "job_description": job_description,
        "details": details,
        "greeting": greeting,
    }
    _emit_progress("review_requested", **payload)
    decision = await review_control.request_review(payload)
    _emit_progress("review_cleared", index=index, decision=decision)
    return decision


# ---------- 搜索结果 API 直读流程（BOSS 搜索页 DOM 无翻页入口的兜底） ----------


def _use_search_api_flow(url: str) -> bool:
    """起始页是岗位搜索页时走 API 直读，绕过 DOM 虚拟列表。

    实测搜索页 DOM 只懒加载 ~30 张卡、无翻页按钮、URL page 参数被无视；
    登录态下 wapi 搜索接口翻页正常。推荐流（job-recommend）没有搜索 API，
    仍走 DOM 循环（自带滚动/刷新逻辑）。
    """
    return "/web/geek/jobs" in (url or "")


async def _open_job_detail_page(url: str, timeout: float = 30) -> bool:
    tab = finding_jobs.get_tab()
    if tab is None or not url:
        return False
    try:
        await asyncio.wait_for(tab.get(url), timeout=timeout)
    except Exception as e:
        log.warning("打开详情页失败 %s: %s", url, e)
        return False
    await asyncio.sleep(2)
    return True


_DETAIL_JD_SELECTORS = (
    ".job-sec-text",
    ".job-detail-section .job-sec-text",
    ".detail-content",
)


async def _extract_detail_jd() -> str:
    """抓详情页职位描述；取不到返回空串（退化为只按标题筛选）。"""
    best = ""
    for selector in _DETAIL_JD_SELECTORS:
        try:
            text = await finding_jobs.get_text_by_css(selector, timeout=3)
        except Exception:
            text = None
        if text and len(text.strip()) > len(best):
            best = text.strip()
        if len(best) >= 100:
            break
    return best


async def _send_greeting_on_detail_page(greeting: str) -> str:
    """在详情页点击“立即沟通”。返回状态：

    用户明确要求：只点“立即沟通”就进入下一个，**不发送任何招呼语、不发简历**，
    等对方回复后由本人自行沟通。因此这里点到即算完成，不再进入聊天输入框。

    - ``sent``：已点击“立即沟通”（没有发送任何内容）
    - ``already_contacted``：按钮是“继续沟通/继续聊天”，此前已沟通过，绝不重复打扰
    - ``no_button``：页面上没有沟通按钮

    详情页按钮是 ``a.btn-startchat``（诊断实测：ka=go_chat_done_* /
    ceiling_job_detail_gochat），跟搜索面板的 ``op-btn-chat`` 不是一套类名。
    """
    # 点击前最后一道防线：本地去重即使漏了，BOSS 按钮变“继续沟通”也能拦住。
    button_text = (
        await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        return "already_contacted"
    contact_xpath = "//a[contains(@class, 'btn-startchat')]"
    if not await finding_jobs.click_by_xpath(contact_xpath, timeout=10):
        return "no_button"
    # 用户明确要求：只点“立即沟通”就进入下一个，不发送任何招呼语，也不发简历，
    # 等对方回复后再由本人自己沟通。
    # 另外 send_chat_message / click_send_resume 内部各有一道闸（BOSS_CLICK_ONLY /
    # BOSS_SEND_RESUME_AFTER_GREETING），即使别的代码路径调到它们也不会真的发出去。
    await finding_jobs.click_stay_on_page_if_present(timeout=3)
    await finding_jobs.dismiss_greeting_dialog(timeout=3)
    # F2（opt-in，默认关）：打招呼后自动点“发简历”。开关由 profile 的
    # send.send_resume_after_greeting 桥接，用户在 GUI 勾选才生效。
    if finding_jobs.send_resume_after_greeting_enabled():
        await finding_jobs.click_send_resume(timeout=5)
    return "sent"


async def _run_search_api_flow(
    *,
    usr_name: str,
    url: str,
    dry_run: bool,
    scan_only: bool,
    greeting: str,
) -> None:
    """API 直读搜索结果：按页枚举 → 逐个开详情页 → 本地筛选 → 发送。

    每页都是登录态页面上下文里的 wapi 请求；详情页复用 DOM 流的立即沟通/
    留在此页/发简历原语。筛选、去重、限额、日志与 DOM 流同一套。
    """
    from boss_zhipin.website_oper import job_api

    if not scan_only:
        validation = validate_letter(greeting)
        if not validation.ok:
            raise RuntimeError("固定招呼语未通过发送校验: " + ", ".join(validation.reasons))

    seen_jobs_path = _state_path("BOSS_SEEN_JOBS_FILE")
    sent_log_path = _state_path("BOSS_SENT_LOG_FILE")
    skipped_log_path = _state_path("BOSS_SKIPPED_LOG_FILE")
    filters = _profile_filters()
    stop_on_captcha = _stop_on_captcha_enabled()
    delay_min, delay_max = _auto_send_delay_range()
    max_sent = _auto_send_max_sent()
    daily_limit = _auto_send_daily_limit()
    sent_count = 0
    daily_sent_count = _sent_today_count(sent_log_path, profile=_profile_name())
    seen_job_keys: set[str] = _read_seen_job_keys(seen_jobs_path)
    contacted_companies: set[str] = _read_contacted_companies(sent_log_path)
    if contacted_companies:
        log.info(
            "已联系过的公司 %d 家，这些公司的岗位将全部跳过", len(contacted_companies)
        )
    query = job_api.search_query_from_url(url)
    tab = finding_jobs.get_tab()
    if tab is None:
        raise RuntimeError("受控 tab 不存在，无法执行 API 直读流程")

    _emit_progress(
        "api_flow_started",
        usr_name=usr_name,
        daily_sent=daily_sent_count,
        dry_run=dry_run,
        scan=scan_only,
    )
    log.info(
        "[api-flow] 启动：dry_run=%s scan=%s 今日已发 %d 条", dry_run, scan_only,
        daily_sent_count,
    )

    page = 1
    while page <= 100:
        if max_sent is not None and sent_count >= max_sent:
            log.info("本轮已发送 %d 条，达到单次上限，结束", sent_count)
            break
        if daily_limit is not None and daily_sent_count >= daily_limit:
            log.info("今日已发送 %d 条，达到每日上限，结束", daily_sent_count)
            break
        try:
            api_jobs = await job_api.fetch_search_page(tab, query, page)
        except RuntimeError as e:
            log.warning("第 %d 页搜索接口失败，结束：%s", page, e)
            _emit_progress("api_flow_error", page=page, message=str(e))
            break
        if not api_jobs:
            log.info("第 %d 页没有岗位，搜索结果已全部取完，结束", page)
            break
        for api_job in api_jobs:
            if max_sent is not None and sent_count >= max_sent:
                break
            if daily_limit is not None and daily_sent_count >= daily_limit:
                break
            job = job_api.to_job_posting(api_job)
            dedupe_key = finding_jobs.job_key(job)
            if dedupe_key in seen_job_keys:
                continue
            seen_job_keys.add(dedupe_key)
            _log_seen(seen_jobs_path, job=job, job_key=dedupe_key, send_mode="auto")

            # 公司级去重：这家公司已经点过"立即沟通"，全部岗位跳过，
            # 把名额让给还没联系过的公司。
            company_key = _normalize_company(job.company)
            if company_key and company_key in contacted_companies:
                _log_skipped(
                    skipped_log_path,
                    job=job,
                    job_key=dedupe_key,
                    send_mode="auto",
                    reason="company_already_contacted",
                    details={
                        "stage": "company_dedupe",
                        "company": job.company,
                        "job_title": job.title,
                    },
                )
                _emit_progress(
                    "job_skipped",
                    title=job.title,
                    reason="company_already_contacted",
                    detail=job.company,
                )
                continue

            if not await _open_job_detail_page(job.detail_url):
                _log_skipped(
                    skipped_log_path,
                    job=job,
                    job_key=dedupe_key,
                    send_mode="auto",
                    reason="detail_open_failed",
                    details={"stage": "detail_page", "job_title": job.title},
                )
                continue
            if stop_on_captcha and await finding_jobs.captcha_visible():
                log.warning("详情页检测到验证码/安全验证，按 BOSS_STOP_ON_CAPTCHA 停止")
                _emit_progress("captcha_stopped", title=job.title)
                return
            jd_text = await asyncio.wait_for(_extract_detail_jd(), timeout=20)
            if not jd_text:
                log.info("详情页 JD 未取到，按标题筛选：%s", job.title)
            job = _job_with_derived_fields(
                job_api.to_job_posting(api_job, description=jd_text), jd_text
            )
            filter_posting = _to_filter_posting(job, jd_text)
            match = match_posting(filter_posting, filters)
            if not match.matched:
                _log_skipped(
                    skipped_log_path,
                    job=job,
                    job_key=dedupe_key,
                    send_mode="auto",
                    reason="filtered_out",
                    details={
                        "stage": "profile_filter",
                        "reason": match.reason,
                        "job_title": job.title,
                    },
                )
                _emit_progress(
                    "job_skipped", title=job.title, reason="filtered_out",
                    detail=match.reason,
                )
                continue
            button_text = (
                await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
            ).strip()
            if "继续沟通" in button_text or "继续聊天" in button_text:
                _log_skipped(
                    skipped_log_path,
                    job=job,
                    job_key=dedupe_key,
                    send_mode="auto",
                    reason="already_contacted",
                    details={
                        "stage": "contact_status",
                        "button_text": button_text,
                        "job_title": job.title,
                    },
                )
                continue
            if scan_only or dry_run:
                _log_sent(
                    sent_log_path,
                    job=job,
                    job_key=dedupe_key,
                    send_mode="auto",
                    status="dry_run",
                    details={"stage": "api_flow", "job_title": job.title},
                    dry_run=True,
                    sent=False,
                )
                sent_count += 1
                log.info("[DRY-RUN] 命中 %s（%s），不真实发送", job.title, job.company)
                continue
            try:
                # nodriver 的 send_keys/select 在元素失效时会无限等待，包一层
                # 硬超时兜底；超时后下一个岗位会重新导航，状态自愈。
                status = await asyncio.wait_for(
                    _send_greeting_on_detail_page(greeting), timeout=120
                )
            except asyncio.TimeoutError:
                log.warning("发送超时（120s），跳过：%s", job.title)
                status = "failed"
            except Exception as e:
                log.warning("发送异常（%s）：%s", job.title, e)
                status = "failed"
            if status == "sent":
                sent_count += 1
                daily_sent_count += 1
                # 记下这家公司，后面它家的岗位一律跳过。
                if company_key:
                    contacted_companies.add(company_key)
                _log_sent(
                    sent_log_path,
                    job=job,
                    job_key=dedupe_key,
                    send_mode="auto",
                    status="sent",
                    details={"stage": "api_flow", "job_title": job.title},
                    dry_run=False,
                    sent=True,
                )
                _emit_progress(
                    "job_sent", title=job.title, company=job.company, sent=sent_count,
                )
                log.info(
                    "✅ [api-flow] 已发送 #%d：%s（%s）", sent_count, job.title,
                    job.company,
                )
            else:
                reason = "already_contacted" if status == "already_contacted" else "send_failed"
                _log_skipped(
                    skipped_log_path,
                    job=job,
                    job_key=dedupe_key,
                    send_mode="auto",
                    reason=reason,
                    details={"stage": "send", "button_state": status,
                             "job_title": job.title},
                )
                if status == "already_contacted":
                    log.info("⏭️ [api-flow] 该岗位此前已沟通过，跳过：%s", job.title)
            await asyncio.sleep(random.uniform(delay_min, delay_max))
        log.info(
            "[api-flow] 第 %d 页处理完成（本页 %d 个岗位），本轮累计发送 %d",
            page,
            len(api_jobs),
            sent_count,
        )
        page += 1
    _emit_progress("api_flow_finished", total=sent_count, page=page)
    log.info("[api-flow] 结束：本轮发送 %d 条，翻到第 %d 页", sent_count, page)


async def send_response_and_go_back(response: str) -> None:
    """在 BOSS 沟通页发送 ``response`` 然后退回到列表。"""
    await finding_jobs.send_chat_message(response)
    await finding_jobs.click_send_resume(timeout=5)
    await asyncio.sleep(10)
    if not await finding_jobs.return_to_job_list():
        raise RuntimeError("发送后未能返回岗位列表")


async def click_contact_and_send_response(response: str) -> None:
    """点击“立即沟通”，并兼容 BOSS 直接发送招呼语后的确认弹窗。

    当前 BOSS 网页可能在点击“立即沟通”后直接发送预设招呼语，并弹出
    “已向BOSS发送消息 / 留在此页 / 继续沟通”。这种情况下点击“留在此页”
    后就已经完成发送，不需要再找聊天输入框。
    """
    contact_xpath = "//a[contains(@class, 'op-btn-chat')]"
    if not await finding_jobs.click_by_xpath(contact_xpath, timeout=10):
        raise RuntimeError("立即沟通按钮未找到")

    if await finding_jobs.click_stay_on_page_if_present():
        log.info("BOSS 已确认发送招呼语，并已留在岗位页")
        return

    # BOSS 2026-08 改版后需要先点击“继续沟通”才能进入聊天页。
    await finding_jobs.dismiss_greeting_dialog(timeout=5)

    if not await finding_jobs.wait_for_css("#chat-input", timeout=50):
        raise RuntimeError("chat input (#chat-input) 未找到")
    await send_response_and_go_back(response)


async def _compose_greeting(job_description: str, fixed_greeting: str) -> tuple[str, str]:
    """F5：review 模式下组合招呼语。返回 ``(greeting, source)``。

    ``BOSS_AI_GREETING=1``（profile send.ai_greeting，默认关）时按 JD 让
    LLM 生成一条，**先过 validate_letter**；任何失败（未配置/超时/校验不过）
    都降级固定招呼语——review 流程永不因 AI 挂掉而中断。
    auto 模式不调用本函数：AI 生成必须逐条预览确认（已拍板）。
    """
    enabled = os.getenv("BOSS_AI_GREETING", "0").strip().lower() in ("1", "true", "yes")
    if enabled:
        from boss_zhipin.agent import greeting_generator

        try:
            result = await greeting_generator.generate_greeting(
                job_description, fixed_greeting
            )
        except Exception as e:  # noqa: BLE001 — AI 任何意外都降级，不挡主流程
            log.warning("AI 招呼语生成异常，降级固定招呼语: %s", e)
            result = {"status": "error", "message": str(e)}
        if result.get("status") == "ok":
            return str(result["greeting"]), "ai"
        log.warning(
            "AI 招呼语不可用，降级固定招呼语: %s", result.get("message", "未知原因")
        )
    return fixed_greeting, "fixed"


async def send_job_descriptions_to_chat(
    usr_name: str,
    url: str,
    browser_type: str,
    label: str,
    dry_run: bool = False,
    use_current_page: bool = False,
) -> None:
    """主循环（async）。

    ``label`` 为空字符串时跳过下拉筛选，沿用 BOSS 默认推荐 feed。

    ``dry_run=True`` 时不点"立即沟通"，但固定招呼语仍会校验和写日志，
    用来测试筛选与发送流程。

    整段必须包在 ``uc.loop().run_until_complete(...)`` 里一次性跑完，
    不能拆成多个 ``run_until_complete`` —— nodriver CDP 在事件循环停顿期间
    会进入半死状态，下次 evaluate 直接 hang。详见模块 docstring。
    """
    scan_only = _scan_only_enabled()
    page_filters = _page_filters()
    profile_filters = _merge_boss_active_filter(_profile_filters(), page_filters)
    boss_active_filter_enabled = _boss_active_filter_enabled(page_filters)
    scan_groups = _scan_groups() if scan_only else []
    scan_max_jobs = _scan_max_jobs() if scan_only else None
    scan_required_terms = _scan_required_terms() if scan_only else []
    auto_send_fixed_greeting = _auto_send_fixed_greeting_enabled()
    auto_send_max_sent = _auto_send_max_sent() if auto_send_fixed_greeting else None
    auto_send_daily_limit = (
        _auto_send_daily_limit() if auto_send_fixed_greeting else None
    )
    auto_send_delay_min, auto_send_delay_max = (
        _auto_send_delay_range() if auto_send_fixed_greeting else (0.0, 0.0)
    )
    review_before_send = _review_before_send_enabled()
    gui_review = _gui_review_enabled()
    send_mode = _send_mode_name(
        scan_only=scan_only,
        review_before_send=review_before_send,
        auto_send_fixed_greeting=auto_send_fixed_greeting,
    )
    if send_mode == "unset":
        raise RuntimeError("必须选择运行模式：scan、review 或 auto")
    seen_jobs_path = _state_path("BOSS_SEEN_JOBS_FILE")
    sent_log_path = _state_path("BOSS_SENT_LOG_FILE")
    skipped_log_path = _state_path("BOSS_SKIPPED_LOG_FILE")
    stop_on_captcha = _stop_on_captcha_enabled()
    fixed_greeting = (
        _fixed_greeting() if (review_before_send or auto_send_fixed_greeting) else ""
    )
    review_required_terms = _review_required_terms() if review_before_send else []
    review_locations = _review_locations() if review_before_send else []
    if (review_before_send or auto_send_fixed_greeting) and not fixed_greeting:
        raise RuntimeError("固定招呼语模式必须设置 BOSS_FIXED_GREETING")

    if use_current_page:
        await finding_jobs.ensure_current_tab()
    else:
        await finding_jobs.open_browser_with_options(url, browser_type)
    actual_url = finding_jobs.get_current_url()
    _emit_progress("browser_started")
    _emit_progress(
        "page_opened",
        requested_url=url,
        actual_url=actual_url,
        redirected=bool(url and actual_url and url != actual_url),
    )
    await finding_jobs.log_in()
    _emit_progress("login_ok")
    # 起始页是岗位搜索页（/web/geek/jobs）时走 API 直读：DOM 虚拟列表没有
    # 翻页入口（实测滚动/按钮/URL 参数三路都不通），wapi 翻页是唯一全量通道。
    # review 模式需要逐条人工确认，仍走 DOM 循环；tab 缺失时回退 DOM 流程。
    if (
        _use_search_api_flow(actual_url)
        and not review_before_send
        and finding_jobs.get_tab() is not None
    ):
        await _run_search_api_flow(
            usr_name=usr_name,
            url=actual_url,
            dry_run=dry_run,
            scan_only=scan_only,
            greeting=fixed_greeting,
        )
        return
    if use_current_page:
        _emit_progress(
            "page_filter",
            group="manual",
            value="current_page",
            status="skipped",
            message="已使用当前 BOSS 页面，跳过自动页面筛选，保留你在网页端手动选择的条件。",
        )
        log.info("使用当前 BOSS 页面运行，跳过自动页面筛选点击")
    else:
        await finding_jobs.apply_page_filters(
            _page_filters_for_click(page_filters),
            emit_event=lambda payload: _emit_progress("page_filter", **payload),
        )
    if stop_on_captcha and await finding_jobs.captcha_visible():
        raise RuntimeError("检测到验证码/安全验证，已按 BOSS_STOP_ON_CAPTCHA 停止")

    start_job_index = (
        await finding_jobs.get_selected_job_index() if use_current_page else 1
    )
    job_index = start_job_index
    window_index = start_job_index
    if use_current_page:
        _emit_progress(
            "page_filter",
            group="manual",
            value=f"job_{start_job_index}",
            status="applied",
            message=f"从当前选中的第 {start_job_index} 个岗位开始处理。",
        )
        log.info("使用当前页面，从第 %d 个岗位开始运行", start_job_index)
    iteration = 0
    consecutive_misses = 0
    consecutive_duplicates = 0
    # 推荐 feed 末尾、或者某条岗位卡 DOM 没渲染好，都会让 get_job_description
    # 返回 None。连续 N 次拿不到就当列表到底了停掉，否则 job_index 会无限涨。
    MAX_CONSECUTIVE_MISSES = 5
    MAX_CONSECUTIVE_DUPLICATES = 20
    # 列表真到底（滚动/翻页都拉不到新岗位）时，整页刷新推荐流再试的次数。
    # 只要期间出现过任何新岗位就重新计数，防止在干涸的 feed 上无限刷。
    MAX_FEED_RELOADS = 3
    barren_reloads = 0
    sent_count = 0
    daily_sent_count = _sent_today_count(sent_log_path, profile=_profile_name())
    seen_job_keys: set[str] = _read_seen_job_keys(seen_jobs_path)
    if _should_select_label(label, url, use_current_page):
        await finding_jobs.select_dropdown_option(label)
    elif label:
        log.info(
            "检测到当前页/起始 URL 已指定，跳过岗位标签选择：%r，避免覆盖手动筛选页面",
            label,
        )

    def advance_position() -> None:
        nonlocal job_index, window_index
        job_index += 1
        window_index += 1

    def advance_window() -> None:
        nonlocal window_index
        window_index += 1

    async def reload_feed_and_restart() -> bool:
        """列表到底后整页刷新推荐流或轮换下一批意向城市。返回是否刷新成功。"""
        nonlocal window_index, consecutive_misses, consecutive_duplicates
        nonlocal barren_reloads
        # 若用户配置了超过 4 个意向城市，列表到底后优先轮流替换为下一批城市
        rotated = await finding_jobs.rotate_next_city_batch(
            _page_filters_for_click(page_filters),
            emit_event=lambda payload: _emit_progress("page_filter", **payload),
        )
        if not rotated:
            reloaded = await finding_jobs.reload_current_page()
            if not reloaded:
                return False
        barren_reloads += 1
        window_index = 1
        consecutive_misses = 0
        consecutive_duplicates = 0
        await asyncio.sleep(3)
        return True

    while True:
        try:
            if auto_send_max_sent is not None and sent_count >= auto_send_max_sent:
                log.info(
                    "已发送 %d 条，达到 BOSS_AUTO_SEND_MAX_SENT 上限，结束", sent_count
                )
                _emit_progress("feed_exhausted", total=job_index - 1)
                break
            if (
                auto_send_daily_limit is not None
                and daily_sent_count >= auto_send_daily_limit
            ):
                log.info(
                    "今日已发送 %d 条，达到 BOSS_AUTO_SEND_DAILY_LIMIT 上限，结束",
                    daily_sent_count,
                )
                _emit_progress("feed_exhausted", total=job_index - 1)
                break
            if (
                scan_max_jobs is not None
                and job_index - start_job_index >= scan_max_jobs
            ):
                log.info("扫描达到 BOSS_SCAN_MAX_JOBS=%d，结束", scan_max_jobs)
                _emit_progress("feed_exhausted", total=job_index - 1)
                break
            iteration += 1
            log.info(
                "=== 第 %d 轮: 处理 job_index=%d window_index=%d ===",
                iteration,
                job_index,
                window_index,
            )
            job = await finding_jobs.get_job_by_index(window_index)
            job_title = job.title if job else ""
            job_description = job.description if job else None
            if job_description:
                job = _job_with_derived_fields(job, job_description)
                job_title = job.title
                consecutive_misses = 0
                dedupe_key = finding_jobs.job_key(job)
                if dedupe_key and dedupe_key in seen_job_keys:
                    consecutive_duplicates += 1
                    duplicate_detail = "本地历史记录中已处理过该岗位"
                    log.info(
                        "⏭️ [重复岗位跳过 #%d] %s：%s",
                        job_index,
                        duplicate_detail,
                        dedupe_key,
                    )
                    _log_skipped(
                        skipped_log_path,
                        job=job,
                        job_key=dedupe_key,
                        send_mode=send_mode,
                        reason="duplicate",
                        details={
                            "stage": "history",
                            "reason": duplicate_detail,
                        },
                    )
                    _emit_progress(
                        "job_skipped",
                        index=job_index,
                        reason="duplicate",
                        detail=duplicate_detail,
                        title=job_title,
                    )
                    if _has_stable_job_identity(job):
                        advance_window()
                    else:
                        advance_position()
                    if consecutive_duplicates >= MAX_CONSECUTIVE_DUPLICATES:
                        if await finding_jobs.navigate_next_search_page():
                            log.info("当前页全是已投过的岗位，已翻到下一页继续")
                            window_index = 1
                            consecutive_duplicates = 0
                            await asyncio.sleep(2)
                            continue
                        if barren_reloads < MAX_FEED_RELOADS:
                            log.info(
                                "连续 %d 个重复岗位，刷新推荐流换一批（第 %d/%d 次）",
                                MAX_CONSECUTIVE_DUPLICATES,
                                barren_reloads + 1,
                                MAX_FEED_RELOADS,
                            )
                            _emit_progress(
                                "feed_reload",
                                attempt=barren_reloads + 1,
                                limit=MAX_FEED_RELOADS,
                            )
                            if await reload_feed_and_restart():
                                continue
                        log.info(
                            "连续 %d 个重复岗位，刷新 %d 次仍无新岗位，结束",
                            MAX_CONSECUTIVE_DUPLICATES,
                            barren_reloads,
                        )
                        _emit_progress("feed_exhausted", total=job_index - 1)
                        break
                    await asyncio.sleep(3)
                    continue
                if dedupe_key:
                    seen_job_keys.add(dedupe_key)
                    _log_seen(
                        seen_jobs_path, job=job, job_key=dedupe_key, send_mode=send_mode
                    )
                    # 出现新岗位说明这批 feed 还有货，刷新次数重新计数。
                    barren_reloads = 0
                consecutive_duplicates = 0
                _emit_progress(
                    "job_found",
                    index=job_index,
                    title=job_title,
                    jd_preview=job_description[:80],
                )
                element = await finding_jobs.get_text_by_css(".op-btn.op-btn-chat")
                log.info("chat 按钮文字: %r", element)
                button_text = (element or "").strip()
                if button_text != "立即沟通":
                    already_contacted = "沟通" in button_text
                    skip_reason = (
                        "already_contacted" if already_contacted else "contact_unavailable"
                    )
                    detail = (
                        f"BOSS 显示“{button_text}”，该岗位此前已沟通"
                        if already_contacted
                        else f"未找到可用的“立即沟通”按钮（当前状态：{button_text or '未知'}）"
                    )
                    log.info("⏭️ [联系状态跳过 #%d] %s", job_index, detail)
                    _log_skipped(
                        skipped_log_path,
                        job=job,
                        job_key=dedupe_key,
                        send_mode=send_mode,
                        reason=skip_reason,
                        details={
                            "stage": "contact_status",
                            "reason": detail,
                            "button_text": button_text,
                        },
                    )
                    _emit_progress(
                        "job_skipped",
                        index=job_index,
                        reason=skip_reason,
                        detail=detail,
                        title=job_title,
                    )
                    advance_position()
                    await asyncio.sleep(3)
                    continue
                if element == "立即沟通":
                    # ====== 本地规则过滤 ======
                    if profile_filters:
                        filter_posting = _to_filter_posting(job, job_description)
                        effective_profile_filters = profile_filters
                        boss_active_missing = (
                            boss_active_filter_enabled
                            and not filter_posting.boss_active_status
                        )
                        if boss_active_missing:
                            effective_profile_filters = _filter_rules_without_boss_active(
                                profile_filters
                            )
                        profile_match = match_posting(
                            filter_posting,
                            effective_profile_filters,
                        )
                        match_explanation = explain_posting_match(
                            filter_posting,
                            effective_profile_filters,
                        )
                        apply = profile_match.matched
                        details = {
                            **match_explanation,
                            "stage": "profile_filter",
                            "reason": profile_match.reason,
                            "matched_keywords": profile_match.matched_keywords,
                            "missing_keywords": profile_match.missing_keywords,
                            "job_title": job_title,
                        }
                        if boss_active_missing:
                            details["boss_active_status"] = ""
                            details["boss_active_note"] = (
                                "页面未采集到 BOSS 活跃状态，已跳过活跃状态限制，只按岗位规则判断。"
                            )
                        if not apply:
                            log.info(
                                "⏭️ [profile 跳过 #%d] %s，标题=%r",
                                job_index,
                                profile_match.reason,
                                job_title,
                            )
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="profile_filter",
                                details=details,
                            )
                            _emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="profile_filter",
                                detail=profile_match.reason,
                                title=job_title,
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                    elif scan_only:
                        term_ok, term_reason = _matches_required_terms(
                            job_description, scan_required_terms
                        )
                        if not term_ok:
                            apply = False
                            reason = term_reason
                        else:
                            apply, reason = _matches_all_groups(
                                job_description, scan_groups
                            )
                        details = {"stage": "scan_only", "reason": reason}
                    elif auto_send_fixed_greeting:
                        apply, reason = _matches_auto_send_job(
                            title=job_title,
                            description=job_description,
                        )
                        details = {
                            "stage": "auto_send_fixed_greeting",
                            "reason": reason,
                            "matched_keywords": [],
                            "job_title": job_title,
                        }
                        if not apply:
                            log.info(
                                "⏭️ [自动发送跳过 #%d] %s，标题=%r",
                                job_index,
                                reason,
                                job_title,
                            )
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="auto_send_filter",
                                details=details,
                            )
                            _emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="auto_send_filter",
                                detail=reason,
                                title=job_title,
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                    elif review_before_send:
                        term_ok, term_reason = _matches_required_terms(
                            job_description, review_required_terms
                        )
                        if not term_ok:
                            log.info("⏭️ [跳过 #%d] %s", job_index, term_reason)
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="required_terms",
                                details={
                                    "stage": "required_terms",
                                    "reason": term_reason,
                                },
                            )
                            _emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="required_terms",
                                detail=term_reason,
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                        location_ok, location_reason = _matches_all_groups(
                            job_description, [review_locations]
                        )
                        if not location_ok:
                            log.info("⏭️ [跳过 #%d] %s", job_index, location_reason)
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="required_location",
                                details={
                                    "stage": "required_location",
                                    "reason": location_reason,
                                },
                            )
                            _emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="required_location",
                                detail=location_reason,
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                        apply = True
                        details = {
                            "stage": "review",
                            "reason": "命中审核模式本地条件",
                            "matched_keywords": [],
                            "job_title": job_title,
                        }
                    # ====== 过滤结束 ======

                    if scan_only:
                        if not apply:
                            log.info(
                                "⏭️ [扫描跳过 #%d] %s",
                                job_index,
                                details.get("reason", ""),
                            )
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="scan_only",
                                details=details,
                            )
                            _emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="scan_only",
                                detail=details.get("reason", ""),
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                        log.info(
                            "✅ [扫描命中 #%d] %s", job_index, details.get("reason", "")
                        )
                        _log_scan_match(
                            index=job_index,
                            job_description=job_description,
                            details=details,
                        )
                        _log_sent(
                            sent_log_path,
                            job=job,
                            job_key=dedupe_key,
                            send_mode=send_mode,
                            status="scan_only",
                            details=details,
                            dry_run=True,
                            sent=False,
                        )
                        _emit_progress(
                            "job_matched",
                            index=job_index,
                            status="scan_only",
                            detail=details.get("reason", ""),
                            jd_preview=job_description[:160],
                        )
                        advance_position()
                        await asyncio.sleep(3)
                        continue

                    match_score = None

                    if auto_send_fixed_greeting:
                        response = fixed_greeting
                        validation = validate_letter(response)
                        if not validation.ok:
                            log.warning(
                                "[BLOCKED] 固定招呼语未通过校验: %s — preview: %r",
                                validation.reasons,
                                response[:80],
                            )
                            log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=dry_run,
                                sent=False,
                            )
                            _emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="blocked",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=_match_explanation(details),
                                match_details=details,
                            )
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="validation",
                                details={"validation_reasons": validation.reasons},
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                        if dry_run:
                            log.info(
                                "[DRY-RUN][AUTO] 固定招呼语 (%d 字符) 不发送。--- letter ---\n%s\n--------------",
                                len(response),
                                response,
                            )
                            log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=True,
                                sent=False,
                            )
                            _emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="dry_run",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=_match_explanation(details),
                                match_details=details,
                            )
                            _log_sent(
                                sent_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                status="dry_run",
                                details=details,
                                dry_run=True,
                                sent=False,
                            )
                        else:
                            log.info("自动发送固定招呼语：%s", response)
                            await click_contact_and_send_response(response)
                            sent_count += 1
                            daily_sent_count += 1
                            log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=False,
                                sent=True,
                            )
                            _emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="sent",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=_match_explanation(details),
                                match_details=details,
                            )
                            _log_sent(
                                sent_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                status="sent",
                                details=details,
                                dry_run=False,
                                sent=True,
                            )
                            if sent_count >= auto_send_max_sent:
                                log.info(
                                    "已发送 %d 条，达到 BOSS_AUTO_SEND_MAX_SENT 上限，结束",
                                    sent_count,
                                )
                                _emit_progress("feed_exhausted", total=job_index)
                                break
                            delay = random.uniform(
                                auto_send_delay_min, auto_send_delay_max
                            )
                            log.info("自动发送节流等待 %.1f 秒后继续", delay)
                            await asyncio.sleep(delay)
                        advance_position()
                        await asyncio.sleep(3)
                        continue

                    if review_before_send:
                        # F5（opt-in）：AI 按 JD 生成招呼语（过校验），失败降级固定。
                        response, greeting_source = await _compose_greeting(
                            job_description, fixed_greeting
                        )
                        validation = validate_letter(response)
                        if not validation.ok:
                            log.warning(
                                "[BLOCKED] 固定招呼语未通过校验: %s — preview: %r",
                                validation.reasons,
                                response[:80],
                            )
                            log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=dry_run,
                                sent=False,
                            )
                            _emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="blocked",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=_match_explanation(details),
                                match_details=details,
                            )
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="validation",
                                details={"validation_reasons": validation.reasons},
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                        if gui_review:
                            decision = await _ask_gui_review_decision(
                                index=job_index,
                                job=job,
                                job_description=job_description,
                                details=details,
                                greeting=response,
                            )
                        else:
                            decision = await _ask_review_decision(
                                index=job_index,
                                job_description=job_description,
                                details=details,
                                greeting=response,
                            )
                        if decision == "quit":
                            log.info("用户在审核模式选择退出")
                            _emit_progress("feed_exhausted", total=job_index - 1)
                            break
                        if decision == "skip":
                            log.info("用户跳过岗位 #%d", job_index)
                            _log_skipped(
                                skipped_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                reason="review_skip",
                                details=details,
                            )
                            _emit_progress(
                                "job_skipped",
                                index=job_index,
                                reason="review_skip",
                                detail="用户审核后跳过",
                                score=match_score,
                            )
                            advance_position()
                            await asyncio.sleep(3)
                            continue
                        if dry_run:
                            log.info(
                                "[DRY-RUN][REVIEW] 固定招呼语 (%d 字符) 不发送。--- letter ---\n%s\n--------------",
                                len(response),
                                response,
                            )
                            log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=True,
                                sent=False,
                            )
                            _emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="dry_run",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=_match_explanation(details),
                                match_details=details,
                            )
                            _log_sent(
                                sent_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                status="dry_run",
                                details=details,
                                dry_run=True,
                                sent=False,
                            )
                        else:
                            log.info("审核通过，发送固定招呼语：%s", response)
                            await click_contact_and_send_response(response)
                            log_attempt(
                                source="fixed-greeting",
                                channel="local",
                                job_description=job_description,
                                letter=response,
                                validation=validation,
                                dry_run=False,
                                sent=True,
                            )
                            _emit_progress(
                                "letter_sent",
                                index=job_index,
                                status="sent",
                                score=match_score,
                                letter_len=len(response),
                                match_explanation=_match_explanation(details),
                                match_details=details,
                            )
                            _log_sent(
                                sent_log_path,
                                job=job,
                                job_key=dedupe_key,
                                send_mode=send_mode,
                                status="sent",
                                details=details,
                                dry_run=False,
                                sent=True,
                            )
                        await asyncio.sleep(3)
                        advance_position()
                        continue
            else:
                consecutive_misses += 1
                log.info(
                    "job_index=%d 拿不到 JD（连续第 %d 次）",
                    job_index,
                    consecutive_misses,
                )
                loaded_count = await finding_jobs.get_loaded_job_count()
                if loaded_count and window_index > loaded_count:
                    log.info(
                        "当前只加载了 %d 个岗位，等待第 %d 个岗位继续加载",
                        loaded_count,
                        window_index,
                    )
                if await finding_jobs.scroll_to_load_more_jobs():
                    consecutive_misses = 0
                    await asyncio.sleep(1)
                    continue
                if await finding_jobs.click_next_page_if_present():
                    consecutive_misses = 0
                    window_index = 1
                    await asyncio.sleep(1)
                    continue
                if await finding_jobs.navigate_next_search_page():
                    consecutive_misses = 0
                    window_index = 1
                    await asyncio.sleep(2)
                    continue
                latest_loaded_count = await finding_jobs.get_loaded_job_count()
                if loaded_count and window_index > loaded_count and latest_loaded_count >= window_index:
                    log.info(
                        "第 %d 个岗位已出现在列表中，重新读取当前岗位",
                        window_index,
                    )
                    consecutive_misses = 0
                    await asyncio.sleep(1)
                    continue
                if (
                    loaded_count
                    and window_index > loaded_count
                    and consecutive_misses < MAX_CONSECUTIVE_MISSES
                ):
                    await asyncio.sleep(1)
                    continue
                if consecutive_misses >= MAX_CONSECUTIVE_MISSES:
                    if barren_reloads < MAX_FEED_RELOADS:
                        log.info(
                            "连续 %d 个岗位拿不到，刷新推荐流换一批（第 %d/%d 次）",
                            MAX_CONSECUTIVE_MISSES,
                            barren_reloads + 1,
                            MAX_FEED_RELOADS,
                        )
                        _emit_progress(
                            "feed_reload",
                            attempt=barren_reloads + 1,
                            limit=MAX_FEED_RELOADS,
                        )
                        if await reload_feed_and_restart():
                            continue
                    log.info(
                        "连续 %d 个岗位拿不到，刷新 %d 次仍拉不到新岗位，结束",
                        MAX_CONSECUTIVE_MISSES,
                        barren_reloads,
                    )
                    _emit_progress("feed_exhausted", total=job_index - 1)
                    break

            await asyncio.sleep(3)
            advance_position()

        except Exception as e:
            log.exception("主循环抛异常: %s", e)
            _emit_progress(
                "error",
                stage=f"job_index={job_index}",
                message=f"{type(e).__name__}: {e}",
            )
            break
