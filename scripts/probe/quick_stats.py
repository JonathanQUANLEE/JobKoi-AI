"""投递快报：一眼看清今天投了多少、投了谁、还剩多少额度。

PowerShell 5.1 读 UTF-8 无 BOM 的日志会乱码（按 ANSI 解码），中文根本匹配不上，
所以统一用 Python 读。

用法：
    uv run python scripts/quick_stats.py                      # 打印今日投递清单
    uv run python scripts/quick_stats.py --last 50            # 多看几行
    uv run python scripts/quick_stats.py --out logs/s.txt     # 结果写文件

**结果一定要让 Python 自己写文件**（--out），别用 PowerShell 管道
`... | Out-File`：那是把 UTF-8 字节按 GBK 解码、再按 UTF-8 写回，中文全乱码。
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGS = ROOT / "logs"
DAILY_LIMIT = 200


def _today_records() -> list[dict]:
    """今天的真实投递记录。

    只信任 sent_jobs.jsonl（Python 直接写的 UTF-8，干净），**不解析运行日志**——
    用 PowerShell 管道 `... | Out-File` 落盘的日志会被二次编码（UTF-8 字节被按
    GBK 解码再按 UTF-8 写回），中文全是乱码，grep 不到任何东西。
    """
    path = LOGS / "sent_jobs.jsonl"
    if not path.exists():
        return []
    today = datetime.now().strftime("%Y-%m-%d")
    out: list[dict] = []
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("sent") and str(r.get("ts_local") or "").startswith(today):
                out.append(r)
    return out


def _contacted_companies() -> int:
    path = LOGS / "sent_jobs.jsonl"
    if not path.exists():
        return 0
    seen: set[str] = set()
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not r.get("sent"):
                continue
            job = r.get("job") or {}
            c = (job.get("company") or "").strip()
            if c:
                seen.add(c)
    return len(seen)


def main() -> None:
    args = [a for a in sys.argv[1:]]
    last = 30
    if "--last" in args:
        i = args.index("--last")
        try:
            last = int(args[i + 1])
        except (IndexError, ValueError):
            pass
        args = args[:i] + args[i + 2 :]

    out_path: Path | None = None
    if "--out" in args:
        i = args.index("--out")
        try:
            out_path = (ROOT / args[i + 1]) if i + 1 < len(args) else None
        except IndexError:
            out_path = None
        args = args[:i] + args[i + 2 :]

    records = _today_records()
    today = len(records)
    lines: list[str] = [
        f"统计时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"今日已投：{today} / {DAILY_LIMIT}（剩 {DAILY_LIMIT - today}）",
        f"已联系公司：{_contacted_companies()} 家",
    ]

    if records:
        lines.append(f"\n今日投递清单（最近 {min(last, len(records))} 条）：")
        for r in records[-last:]:
            job = r.get("job") or {}
            ts = str(r.get("ts_local") or "")[11:19]
            title = job.get("title") or job.get("job_name") or "?"
            company = job.get("company") or "?"
            lines.append(f"   {ts}  {title}  @  {company}")

    text = "\n".join(lines)
    print(text)
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
