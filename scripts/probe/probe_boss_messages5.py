"""BOSS 未读消息数接口验证（probe 第五步，F3 提醒档的实现依据）。

架构结论（probe1-4）：BOSS chat 是 WebSocket 长连接架构，会话列表不走
简单 GET。但顶部导航「消息 N」的未读数来自 ``zpgeek/common/data/header.json``
——轮询它即可做「有新回复 → 通知」的提醒档（用户已选：提醒+跳转）。

用法::

    uv run python scripts/probe_boss_messages5.py
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
OUT_PATH = ROOT / "output" / "boss_messages_probe5.json"

PROBE_JS = r"""
JSON.stringify((() => {
  const get = (url) => {
    try {
      const x = new XMLHttpRequest();
      x.open('GET', url, false);
      x.send();
      return { status: x.status, body: x.responseText };
    } catch (e) {
      return { status: -1, body: String(e) };
    }
  };
  const out = {};
  const header = get('/wapi/zpgeek/common/data/header.json');
  out.headerStatus = header.status;
  out.headerBody = header.body.slice(0, 4000);
  return out;
})())
"""


async def main() -> int:
    await finding_jobs.open_browser_with_options(CHAT_URL, "chrome")
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

    try:
        parsed = json.loads(data.get("headerBody", ""))
        print(f"code={parsed.get('code')}")
        zp = parsed.get("zpData") or {}
        print(f"zpData keys: {list(zp.keys())[:20]}")
        # 找未读数字段
        text = json.dumps(zp, ensure_ascii=False)
        for key in ("unread", "message", "msg", "chat", "news"):
            print(f"\n含 {key!r} 的片段:")
            idx = 0
            shown = 0
            while shown < 3:
                idx = text.find(key, idx)
                if idx < 0:
                    break
                print("  ...", text[max(0, idx - 60) : idx + 120], "...")
                idx += len(key)
                shown += 1
    except json.JSONDecodeError:
        print("header.json 返回非完整 JSON：", data.get("headerBody", "")[:400])
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
