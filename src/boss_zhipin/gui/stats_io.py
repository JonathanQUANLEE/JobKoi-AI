"""三平台投递统计的结构化查询。

从 ``scripts/stats.py`` 抽出来的可复用层：GUI / agent 工具（get_stats）/
CLI 脚本共用一份聚合逻辑，返回 dict 而非打印文本。

时间口径：优先 ``ts_local``（本地时间，BOSS 日志用），其次 ``ts``（猎聘/
51job 的本地 isoformat）。**不**用 UTC 的 ``ts`` 当 BOSS 的日期——北京时间
0-8 点会把凌晨投递算到昨天（与 write_response._sent_today_count 同款修正）。
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

from boss_zhipin.platforms.limits import DEFAULT_DAILY_LIMITS

log = logging.getLogger(__name__)

# src/boss_zhipin/gui/stats_io.py → 仓库根（gui → boss_zhipin → src → repo）
ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_LOGS_DIR = ROOT / "logs"

BOSS_DAILY_LIMIT = DEFAULT_DAILY_LIMITS["boss"]
LIEPIN_DAILY_LIMIT = DEFAULT_DAILY_LIMITS["liepin"]
JOB51_DAILY_LIMIT = DEFAULT_DAILY_LIMITS["job51"]

# key → (展示名, sent 日志文件名, 日限额)
PLATFORMS: dict[str, tuple[str, str, int]] = {
    "boss": ("BOSS 直聘", "sent_jobs.jsonl", BOSS_DAILY_LIMIT),
    "liepin": ("猎聘", "liepin_sent.jsonl", LIEPIN_DAILY_LIMIT),
    "job51": ("前程无忧", "job51_sent.jsonl", JOB51_DAILY_LIMIT),
}

RECENT_LIMIT = 8


def query_stats(logs_dir: Path | None = None) -> dict[str, Any]:
    """聚合三平台 sent 日志。

    Returns::

        {"boss": {"label": "BOSS 直聘", "today": 3, "total": 900, "limit": 150,
                   "remaining": 147,
                   "recent": [{"ts": "...", "title": "...", "company": "..."}]},
         "liepin": {...}, "job51": {...}}
    """
    base = logs_dir or DEFAULT_LOGS_DIR
    today = datetime.now().strftime("%Y-%m-%d")
    result: dict[str, Any] = {}
    for key, (label, filename, limit) in PLATFORMS.items():
        records = _load_sent(base / filename)
        days: Counter[str] = Counter()
        recent: list[dict[str, str]] = []
        for record in records:
            if record.get("archived_test"):
                continue
            ts = _local_ts(record)
            days[ts[:10]] += 1
            job = record.get("job") or {}
            recent.append(
                {
                    "ts": ts[:16],
                    "title": str(record.get("title") or job.get("title") or "")[:30],
                    "company": str(
                        record.get("company") or job.get("company") or ""
                    )[:20],
                }
            )
        today_count = days.get(today, 0)
        result[key] = {
            "label": label,
            "today": today_count,
            "total": len(records),
            "limit": limit,
            "remaining": max(limit - today_count, 0),
            "recent": recent[-RECENT_LIMIT:],
        }
    return result


def format_stats(stats: dict[str, Any] | None = None) -> str:
    """渲染成中文文本（agent 工具回话 / CLI 输出共用）。"""
    data = stats or query_stats()
    lines: list[str] = []
    for item in data.values():
        lines.append(
            f"{item['label']}：今日 {item['today']} / {item['limit']}"
            f"（剩 {item['remaining']}），累计 {item['total']} 条"
        )
        for rec in item["recent"][-3:]:
            lines.append(f"  · {rec['ts']} {rec['title']} | {rec['company']}")
    return "\n".join(lines)


def _local_ts(record: dict) -> str:
    """本地时间戳：优先 ts_local，其次 ts；都没有返回空串（不进任何日期桶）。"""
    return str(record.get("ts_local") or record.get("ts") or "")


def _load_sent(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out: list[dict] = []
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and (data.get("sent") or data.get("archived_test")):
                out.append(data)
    return out


def get_delivery_records(
    platform: str = "", limit: int = 100, logs_dir: Path | None = None
) -> list[dict[str, Any]]:
    """获取格式统一的详细投递记录，按时间倒序。支持按平台过滤。"""
    base = logs_dir or DEFAULT_LOGS_DIR
    records: list[dict[str, Any]] = []

    target_platforms = (
        [platform] if platform in PLATFORMS else list(PLATFORMS.keys())
    )

    for p_id in target_platforms:
        label, filename, _ = PLATFORMS[p_id]
        raw_list = _load_sent(base / filename)
        for raw in raw_list:
            job = raw.get("job") or {}
            ts_str = _local_ts(raw)
            title = str(raw.get("title") or job.get("title") or "")
            company = str(raw.get("company") or job.get("company") or "")
            location = str(raw.get("location") or job.get("location") or "")
            salary = str(raw.get("salary") or job.get("salary") or "")
            raw_url = str(
                raw.get("url")
                or raw.get("detail_url")
                or job.get("detail_url")
                or job.get("url")
                or ""
            )
            if not raw_url:
                job_key_cand = str(raw.get("job_key") or "")
                if job_key_cand.startswith("http"):
                    raw_url = job_key_cand
                elif p_id == "liepin" and raw.get("job_id"):
                    raw_url = f"https://www.liepin.com/job/{raw.get('job_id')}.shtml"
                elif p_id == "job51" and raw.get("job_id"):
                    raw_url = f"https://jobs.51job.com/{raw.get('job_id')}.html"
            url = raw_url
            records.append(
                {
                    "platform": p_id,
                    "platform_name": label,
                    "title": title,
                    "company": company,
                    "location": location,
                    "salary": salary,
                    "url": url,
                    "time": ts_str[:19].replace("T", " "),
                    "status": "已归档(测试重置)"
                    if raw.get("archived_test")
                    else ("已沟通" if raw.get("sent") else "已跳过"),
                }
            )

    # 按时间倒序排序
    records.sort(key=lambda x: x["time"], reverse=True)
    return records[:limit]


def get_daily_delivery_stats(
    days: int = 30, logs_dir: Path | None = None
) -> dict[str, Any]:
    """按天聚合三平台**真实**投递账本（统计页「真实数据」模式的数据源）。

    与前端演示数据（deliveryHistory.ts 本地假库）的区别：这里从
    ``logs/*_sent.jsonl`` 逐条实读，只认 ``sent=true`` 的真实投递
    （dry_run / scan_only / archived_test 归档一概不算）。

    Args:
        days: 返回最近多少天的按天序列（1~90，越界收敛）；无投递的天补 0，
            前端折线图拿到的是连续满窗口。
        logs_dir: 账本目录（测试注入用）。

    Returns::

        {"days": [{"date": "2026-10-12", "label": "10-12", "weekday": "周日",
                    "bossSent": 10, "liepinSent": 5, "job51Sent": 2,
                    "totalSent": 17}, ...],   # 旧→新，含今天，共 days 个
         "totals": {"sentSum": 290, "activeDays": 12,
                     "bossSent": 150, "liepinSent": 100, "job51Sent": 40,
                     "firstDate": "2026-09-01", "lastDate": "2026-10-12"}}
    """
    base = logs_dir or DEFAULT_LOGS_DIR
    window = max(1, min(90, int(days)))
    today = datetime.now().date()

    # 平台 -> 按天计数；totals 全量累计（不受窗口限制，回答"自使用以来"）
    per_day: dict[str, dict[str, int]] = {}
    totals = {"boss": 0, "liepin": 0, "job51": 0}
    first_date: str | None = None
    last_date: str | None = None

    for platform_id, (_, filename, _) in PLATFORMS.items():
        path = base / filename
        if not path.exists():
            continue
        with path.open(encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(record, dict):
                    continue
                if not record.get("sent") or record.get("archived_test"):
                    continue
                day = _local_ts(record)[:10]
                if len(day) != 10 or not day.startswith("2"):
                    continue  # 没有可用本地时间戳的记录不进任何桶
                bucket = per_day.setdefault(day, {"boss": 0, "liepin": 0, "job51": 0})
                bucket[platform_id] += 1
                totals[platform_id] += 1
                if first_date is None or day < first_date:
                    first_date = day
                if last_date is None or day > last_date:
                    last_date = day

    # 补零生成满窗口（旧→新，含今天）
    weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    day_rows: list[dict[str, Any]] = []
    for offset in range(window - 1, -1, -1):
        d = today.fromordinal(today.toordinal() - offset)
        date_str = d.strftime("%Y-%m-%d")
        bucket = per_day.get(date_str, {"boss": 0, "liepin": 0, "job51": 0})
        boss_sent = bucket["boss"]
        liepin_sent = bucket["liepin"]
        job51_sent = bucket["job51"]
        day_rows.append(
            {
                "date": date_str,
                "label": date_str[5:],
                "weekday": weekdays[d.weekday()],
                "bossSent": boss_sent,
                "liepinSent": liepin_sent,
                "job51Sent": job51_sent,
                "totalSent": boss_sent + liepin_sent + job51_sent,
            }
        )

    sent_sum = totals["boss"] + totals["liepin"] + totals["job51"]
    active_days = len(per_day)
    return {
        "days": day_rows,
        "totals": {
            "sentSum": sent_sum,
            "activeDays": active_days,
            "bossSent": totals["boss"],
            "liepinSent": totals["liepin"],
            "job51Sent": totals["job51"],
            "firstDate": first_date or "",
            "lastDate": last_date or "",
        },
    }


def reset_today_delivery(
    platform: str = "boss", logs_dir: Path | None = None
) -> dict[str, Any]:
    """将当天的投递记录安全备份归档，重置今日投递计数（供用户开发调试测试使用）。"""
    base = logs_dir or DEFAULT_LOGS_DIR
    today_str = datetime.now().strftime("%Y-%m-%d")
    archived_count = 0

    target_platforms = [platform] if platform in PLATFORMS else list(PLATFORMS.keys())
    for p_id in target_platforms:
        _, filename, _ = PLATFORMS[p_id]
        p_path = base / filename
        if not p_path.exists():
            continue
        lines = p_path.read_text(encoding="utf-8", errors="replace").splitlines()
        retained: list[str] = []
        for line in lines:
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                ts = _local_ts(data)
                if ts.startswith(today_str) and not data.get("archived_test"):
                    archived_count += 1
                    data["archived_test"] = True
                    data["archived_at"] = datetime.now().isoformat()
                    retained.append(json.dumps(data, ensure_ascii=False))
                else:
                    retained.append(line)
            except Exception:
                retained.append(line)
        p_path.write_text("\n".join(retained) + "\n", encoding="utf-8")

    return {"status": "ok", "success": True, "archived_count": archived_count, "platform": platform}

