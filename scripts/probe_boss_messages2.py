"""BOSS 消息页 iframe 深度探查（probe 的第二步）。

probe_boss_messages.py 发现：主文档只有空态壳（.chat-no-data），但顶部导航
显示「消息 21」——会话列表/聊天输入框在 iframe 里。本脚本枚举 iframe 并
尝试读同源 iframe 的 contentDocument。

用法::

    uv run python scripts/probe_boss_messages2.py
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
OUT_PATH = ROOT / "output" / "boss_messages_probe2.json"

PROBE_JS = r"""
JSON.stringify((() => {
  const out = { iframes: [], conversations: [], buttons: [], inputs: [] };
  const frames = Array.from(document.querySelectorAll('iframe'));
  out.iframeCount = frames.length;
  for (const frame of frames) {
    const info = { src: frame.src || '(no src)', className: String(frame.className).slice(0, 80) };
    try {
      const doc = frame.contentDocument;
      if (!doc) { info.sameOrigin = false; out.iframes.push(info); continue; }
      info.sameOrigin = true;
      // 会话列表项（BOSS 历史版本：li.item-chat）
      const items = Array.from(doc.querySelectorAll('li[class*="chat"], .item-chat, [class*="conversation-item"]'));
      info.itemCount = items.length;
      for (const item of items.slice(0, 15)) {
        const text = (item.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
        const unreadEl = item.querySelector('[class*="unread"], [class*="badge"], [class*="dot"]');
        out.conversations.push({
          iframeSrc: info.src.slice(0, 80),
          className: String(item.className).slice(0, 100),
          text,
          unreadText: unreadEl ? ((unreadEl.innerText || '') + '|' + String(unreadEl.className).slice(0, 60)) : '',
          outerHTMLHead: item.outerHTML.slice(0, 500),
        });
      }
      // 聊天区按钮与输入框
      for (const el of Array.from(doc.querySelectorAll('button, a')).slice(0, 80)) {
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (text && text.length <= 20) {
          out.buttons.push({ text: text.slice(0, 20), className: String(el.className).slice(0, 80) });
        }
      }
      for (const el of Array.from(doc.querySelectorAll('textarea, [contenteditable="true"]'))) {
        out.inputs.push({ tag: el.tagName, className: String(el.className).slice(0, 80), placeholder: el.getAttribute('placeholder') || '' });
      }
    } catch (e) {
      info.error = String(e);
    }
    out.iframes.push(info);
  }
  return out;
})())
"""


async def main() -> int:
    await finding_jobs.open_browser_with_options(CHAT_URL, "chrome")
    await asyncio.sleep(8)

    tab = finding_jobs.get_tab()
    if tab is None:
        print("!! 没有 tab")
        return 1
    print(f"==> URL: {tab.url}")

    raw = await tab.evaluate(PROBE_JS)
    data = json.loads(raw) if isinstance(raw, str) else raw
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"==> 已写入 {OUT_PATH}")

    print("\n===== 摘要 =====")
    print(f"iframe 数量: {data.get('iframeCount', 0)}")
    for info in data.get("iframes", []):
        print("  iframe:", info.get("src", "")[:80], "| sameOrigin:", info.get("sameOrigin"), "| items:", info.get("itemCount"))
    convs = data.get("conversations", [])
    print(f"会话条目: {len(convs)}")
    for conv in convs[:8]:
        print("  -", (conv.get("text") or "")[:70], "| unread:", repr(conv.get("unreadText", "")))
    print("按钮样本:", [b["text"] for b in data.get("buttons", [])[:20]])
    print("输入框:", data.get("inputs", []))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
