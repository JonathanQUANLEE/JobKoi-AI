"""前程无忧(51job)结构调研：打开搜索页，dump 登录态、岗位卡片、投递按钮结构。"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import nodriver as uc
from nodriver import Config

PROFILE = str(ROOT / "job51_profile")
SEARCH_URL = "https://we.51job.com/pc/search?keyword=AI%20Agent"
OUT = ROOT / "logs" / "job51_probe.txt"

JS = r"""
(() => {
  const out = { url: location.href, title: document.title, webdriver: navigator.webdriver };
  out.bodyText = (document.body && document.body.innerText || '').slice(0, 1500);

  // 岗位卡片候选选择器
  const sels = [
    '[class*=joblist]', '[class*=job-list]', '[class*=j_joblist]', '.j_joblist',
    '[class*=joblist_item]', '.joblist_item', '.e', '[class*=card]', 'li',
  ];
  out.cardHits = {};
  for (const s of sels) out.cardHits[s] = document.querySelectorAll(s).length;

  // 投递/沟通按钮
  out.btns = [...document.querySelectorAll('a,button,span,div')].map(e => ({
    tag: e.tagName, cls: (e.className || '').toString().slice(0, 50), text: (e.textContent || '').trim().slice(0, 16),
  })).filter(x => x.text && x.text.length <= 10 && /沟通|申请|投递|聊|立即/.test(x.text)).slice(0, 30);

  // 登录入口
  out.loginEntry = (document.body && document.body.innerText || '').includes('登录');

  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)
    tab = await browser.get(SEARCH_URL, new_window=True)
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(12)

    result = await tab.evaluate(JS)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_search.png"))
    except Exception:  # noqa: BLE001
        pass
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
