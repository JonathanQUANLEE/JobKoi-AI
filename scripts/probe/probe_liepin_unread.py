"""猎聘导航未读消息探测（2026-10-12 三平台并列 + 统计页未读需求）。

背景：BOSS 的未读数读取方案已落地（导航 a[ka="header-message"] .nav-chat-num，
六轮 probe 实测见 probe_boss_messages1-6.py）。猎聘/前程无忧的未读要找到
各自的 DOM 入口才能实现 check_new_replies 的多平台版——本脚本是猎聘版。

用法（先扫码登录一次，profile 落盘后免登）：
    uv run python scripts/liepin_login.py          # 首次扫码
    uv run python scripts/probe/probe_liepin_unread.py

脚本打开猎聘首页，dump 顶部导航「消息」入口附近的 DOM 结构与疑似未读
角标元素（class 含 badge/dot/unread/num 或文本是纯数字的小元素），
输出供分析后实现 liepin 的未读读取函数。
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

from liepin import driver  # noqa: E402

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
  // 1) 文本含「消息」的导航/链接元素
  document.querySelectorAll('a, span, div, li').forEach((el) => {
    const t = (el.innerText || '').trim();
    if (!t || t.length > 8) return;
    if (t.includes('消息') || t.includes('沟通')) {
      out.candidates.push({ kind: 'nav_text', ...snippet(el) });
      // 2) 它附近（父级两层的后代）的疑似角标：纯数字文本的小元素
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
    tab = await driver.open_browser("https://www.liepin.com/")
    # 等页面加载出真实 URL（about:blank 加载态会误判未登录，与 51job probe 同理）
    await asyncio.sleep(4)
    if not await driver.is_logged_in(tab):
        print("[probe] 未登录！先跑 scripts/liepin_login.py 扫码，再回来跑本脚本。")
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
