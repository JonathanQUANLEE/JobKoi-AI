"""JSONL 历史日志落盘、去重判定与每日计数。"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from boss_zhipin.website_oper.core.models import JobPosting

log = logging.getLogger(__name__)


def _state_path(env_name: str) -> Path | None:
    raw = os.getenv(env_name, "").strip()
    return Path(raw) if raw else None


def _read_seen_job_keys(path: Path | None) -> set[str]:
    from boss_zhipin.website_oper import finding_jobs

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
                keys.add(finding_jobs.normalize_job_key(key))
    return keys


def _normalize_company(name: str) -> str:
    """公司名规范化，用于'同一家公司只打一次招呼'。"""
    s = re.sub(r"[\s\u3000]+", "", str(name or "")).lower()
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
    """读 sent 日志里已经联系过的公司名集合。"""
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


def _job_payload(job: JobPosting) -> dict:
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


def _job_with_derived_fields(job: JobPosting, description: str) -> JobPosting:
    """补齐岗位卡片偶尔没解析到的字段。"""
    from boss_zhipin.website_oper import finding_jobs

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


def _has_stable_job_identity(job: JobPosting) -> bool:
    """判断岗位是否有可跨滚动窗口复用的稳定身份字段。"""
    return any(
        str(value or "").strip()
        for value in (job.detail_url, job.title, job.company, job.location, job.boss_name)
    )


def _state_record(
    *,
    job: JobPosting,
    job_key: str,
    send_mode: str,
    status: str,
    details: dict | None = None,
    reason: str = "",
    dry_run: bool = False,
    sent: bool = False,
) -> dict:
    from boss_zhipin.website_oper import write_response

    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "ts_local": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "profile": write_response._profile_name(),
        "job_key": job_key,
        "job": _job_payload(job),
        "match": details or {},
        "reason": reason,
        "send_mode": send_mode,
        "status": status,
        "dry_run": dry_run,
        "sent": sent,
    }


def _match_explanation(details: dict | None) -> str:
    """从本地规则详情中提取适合展示给 GUI 用户的通过原因。"""
    if not details:
        return ""
    explanation = details.get("explanation") or details.get("reason") or ""
    note = details.get("boss_active_note")
    if note:
        return "；".join([str(explanation), str(note)])
    return str(explanation)


def _log_seen(
    path: Path | None, *, job: JobPosting, job_key: str, send_mode: str
) -> None:
    _append_jsonl(
        path,
        _state_record(job=job, job_key=job_key, send_mode=send_mode, status="seen"),
    )


def _log_skipped(
    path: Path | None,
    *,
    job: JobPosting,
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
    job: JobPosting,
    job_key: str,
    send_mode: str,
    status: str,
    details: dict | None = None,
    dry_run: bool = False,
    sent: bool = False,
) -> None:
    from boss_zhipin.website_oper import write_response

    record = _state_record(
        job=job,
        job_key=job_key,
        send_mode=send_mode,
        status=status,
        details=details,
        dry_run=dry_run,
        sent=sent,
    )
    record["match_explanation"] = write_response._match_explanation(details)
    _append_jsonl(path, record)


def _sent_today_count(path: Path | None, *, profile: str) -> int:
    if path is None or not path.exists():
        return 0
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
