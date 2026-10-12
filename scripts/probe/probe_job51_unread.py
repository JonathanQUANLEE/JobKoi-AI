"""前程无忧(51job)导航未读消息探测（2026-10-12 三平台并列 + 统计页未读需求）。

与 probe_liepin_unread.py 同款思路：BOSS 的未读数读取方案已落地
（导航 a[ka="header-message"] .nav-chat-num），51job 的未读入口需要
实测 dump DOM 后才能实现 check_new_replies 的多平台版。

用法（先扫码登录一次，cookie 落盘后免登）：
    uv run python scripts/job51_login.py          # 首次扫码
    uv run python scripts/probe/probe_job51_unread.py

脚本打开 51job 首页，dump 顶部导航「消息」入口附近的 DOM 结构与疑似
未读角标元素，输出供分析后实现 51job 的未读读取函数。
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from job51 import driver  # noqa: E402

PROBE_JS = r"""
(() => {
  const out = { url: location.href, candidates: [] };
  const snippet = (el) => ({
    tag: el.tagName,
    text: (el.innerText || '').trim().slice(0, 40),
    className: String(el.className || '').slice(0, 120),
    id: el.id || '',
    href: el.getAttribute('href') || '',
    html: el.outerHTML.slice(0, 300),
  });
  document.querySelectorAll('a, span, div, li').forEach((el) => {
    const t = (el.innerText || '').trim();
    if (!t || t.length > 8) return;
    if (t.includes('消息') || t.includes('求职信') || t.includes('通知')) {
      out.candidates.push({ kind: 'nav_text', ...snippet(el) });
      let scope = el;
      for (let i = 0; i < 2 && scope.parentElement; i++) scope = scope.parentElement;
      scope.querySelectorAll('*').forEach((b) => {
        const bt = (b.innerText || '').trim();
        if (bt && /^\d{1,3}$/.test(bt)) {
          out.candidates.push({ kind: 'badge_num', ...snippet(b) });
        }
        const cls = String(b.className || '');
        if (/badge|dot|unread|num/i.test(cls) && !out.candidates.some((c) => c.html === b.outerHTML.slice(0, 300))) {
          out.candidates.push({ kind: 'badge_class', ...snippet(b) });
        }
      });
    }
  });
  return JSON.stringify(out);
})()
"""


async def main() -> int:
    tab = await driver.open_browser("https://we.51job.com/")
    # 等页面加载出真实 URL（about:blank 加载态会被 is_logged_in 的守卫
    # 误判未登录——2026-10-13 实测：页面实际已登录却报"未登录"）
    await asyncio.sleep(4)
    if not await driver.is_logged_in(tab):
        print("[probe] 未登录！先跑 scripts/job51_login.py 扫码，再回来跑本脚本。")
        return 1
    await asyncio.sleep(3)
    raw = await tab.evaluate(PROBE_JS)
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        print("[probe] JS 返回解析失败：", raw)
        return 1
    print(f"[probe] URL: {data['url']}")
    print(f"[probe] 候选元素 {len(data['candidates'])} 个：")
    for c in data["candidates"]:
        print(f"  [{c['kind']}] <{c['tag']}> text={c['text']!r} class={c['className']!r} href={c['href']!r}")
        print(f"        html={c['html']}")
    print("\n[probe] 请把以上输出发给 AI：命中 badge_num / badge_class 的就是未读角标候选。")
    await driver.shutdown()
    return 0


if __name__ == "__main__":
    import nodriver as uc

    raise SystemExit(uc.loop().run_until_complete(main()))
