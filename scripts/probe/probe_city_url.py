"""BOSS 城市 URL 直填方案验证（2026-10-12 城市点击失败的 Plan B 取证）。

第一轮 probe（probe_city_panel.py）实锤：DOM 点击城市 chip 不可行
（面板里的城市根本不是可 find 的文本节点，「郑州成功」点中的其实是
顶部 cur-city-label 账号定位标签）。Plan B：BOSS 搜索页支持 URL 参数
表达城市（用户手动筛选后的 URL：?query=AI Agent&city=100010000&jobType=1902&degree=203）。

本 probe 验证：
1. 单城 URL（&city=101180100 郑州）→ URL 是否保留、拉回的岗位是否郑州；
2. 双城逗号 URL（&city=101180100,101020100 郑州+上海）→ 是否有效（多选）；
3. 三城逗号 → 同上；
4. dump 城市代码在页面上的映射线索（方便后续维护城市代码表）。

用法：
    uv run python scripts/probe/probe_city_url.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from boss_zhipin.website_oper import finding_jobs  # noqa: E402

BASE = "https://www.zhipin.com/web/geek/jobs?query=AI%20%E5%AE%9E%E4%B9%A0"

# 城市代码（BOSS 公开 URL 参数形态，若不对 dump 会立刻看出来）
CITY_CODE_ZZ = "101180100"  # 郑州
CITY_CODE_SH = "101020100"  # 上海
CITY_CODE_BJ = "101010100"  # 北京

# 拉当前页面前 10 个岗位卡的城市字段 + 当前 URL + 顶部 cur-city-label
JS_STATE = r"""
() => {
  const cities = [];
  document.querySelectorAll('.job-card-wrapper, [class*="job-card"]').forEach((c, i) => {
    if (i >= 10) return;
    const area = c.querySelector('[class*="job-area"], .job-area');
    if (area) cities.push((area.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30));
  });
  return JSON.stringify({
    url: location.href,
    curCityLabel: document.querySelector('.cur-city-label')?.innerText?.trim() || '',
    cardCities: cities,
    apiHint: (document.body.innerText || '').slice(0, 0),
  });
}
"""


async def try_url(tag: str, url: str) -> None:
    tab = finding_jobs.get_tab()
    await tab.get(url)
    await asyncio.sleep(4)
    state = await finding_jobs._safe_evaluate(f"({JS_STATE})()")
    print(f"\n===== [{tag}] =====")
    print(f"  请求 URL: {url}")
    print(f"  实际 URL: {state.get('url')}")
    print(f"  顶部当前城市标签: {state.get('curCityLabel')!r}")
    cards = state.get("cardCities") or []
    print(f"  前 10 个岗位卡城市: {cards}")


async def main() -> int:
    await finding_jobs.open_browser_with_options(BASE, "chrome")

    await try_url("单城：郑州", f"{BASE}&city={CITY_CODE_ZZ}")
    await try_url("双城：郑州,上海", f"{BASE}&city={CITY_CODE_ZZ},{CITY_CODE_SH}")
    await try_url("三城：郑州,上海,北京", f"{BASE}&city={CITY_CODE_ZZ},{CITY_CODE_SH},{CITY_CODE_BJ}")
    await try_url("回单城：郑州（验证 URL 可反复切换）", f"{BASE}&city={CITY_CODE_ZZ}")

    print("\n[probe] 结束。把输出发给 AI：若双城/三城 URL 保留且岗位卡出现对应城市，"
          "城市筛选改为 URL 直填方案成立。")
    await finding_jobs.shutdown()
    return 0


if __name__ == "__main__":
    import nodriver as uc

    raise SystemExit(uc.loop().run_until_complete(main()))
