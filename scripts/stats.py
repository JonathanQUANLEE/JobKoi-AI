"""投递统计：三平台。uv run python scripts/stats.py [--out 文件]。

聚合逻辑在 ``boss_zhipin.gui.stats_io.query_stats``（GUI / agent 工具共用），
本脚本只负责渲染成文本。
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from boss_zhipin.gui.stats_io import query_stats  # noqa: E402


def render(stats: dict) -> str:
    lines = [
        "=" * 50,
        f"  投递统计  {datetime.now().strftime('%m-%d %H:%M')}",
        "=" * 50,
    ]
    first = True
    for item in stats.values():
        if not first:
            lines.append("-" * 50)
        first = False
        lines.append(
            f"  {item['label']}：今日 {item['today']} / {item['limit']}"
            f"（剩 {item['remaining']}），累计 {item['total']} 条"
        )
        lines.append("    最近：")
        lines += [
            f"      {rec['ts'][5:16]}  {rec['title'][:26]} | {rec['company'][:18]}"
            for rec in item["recent"]
        ]
    lines.append("=" * 50)
    return "\n".join(lines)


def main() -> None:
    text = render(query_stats())
    print(text)

    if "--out" in sys.argv:
        i = sys.argv.index("--out")
        if i + 1 < len(sys.argv):
            (ROOT / sys.argv[i + 1]).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
