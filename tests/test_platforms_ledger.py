"""platforms/ledger.py 三平台公共账本原语的回归测试。

这批函数历史上在 BOSS/猎聘/51job 各复制一份且无任何单测；
P2 合并为单一真相后补齐测试，保证三平台去重行为永远一致。
"""
from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from boss_zhipin.platforms.ledger import (
    append_jsonl,
    load_jsonl,
    normalize_company,
    sent_companies,
    sent_job_ids,
    today_sent,
)


def _write_log(path: Path, records: list[dict]) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


# ---------- normalize_company ----------

def test_normalize_company_strips_suffix():
    assert normalize_company("字节跳动有限公司") == "字节跳动"
    assert normalize_company("北京字节跳动股份有限公司") == "北京字节跳动"
    assert normalize_company("某某集团") == "某某"


def test_normalize_company_strips_spaces_and_paren_note():
    assert normalize_company("腾讯 科技（深圳）有限公司") == "腾讯科技"
    # 括号注记被去掉、空白被压缩、统一小写
    assert normalize_company("Foo Bar [China] Co") == "foobarco"


def test_normalize_company_edge_cases():
    assert normalize_company("") == ""
    assert normalize_company(None) == ""  # type: ignore[arg-type]
    # 只有后缀本身时不剥（避免归一化成空串）
    assert normalize_company("公司") == "公司"
    # 祖传行为钉住：纯"有限公司"会被"公司"后缀剥成"有限"（无害怪癖，三平台一致）
    assert normalize_company("有限公司") == "有限"


# ---------- load_jsonl / append_jsonl ----------

def test_load_jsonl_missing_file_returns_empty(tmp_path):
    assert load_jsonl(tmp_path / "nope.jsonl") == []


def test_load_jsonl_skips_corrupt_lines(tmp_path):
    p = tmp_path / "log.jsonl"
    p.write_text('{"job_id": "1"}\nnot-json\n{"job_id": "2"}\n', encoding="utf-8")
    assert [r["job_id"] for r in load_jsonl(p)] == ["1", "2"]


def test_append_jsonl_roundtrip_and_mkdir(tmp_path):
    p = tmp_path / "deep" / "nested" / "log.jsonl"
    append_jsonl(p, {"job_id": "a", "company": "字节跳动有限公司"})
    append_jsonl(p, {"job_id": "b"})
    rows = load_jsonl(p)
    assert len(rows) == 2
    assert rows[0]["company"] == "字节跳动有限公司"  # ensure_ascii=False 保中文


def test_append_jsonl_none_path_is_noop():
    append_jsonl(None, {"x": 1})  # 不应抛错


# ---------- 去重集合 / 今日计数 ----------

def _sample_records() -> list[dict]:
    now = datetime.now()
    yesterday = (now - timedelta(days=1)).isoformat()
    return [
        {"job_id": "j1", "company": "字节跳动有限公司", "ts": now.isoformat(), "sent": True},
        {"job_id": "j2", "company": "字节跳动", "ts": now.isoformat(), "sent": True},
        {"job_id": None, "company": "腾讯", "ts": now.isoformat(), "sent": True},
        {"job_id": "j3", "company": "腾讯科技（深圳）有限公司", "ts": yesterday, "sent": True},
    ]


def test_sent_job_ids_dedupes_by_job_id(tmp_path):
    p = tmp_path / "sent.jsonl"
    _write_log(p, _sample_records())
    assert sent_job_ids(p) == {"j1", "j2", "j3"}


def test_sent_companies_dedupes_across_suffix_variants(tmp_path):
    p = tmp_path / "sent.jsonl"
    _write_log(p, _sample_records())
    # “字节跳动有限公司”和“字节跳动”归一化后是同一家公司
    companies = sent_companies(p)
    assert "字节跳动" in companies
    # “腾讯科技（深圳）有限公司” → 去括号注记、去后缀 → “腾讯科技”
    assert "腾讯科技" in companies


def test_today_sent_only_counts_today(tmp_path):
    p = tmp_path / "sent.jsonl"
    _write_log(p, _sample_records())
    # 3 条今天的记录（含 job_id 为 None 那条——历史上如此，保持口径不变）
    assert today_sent(p) == 3
