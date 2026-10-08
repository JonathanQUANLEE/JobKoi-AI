"""51job 翻页调研：抓分页按钮/链接结构。"""

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
OUT = ROOT / "logs" / "job51_probe5.txt"

JS = r"""
(() => {
  const out = { url: location.href };
  // 分页元素
  const pager = document.querySelector('[class*=pager], [class*=pagination], .el-pagination, [class*=page]');
  out.pagerHTML = pager ? pager.outerHTML.slice(0, 1200) : 'NONE';
  // 分页链接
  out.pageLinks = [...document.querySelectorAll('a[class*=page], [class*=pager] a, .el-pagination a, a[class*=num]')].slice(0,15).map(a => ({text:(a.textContent||'').trim(), href:(a.href||'').slice(0,140)}));
  // 下一页按钮
  const next = [...document.querySelectorAll('a,button')].find(e => /下一页|下一頁/.test(e.textContent||''));
  out.nextBtn = next ? {text:(next.textContent||'').trim(), cls:(next.className||'').toString(), href:(next.href||'').slice(0,140)} : null;
  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)
    tab = await browser.get("https://we.51job.com/pc/search?keyword=AI%20Agent", new_window=True)
    try:
        await tab.activate(); await tab.bring_to_front()
    except Exception:
        pass
    await asyncio.sleep(12)
    result = await tab.evaluate(JS)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
