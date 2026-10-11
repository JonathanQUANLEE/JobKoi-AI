"""51job 简历编辑页调研：打开简历页，抓入口和结构。"""

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
OUT = ROOT / "logs" / "job51_resume_probe.txt"

JS = r"""
(() => {
  const out = { url: location.href, title: document.title };
  out.bodyText = (document.body && document.body.innerText || '').slice(0, 1500);
  out.links = [...document.querySelectorAll('a')].map(a => ({t:(a.textContent||'').trim().slice(0,20), href:(a.href||'').slice(0,120)}))
    .filter(x => /简历|resume|项目|编辑|个人/.test(x.t + x.href)).slice(0, 30);
  out.iframes = [...document.querySelectorAll('iframe')].map(f => (f.src||'').slice(0,120));
  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)
    tab = await browser.get("https://www.51job.com/my/resume", new_window=True)
    try:
        await tab.activate(); await tab.bring_to_front()
    except Exception:
        pass
    await asyncio.sleep(12)
    result = await tab.evaluate(JS)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_resume.png"))
    except Exception:
        pass
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
