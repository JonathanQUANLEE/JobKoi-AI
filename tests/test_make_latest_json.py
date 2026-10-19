"""make_latest_json 的组装与校验测试。"""

from __future__ import annotations

import json

import pytest

from scripts.make_latest_json import PLATFORM_KEY, build_latest_json, main


def test_build_latest_json_shape():
    payload = build_latest_json("0.7.0", "SIG-BLOCK", "https://example.com/a.exe", "说明")
    assert payload["version"] == "0.7.0"
    assert payload["notes"] == "说明"
    # pub_date 必须是 UTC ISO8601（updater 用 RFC 3339 解析）
    assert payload["pub_date"].endswith("Z")
    assert "T" in payload["pub_date"]
    # 平台键精确为宽键（同时命中 -nsis 窄键查询的回退）
    assert list(payload["platforms"].keys()) == [PLATFORM_KEY]
    entry = payload["platforms"][PLATFORM_KEY]
    assert entry["signature"] == "SIG-BLOCK"
    assert entry["url"] == "https://example.com/a.exe"


def test_build_latest_json_notes_default():
    payload = build_latest_json("0.7.0", "S", "https://e.com/a.exe", None)
    assert payload["notes"] == "JobKoi-AI 0.7.0"


def test_main_writes_file_and_passes(tmp_path):
    sig = tmp_path / "a.exe.sig"
    sig.write_text("  SIG-BLOCK\n", encoding="utf-8")  # 前后空白应被 strip
    out = tmp_path / "dist" / "latest.json"
    rc = main(
        [
            "--version", "0.7.0",
            "--sig", str(sig),
            "--url", "https://github.com/x/y/releases/download/v0.7.0/a.exe",
            "--out", str(out),
        ]
    )
    assert rc == 0
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["version"] == "0.7.0"
    assert payload["platforms"][PLATFORM_KEY]["signature"] == "SIG-BLOCK"


def test_main_rejects_bad_version(tmp_path):
    sig = tmp_path / "a.sig"
    sig.write_text("S", encoding="utf-8")
    rc = main(["--version", "not-a-version", "--sig", str(sig),
               "--url", "https://e.com/a.exe", "--out", str(tmp_path / "o.json")])
    assert rc == 1


def test_main_rejects_http_url(tmp_path):
    sig = tmp_path / "a.sig"
    sig.write_text("S", encoding="utf-8")
    rc = main(["--version", "0.7.0", "--sig", str(sig),
               "--url", "http://insecure.com/a.exe", "--out", str(tmp_path / "o.json")])
    assert rc == 1


def test_main_rejects_missing_sig(tmp_path):
    rc = main(["--version", "0.7.0", "--sig", str(tmp_path / "nope.sig"),
               "--url", "https://e.com/a.exe", "--out", str(tmp_path / "o.json")])
    assert rc == 1


def test_main_rejects_empty_sig(tmp_path):
    sig = tmp_path / "a.sig"
    sig.write_text("   \n", encoding="utf-8")
    rc = main(["--version", "0.7.0", "--sig", str(sig),
               "--url", "https://e.com/a.exe", "--out", str(tmp_path / "o.json")])
    assert rc == 1
