#!/usr/bin/env python3
"""组装 tauri-plugin-updater 的静态 latest.json（仅 windows-x86_64）。

CI（release.yml）和本地应急发布链共用。updater 客户端请求
``releases/latest/download/latest.json`` → 比对版本 → 下载 url 指向的
NSIS 安装器 → 用 latest.json 里的 signature（minisign 签名块）验签安装。

用法：
    python scripts/make_latest_json.py \
        --version 0.7.0 \
        --sig "path/to/JobKoi-AI-Setup-0.7.0-x64.exe.sig" \
        --url "https://github.com/JonathanQUANLEE/JobKoi-AI/releases/download/v0.7.0/JobKoi-AI-Setup-0.7.0-x64.exe" \
        --out dist/latest.json [--notes "更新说明"]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# 平台键：updater 先查 windows-x86_64-nsis 再回退 windows-x86_64（tauri v2
# updater 源码行为），用宽键即可命中两种查询。
PLATFORM_KEY = "windows-x86_64"

_VERSION_RE = re.compile(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)*")


def build_latest_json(version: str, signature: str, url: str, notes: str | None) -> dict:
    """纯函数：组装 latest.json 字典（便于测试）。"""
    return {
        "version": version,
        "notes": notes if notes else f"JobKoi-AI {version}",
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            PLATFORM_KEY: {
                "signature": signature,
                "url": url,
            }
        },
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Generate tauri updater latest.json")
    parser.add_argument("--version", required=True, help="语义化版本号（如 0.7.0）")
    parser.add_argument("--sig", required=True, help=".sig 签名文件路径（内容进 signature）")
    parser.add_argument("--url", required=True, help="NSIS 安装器下载 URL（必须 https）")
    parser.add_argument("--out", required=True, help="输出 latest.json 路径")
    parser.add_argument("--notes", default=None, help="更新说明（缺省用版本号占位）")
    args = parser.parse_args(argv)

    if not _VERSION_RE.fullmatch(args.version):
        print(f"❌ 版本号形状不对：{args.version!r}", file=sys.stderr)
        return 1
    if not args.url.startswith("https://"):
        print(f"❌ url 必须 https（updater 拒绝 http）：{args.url}", file=sys.stderr)
        return 1
    sig_path = Path(args.sig)
    if not sig_path.is_file():
        print(f"❌ 签名文件不存在：{sig_path}", file=sys.stderr)
        return 1
    signature = sig_path.read_text(encoding="utf-8").strip()
    if not signature:
        print(f"❌ 签名文件为空：{sig_path}", file=sys.stderr)
        return 1

    payload = build_latest_json(args.version, signature, args.url, args.notes)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"✅ latest.json → {out_path}（version={args.version}, platform={PLATFORM_KEY}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
