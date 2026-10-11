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
            url = str(
                raw.get("job_key")
                or job.get("detail_url")
                or raw.get("detail_url")
                or ""
            )
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

