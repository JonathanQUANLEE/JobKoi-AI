"""wapi 多城 city 参数格式取证（2026-10-12 code=19 定位）。

背景：城市改 URL 直填后 wapi 返回 code=19（接口拒绝）。嫌疑：多城逗号格式
不被 wapi 接受 / _security_check 参数污染 / 城市代码错。本 probe 在同一页面
上下文发对照 XHR，一次定位：

    A. 无 city（对照，历史成功形态）
    B. 单城 city=101180100（郑州，已实证页面 URL 有效）
    C. 双城 city=101180100,101020100（逗号多城）
    D. 三城逗号 + _security_check=当前页面 URL 里的值

用法：
    uv run python scripts/probe/probe_wapi_city.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from boss_zhipin.website_oper import finding_jobs, job_api  # noqa: E402

BASE_QUERY = "scene=1&sortType=0&default=1&query=AI%20agent%20%E5%AE%9E%E4%B9%A0"

SEARCH_URL = "https://www.zhipin.com/web/geek/jobs?query=AI%20agent%20%E5%AE%9E%E4%B9%A0"


async def try_query(tab, tag: str, extra: str) -> None:
    query = f"{BASE_QUERY}{extra}"
    try:
        jobs = await job_api.fetch_search_page(tab, query, 1)
        sample = [(j.city, j.job_name[:18]) for j in jobs[:3]]
        print(f"[{tag}] ✅ code=0，拉到 {len(jobs)} 个岗位，样例：{sample}")
    except RuntimeError as e:
        print(f"[{tag}] ❌ {e}")


async def main() -> int:
    await finding_jobs.open_browser_with_options(SEARCH_URL, "chrome")
    await asyncio.sleep(3)
    tab = finding_jobs.get_tab()

    # 取当前 URL 里的 _security_check（如果页面被注入了）
    url_now = finding_jobs.get_current_url()
    sec = ""
    if "_security_check=" in url_now:
        sec = "_security_check=" + url_now.split("_security_check=")[1].split("&")[0]
    print(f"[probe] 页面 URL: {url_now}")
    print(f"[probe] _security_check 参数: {sec!r}\n")

    await try_query(tab, "A 无 city（对照）", "")
    await asyncio.sleep(2.5)
    await try_query(tab, "B 单城 郑州", "&city=101180100")
    await asyncio.sleep(2.5)
    await try_query(tab, "C 双城 逗号", "&city=101180100%2C101020100")
    await asyncio.sleep(2.5)
    await try_query(tab, "D 三城 逗号", "&city=101180100%2C101020100%2C101010100")
    await asyncio.sleep(2.5)
    if sec:
        await try_query(tab, "E 无 city + _security_check", f"&{sec}")
    else:
        print("[E] 页面无 _security_check，跳过")

    print("\n[probe] 结束。输出发给 AI：B 成功而 C 失败 = wapi 不收多城逗号；")
    print("       B 也失败 = 城市代码或 wapi 对 city 参数本身有校验；全失败 = 会话被风控。")
    await finding_jobs.shutdown()
    return 0


if __name__ == "__main__":
    import nodriver as uc

    raise SystemExit(uc.loop().run_until_complete(main()))
