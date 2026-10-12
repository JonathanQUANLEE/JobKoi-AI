"""BOSS 城市多选 URL 上限验证（2026-10-12）：网页 UI 限 4 城，URL 限几个？

用法：
    uv run python scripts/probe/probe_city_url_max.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from boss_zhipin.website_oper import finding_jobs  # noqa: E402

BASE = "https://www.zhipin.com/web/geek/jobs?query=AI%20%E5%AE%9E%E4%B9%A0"

# BOSS 城市代码（probe_city_url.py 已实证郑州/上海/北京三个）
CODES = {
    "郑州": "101180100",
    "上海": "101020100",
    "北京": "101010100",
    "广州": "101280100",
    "深圳": "101280600",
    "杭州": "101210100",
    "成都": "101270100",
}

JS_STATE = r"""
() => {
  const label = document.querySelector('.cur-city-label')?.innerText?.trim() || '';
  const body = document.body ? document.body.innerText || '' : '';
  const hasJobs = body.includes('K') || body.includes('实习') || body.includes('岗位');
  return JSON.stringify({ url: location.href, curCityLabel: label, pageHasJobs: hasJobs });
}
"""


async def try_url(tag: str, codes: list[str]) -> None:
    tab = finding_jobs.get_tab()
    url = f"{BASE}&city={','.join(codes)}"
    await tab.get(url)
    await asyncio.sleep(4)
    state = await finding_jobs._safe_evaluate(f"({JS_STATE})()")
    print(f"[{tag}] codes={codes}")
    print(f"  实际 URL: {state.get('url')}")
    print(f"  顶部标签: {state.get('curCityLabel')!r} · 页面有岗位: {state.get('pageHasJobs')}")


async def main() -> int:
    await finding_jobs.open_browser_with_options(BASE, "chrome")
    await try_url("4 城（UI 上限对照）", list(CODES.values())[:4])
    await try_url("5 城（超 UI 限制）", list(CODES.values())[:5])
    await try_url("7 城（全量）", list(CODES.values()))
    await finding_jobs.shutdown()
    return 0


if __name__ == "__main__":
    import nodriver as uc

    raise SystemExit(uc.loop().run_until_complete(main()))
