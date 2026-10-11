"""猎聘详情页调研：打开一个岗位详情页，抓沟通/投递按钮的确切结构。"""

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

PROFILE = str(ROOT / "liepin_profile")
DETAIL_URL = "https://www.liepin.com/job/1985011505.shtml"
OUT = ROOT / "logs" / "liepin_probe3.txt"

JS = r"""
(() => {
  const out = { url: location.href, webdriver: navigator.webdriver };
  out.bodyHead = (document.body && document.body.innerText || '').slice(0, 700);

  // 含沟通/投递/申请/聊 等短文本的可点元素
  out.btns = [...document.querySelectorAll('button, a, span, div, i')].filter(el => {
    const t = (el.textContent || '').trim();
    return t && t.length <= 10 && /沟通|投递|申请|聊|打招呼|立即|开聊|收藏|简历/.test(t);
  }).slice(0, 40).map(el => ({
    tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), text: (el.textContent || '').trim(),
  }));

  // 操作区常见 class
  out.operate = [...document.querySelectorAll('[class*=btn], [class*=operate], [class*=apply], [class*=deliver], [class*=chat], [class*=im], [class*=communicate], [class*=greet]')].slice(0, 40).map(el => ({
    tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), text: (el.textContent || '').trim().slice(0, 20),
  }));

  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)

    tab = await browser.get(DETAIL_URL, new_window=True)
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(10)

    result = await tab.evaluate(JS)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    shot = str(ROOT / "logs" / "liepin_detail.png")
    try:
        await tab.save_screenshot(shot)
    except Exception:  # noqa: BLE001
        pass
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
