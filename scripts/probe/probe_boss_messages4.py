"""BOSS 消息列表 API 结构探查（probe 第四步，F3 的实现依据）。

probe3 发现会话列表走 ``/wapi/zprelation/friend/getGeekFriendList.json``。
本脚本在登录态页面上下文里 fetch 该接口，dump 返回 JSON 的字段结构
（未读数 / 最新消息 / boss 名字 / 会话 ID），供 message_check.py 实现。

用法::

    uv run python scripts/probe_boss_messages4.py
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
OUT_PATH = ROOT / "output" / "boss_messages_probe4.json"

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
  const friend = get('/wapi/zprelation/friend/getGeekFriendList.json');
  out.friendListStatus = friend.status;
  out.friendListBody = friend.body.slice(0, 6000);
  return out;
})())
"""


def _summarize(data: dict) -> None:
    body = data.get("friendListBody", "")
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        print("friendList 返回非完整 JSON（被截断），前 500 字符：")
        print(body[:500])
        return
    print(f"code={parsed.get('code')} zpData keys: {list((parsed.get('zpData') or {}).keys())}")
    zp = parsed.get("zpData") or {}
    for key, value in zp.items():
        if isinstance(value, list) and value:
            print(f"\n列表字段 {key!r}: {len(value)} 条，首条字段: {list(value[0].keys())}")
            print("首条内容:", json.dumps(value[0], ensure_ascii=False)[:600])
        elif isinstance(value, dict):
            print(f"dict 字段 {key!r}: {list(value.keys())[:20]}")


async def main() -> int:
    await finding_jobs.open_browser_with_options(CHAT_URL, "chrome")
    await asyncio.sleep(8)

    tab = finding_jobs.get_tab()
    if tab is None:
        print("!! 没有 tab")
        return 1

    raw = await tab.evaluate(PROBE_JS)
    data = json.loads(raw) if isinstance(raw, str) else raw
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"==> 已写入 {OUT_PATH}\n")
    _summarize(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
