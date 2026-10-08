"""前程无忧投递按钮实测：抓岗位卡片 jobId 结构 + 点"投递"按钮看弹窗流程。"""

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
OUT = ROOT / "logs" / "job51_probe3.txt"

JS = r"""
(() => {
  const out = {};
  // 岗位卡片（joblist 开头的 class）
  const cards = document.querySelectorAll('[class*=joblist]');
  out.cardCount = cards.length;
  // 第一个卡片的 outerHTML（看 jobId 和投递按钮结构）
  if (cards[0]) out.firstCardHTML = cards[0].outerHTML.slice(0, 2500);
  // 所有投递按钮
  out.applyBtns = [...document.querySelectorAll('button.btn.apply')].slice(0, 10).map(b => ({
    text: (b.textContent||'').trim(),
    cls: (b.className||'').toString(),
    data: Object.fromEntries([...b.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name, a.value.slice(0,60)])),
  }));
  // 卡片里的链接（职位详情 URL）
  out.links = [...document.querySelectorAll('[class*=joblist] a')].slice(0,10).map(a=>({href:(a.href||'').slice(0,120), text:(a.textContent||'').trim().slice(0,30)}));
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
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
