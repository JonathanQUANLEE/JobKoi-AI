"""stats_io 单测：聚合 / 跨天 / 坏行 / ts_local 优先。"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from boss_zhipin.gui.stats_io import (
    format_stats,
    get_daily_delivery_stats,
    get_delivery_records,
    query_stats,
    reset_today_delivery,
)


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
    # BOSS 日限默认 100（2026-10-15 保号拍板：平台主动沟通上限 100/天）
    assert stats["boss"]["remaining"] == 98
    assert stats["boss"]["limit"] == 100
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
    assert "今日 0 / 100" in text


def test_get_delivery_records_and_reset_today(tmp_path):
    today = datetime.now().strftime("%Y-%m-%d")
    _write(
        tmp_path / "sent_jobs.jsonl",
        [
            {
                "sent": True,
                "ts_local": f"{today} 14:00:00",
                "job": {
                    "title": "AI 架构师",
                    "company": "科技公司A",
                    "salary": "30-50K",
                    "location": "北京",
                    "url": "https://zhipin.com/job1",
                },
            },
            {
                "sent": True,
                "ts_local": "2026-01-01 10:00:00",
                "job": {
                    "title": "历史岗位",
                    "company": "历史公司B",
                    "salary": "20-30K",
                    "location": "上海",
                },
            },
        ],
    )

    records = get_delivery_records(platform="boss", limit=10, logs_dir=tmp_path)
    assert len(records) == 2
    assert records[0]["title"] == "AI 架构师"
    assert records[0]["platform"] == "boss"
    assert records[0]["company"] == "科技公司A"

    # 测试重置今日
    result = reset_today_delivery(platform="boss", logs_dir=tmp_path)
    assert result["success"] is True
    assert result["archived_count"] == 1

    # 重置后，今日统计归零，解除上限拦截
    stats_after = query_stats(tmp_path)
    assert stats_after["boss"]["today"] == 0

    # 投递记录仍可查阅，状态标记为已归档
    records_after = get_delivery_records(platform="boss", limit=10, logs_dir=tmp_path)
    assert len(records_after) == 2
    assert records_after[0]["status"] == "已归档(测试重置)"


# ---------- get_daily_delivery_stats：统计页真实数据模式 ----------


def test_daily_stats_empty_logs_full_zero_window(tmp_path):
    """空账本：返回满窗口全 0（新用户第一次打开统计页的真实模式）。"""
    result = get_daily_delivery_stats(days=14, logs_dir=tmp_path)
    assert len(result["days"]) == 14
    assert all(d["totalSent"] == 0 for d in result["days"])
    # 满窗口：旧→新排列，最后一天是今天
    today_str = datetime.now().strftime("%Y-%m-%d")
    assert result["days"][-1]["date"] == today_str
    assert result["days"][0]["date"] < result["days"][-1]["date"]
    totals = result["totals"]
    assert totals["sentSum"] == 0
    assert totals["activeDays"] == 0
    assert totals["firstDate"] == ""
    assert totals["lastDate"] == ""


def test_daily_stats_single_day_few_records(tmp_path):
    """只用一天、投 3 份（BOSS 2 + 猎聘 1）：当天桶正确，其余天补 0。"""
    today = datetime.now().strftime("%Y-%m-%d")
    _write(
        tmp_path / "sent_jobs.jsonl",
        [
            {"sent": True, "ts_local": f"{today} 10:00:00", "job": {"title": "A"}},
            {"sent": True, "ts_local": f"{today} 11:00:00", "job": {"title": "B"}},
        ],
    )
    _write(
        tmp_path / "liepin_sent.jsonl",
        [{"sent": True, "ts": f"{today}T12:00:00", "job_id": "x", "company": "C"}],
    )
    result = get_daily_delivery_stats(days=7, logs_dir=tmp_path)
    last = result["days"][-1]
    assert last["bossSent"] == 2
    assert last["liepinSent"] == 1
    assert last["job51Sent"] == 0
    assert last["totalSent"] == 3
    # 其余 6 天全 0
    assert all(d["totalSent"] == 0 for d in result["days"][:-1])
    totals = result["totals"]
    assert totals["sentSum"] == 3
    assert totals["bossSent"] == 2
    assert totals["liepinSent"] == 1
    assert totals["activeDays"] == 1
    assert totals["firstDate"] == today
    assert totals["lastDate"] == today


def test_daily_stats_long_history_window_excludes_but_totals_count(tmp_path):
    """重度用户（60 天数据）：窗口 30 天只展示近 30 天，totals 仍是全量累计。"""
    from datetime import timedelta

    today = datetime.now().date()
    rows = []
    for offset in range(60):  # 60 天前 → 今天，每天投 1 份 BOSS
        day = (today - timedelta(days=offset)).strftime("%Y-%m-%d")
        rows.append({"sent": True, "ts_local": f"{day} 10:00:00", "job": {"title": "T"}})
    _write(tmp_path / "sent_jobs.jsonl", rows)

    result = get_daily_delivery_stats(days=30, logs_dir=tmp_path)
    assert len(result["days"]) == 30
    assert all(d["bossSent"] == 1 for d in result["days"])
    # 全量累计不受窗口限制
    assert result["totals"]["sentSum"] == 60
    assert result["totals"]["activeDays"] == 60


def test_daily_stats_excludes_noise_records(tmp_path):
    """dry_run / scan_only（sent=False）、archived_test 归档、坏行、无时间戳一概不算。"""
    today = datetime.now().strftime("%Y-%m-%d")
    path = tmp_path / "sent_jobs.jsonl"
    path.write_text(
        "\n".join(
            [
                json.dumps({"sent": True, "ts_local": f"{today} 10:00:00"}),  # 真
                json.dumps({"sent": False, "ts_local": f"{today} 10:01:00"}),  # dry_run
                json.dumps({"sent": False, "status": "scan_only",
                            "ts_local": f"{today} 10:02:00"}),  # scan_only
                json.dumps({"sent": True, "archived_test": True,
                            "ts_local": f"{today} 10:03:00"}),  # 测试重置归档
                "{ broken json",  # 坏行
                json.dumps({"sent": True}),  # 没有时间戳 → 不进桶也不进 totals
                "",
            ]
        ),
        encoding="utf-8",
    )
    result = get_daily_delivery_stats(days=7, logs_dir=tmp_path)
    assert result["days"][-1]["bossSent"] == 1
    assert result["totals"]["sentSum"] == 1


def test_daily_stats_days_param_clamped(tmp_path):
    """days 越界收敛：0 → 1，1000 → 90。"""
    assert len(get_daily_delivery_stats(days=0, logs_dir=tmp_path)["days"]) == 1
    assert len(get_daily_delivery_stats(days=1000, logs_dir=tmp_path)["days"]) == 90

