"""BOSS 消息页 DOM 探查（F3 回复检测的前置调研）。

用法::

    uv run python scripts/probe_boss_messages.py

打开受控 Chrome（复用 chrome_profile 登录态）→ 跳转
``https://www.zhipin.com/web/geek/chat`` → dump 会话列表结构、未读标记、
最新消息文本、聊天区按钮 → 写 ``output/boss_messages_probe.json``。

S8 的 message_check.py 基于这里的实测选择器实现；探查失败则 F3 降级为
「提醒 + 手动打开消息页」。
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
OUT_PATH = ROOT / "output" / "boss_messages_probe.json"

PROBE_JS = r"""
JSON.stringify((() => {
  const out = { url: location.href, conversations: [], buttons: [], inputs: [], notes: [] };
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // 1) 会话列表：BOSS 历史版本用 li.item-chat / .chat-item；宽匹配 li 元素里带时间或未读点的
  const selectors = ['.item-chat', 'li[class*="chat"]', '[class*="conversation"]', '.chat-list li'];
  let items = [];
  for (const sel of selectors) {
    const found = Array.from(document.querySelectorAll(sel)).filter(visible);
    if (found.length > 0) { items = found; out.notes.push('selector hit: ' + sel + ' x' + found.length); break; }
  }
  for (const item of items.slice(0, 12)) {
    const text = (item.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const unreadEl = item.querySelector('[class*="unread"], [class*="badge"], [class*="dot"], .red-dot');
    out.conversations.push({
      className: item.className,
      text,
      unreadText: unreadEl ? (unreadEl.innerText || unreadEl.className) : '',
      outerHTMLHead: item.outerHTML.slice(0, 400),
    });
  }
  // 2) 页面上全部可见按钮/链接文本（找“发简历 / 发送”）
  for (const el of Array.from(document.querySelectorAll('button, a')).filter(visible).slice(0, 60)) {
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text) out.buttons.push({ text: text.slice(0, 40), className: String(el.className).slice(0, 80) });
  }
  // 3) 聊天输入框
  for (const el of Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).filter(visible)) {
    out.inputs.push({ tag: el.tagName, className: String(el.className).slice(0, 80) });
  }
  return out;
})())
"""


async def main() -> int:
    print("==> 打开受控 Chrome（复用 chrome_profile 登录态）")
    await finding_jobs.open_browser_with_options(CHAT_URL, "chrome")
    await asyncio.sleep(6)

    tab = finding_jobs.get_tab()
    if tab is None:
        print("!! 没有 tab，退出")
        return 1
    print(f"==> 当前 URL: {tab.url}")
    if "/web/geek/chat" not in (tab.url or ""):
        print("!! 没有落在消息页（可能未登录/被重定向），先扫码登录后重跑")

    raw = await tab.evaluate(PROBE_JS)
    data = json.loads(raw) if isinstance(raw, str) else raw
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"==> 已写入 {OUT_PATH}")

    print("\n===== 摘要 =====")
    for note in data.get("notes", []):
        print("note:", note)
    convs = data.get("conversations", [])
    print(f"会话条目: {len(convs)}")
    for conv in convs[:5]:
        print("  -", conv.get("text", "")[:80], "| unread:", repr(conv.get("unreadText", "")))
    print("按钮（含'发简历/发送'相关）:")
    for btn in data.get("buttons", []):
        if any(k in btn["text"] for k in ("简历", "发送", "沟通", "附件", "文件")):
            print("  *", btn["text"], "|", btn["className"][:60])
    print("输入框:", data.get("inputs", []))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
