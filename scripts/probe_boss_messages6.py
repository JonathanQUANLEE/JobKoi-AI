"""BOSS 导航未读数验证（probe 第六步，F3 提醒档的最终实现依据）。

probe1-5 结论：chat 页会话列表走 WebSocket + 带 token 的接口 + 反自动化
检测，API 直读不可行。但**顶部导航「消息 N」文本本身携带未读总数**，且
导航在任意 BOSS 页面都存在——轮询它即可做「新回复 → 通知」。

本脚本验证：岗位推荐页（用户日常停留的页面）的导航是否同样带「消息 N」。

用法::

    uv run python scripts/probe_boss_messages6.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from boss_zhipin.website_oper import finding_jobs  # noqa: E402

RECOMMEND_URL = "https://www.zhipin.com/web/geek/job-recommend?ka=header-job-recommend"
OUT_PATH = ROOT / "output" / "boss_messages_probe6.json"

PROBE_JS = r"""
JSON.stringify((() => {
  // 导航「消息」入口：BOSS 顶栏的文本节点。宽匹配：找 innerText 以「消息」开头
  // 或单独「消息 N」形态的链接/按钮。
  const out = { url: location.href, navMessage: null, candidates: [] };
  for (const el of Array.from(document.querySelectorAll('a, span, div, li'))) {
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (/^消息(\s*\d+)?$/.test(text) || /^消息 \d+$/.test(text)) {
      out.candidates.push({
        text,
        tag: el.tagName,
        className: String(el.className).slice(0, 100),
        href: el.getAttribute('href') || '',
        outerHTMLHead: el.outerHTML.slice(0, 300),
      });
    }
  }
  // 最精确的一个：最内层（无子元素的）匹配
  const inner = out.candidates.filter((c) => c.outerHTMLHead.length < 250);
  out.navMessage = inner.length ? inner[0] : (out.candidates[0] || null);
  return out;
})())
"""


async def main() -> int:
    await finding_jobs.open_browser_with_options(RECOMMEND_URL, "chrome")
    await asyncio.sleep(6)

    tab = finding_jobs.get_tab()
    if tab is None:
        print("!! 没有 tab")
        return 1

    raw = await tab.evaluate(PROBE_JS)
    data = json.loads(raw) if isinstance(raw, str) else raw
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"==> 已写入 {OUT_PATH}\n")
    print(f"页面: {data.get('url')}")
    print(f"匹配候选数: {len(data.get('candidates', []))}")
    nav = data.get("navMessage")
    if nav:
        print(f"导航消息入口: text={nav['text']!r} tag={nav['tag']} href={nav.get('href', '')}")
        print("outerHTML:", nav["outerHTMLHead"][:200])
    else:
        print("!! 没找到「消息 N」导航元素")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
