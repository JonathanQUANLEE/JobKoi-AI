"""stats_io 单测：聚合 / 跨天 / 坏行 / ts_local 优先。"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from boss_zhipin.gui.stats_io import format_stats, query_stats


def _write(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def test_query_stats_empty_dir(tmp_path):
    stats = query_stats(tmp_path)
    for key in ("boss", "liepin", "job51"):
        assert stats[key]["today"] == 0
        assert stats[key]["total"] == 0
        assert stats[key]["recent"] == []


def test_query_stats_aggregates_today_and_total(tmp_path):
    today = datetime.now().strftime("%Y-%m-%d")
    _write(
        tmp_path / "sent_jobs.jsonl",
        [
            {"sent": True, "ts_local": f"{today} 10:00:00",
             "job": {"title": "AI Agent 实习", "company": "字节"}, "sent": True},
            {"sent": True, "ts_local": f"{today} 11:00:00",
             "job": {"title": "大模型实习", "company": "腾讯"}},
            # 昨天的（ts_local 拼昨天日期）
            {"sent": True, "ts_local": "2000-01-01 09:00:00",
             "job": {"title": "老岗位", "company": "老公司"}},
            # 未发送的不计数
            {"sent": False, "ts_local": f"{today} 12:00:00", "job": {}},
        ],
    )
    stats = query_stats(tmp_path)
    assert stats["boss"]["today"] == 2
    assert stats["boss"]["total"] == 3
    assert stats["boss"]["remaining"] == 148
    assert stats["boss"]["limit"] == 150
    assert len(stats["boss"]["recent"]) == 3
    assert stats["boss"]["recent"][0]["title"] == "AI Agent 实习"


def test_query_stats_skips_corrupt_lines(tmp_path):
    today = datetime.now().strftime("%Y-%m-%d")
    path = tmp_path / "liepin_sent.jsonl"
    path.write_text(
        json.dumps({"sent": True, "ts": f"{today}T10:00:00", "title": "T", "company": "C"})
        + "\n{ broken json\n\n"
        + json.dumps({"sent": True, "ts": f"{today}T11:00:00", "title": "T2", "company": "C2"})
        + "\n",
        encoding="utf-8",
    )
    stats = query_stats(tmp_path)
    assert stats["liepin"]["today"] == 2
    assert stats["liepin"]["total"] == 2


def test_query_stats_prefers_local_ts_over_utc(tmp_path):
    """BOSS 凌晨错天防护：ts_local（本地）优先于 ts（UTC isoformat）。"""
    # UTC 2026-10-08T17:00 = 北京 2026-10-09 01:00；本地日期才是 10-09
    _write(
        tmp_path / "sent_jobs.jsonl",
        [
            {
                "sent": True,
                "ts": "2026-10-08T17:00:00+00:00",
                "ts_local": "2026-10-09 01:00:00",
                "job": {"title": "夜猫岗", "company": "X"},
            }
        ],
    )
    stats = query_stats(tmp_path)
    # 断言该记录按本地日期 10-09 计数（不管"今天"是哪天，桶里应是 2026-10-09）
    assert stats["boss"]["recent"][0]["ts"].startswith("2026-10-09")


def test_format_stats_renders_labels():
    stats = query_stats(Path(__file__).parent / "no_such_dir")
    text = format_stats(stats)
    assert "BOSS 直聘" in text
    assert "猎聘" in text
    assert "前程无忧" in text
    assert "今日 0 / 150" in text
