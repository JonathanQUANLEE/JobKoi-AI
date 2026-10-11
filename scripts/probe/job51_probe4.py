"""51job 实习岗调研：抓卡片 title/jobLabel/jobSource，识别"实习"和"校招跳转"标识。"""

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
OUT = ROOT / "logs" / "job51_probe4.txt"

JS = r"""
(() => {
  const out = { cards: [] };
  document.querySelectorAll('.joblist-item').forEach(c => {
    const sd = (c.querySelector('[sensorsdata]')?.getAttribute('sensorsdata') || '');
    let d = {};
    try { d = JSON.parse(sd.replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch (e) {}
    const text = (c.innerText || '');
    out.cards.push({
      jobId: d.jobId || '',
      title: d.jobTitle || '',
      jobLabel: d.jobLabel || '',
      jobType: d.jobType || '',
      jobSource: d.jobSource || '',
      hasIntern: /实习/.test(text),
      hasCampus: /校招|应届|校园/.test(text),
      hasYingjie: /yingjiesheng/.test((c.innerHTML || '')),
      btnText: (c.querySelector('button.btn.apply')?.textContent || '').trim(),
    });
  });
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
