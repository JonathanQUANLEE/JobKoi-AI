"""BOSS 消息页 API 发现（probe 第三步）。

前两步结论：会话列表不在主文档（空态壳）也不在 iframe（空）——大概率
通过 XHR 拉取。本脚本 dump ``performance.getEntriesByType('resource')``
里的 XHR/fetch URL，找出消息列表的真实接口（参照 job_api.py 走 wapi
直读的先例），同时再 dump 一次会话容器（等更久看懒加载）。

用法::

    uv run python scripts/probe_boss_messages3.py
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

CHAT_URL = "https://www.zhipin.com/web/geek/chat"
OUT_PATH = ROOT / "output" / "boss_messages_probe3.json"

PROBE_JS = r"""
JSON.stringify((() => {
  const out = { apiUrls: [], conversationText: '', chatBoxHTML: '' };
  for (const e of performance.getEntriesByType('resource')) {
    if (e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch') {
      out.apiUrls.push(e.name.slice(0, 220));
    }
  }
  const conv = document.querySelector('.chat-conversation, [class*="chat-list"]');
  if (conv) {
    out.conversationText = (conv.innerText || '').replace(/\s+/g, ' ').slice(0, 1200);
    out.chatBoxHTML = conv.outerHTML.slice(0, 4000);
  }
  return out;
})())
"""


async def main() -> int:
    await finding_jobs.open_browser_with_options(CHAT_URL, "chrome")
    print("==> 等待 15s 让消息列表加载...")
    await asyncio.sleep(15)

    tab = finding_jobs.get_tab()
    if tab is None:
        print("!! 没有 tab")
        return 1

    raw = await tab.evaluate(PROBE_JS)
    data = json.loads(raw) if isinstance(raw, str) else raw
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"==> 已写入 {OUT_PATH}")

    print("\n===== XHR/fetch 接口 =====")
    for url in data.get("apiUrls", []):
        print(" ", url)
    print("\n===== 会话容器文本 =====")
    print((data.get("conversationText") or "(空)")[:600])
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
