"""检查猎聘登录态到底怎么判。"""

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


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)
    tab = await browser.get("https://www.liepin.com/zhaopin/?key=AI%20Agent", new_window=True)
    await asyncio.sleep(8)
    out = await tab.evaluate(r"""
    (() => {
      const txt = document.body.innerText || '';
      return JSON.stringify({
        head300: txt.slice(0, 300),
        hasLoginReg: txt.includes('登录/注册'),
        hasLoginRegIdx: txt.indexOf('登录/注册'),
        cookie: (document.cookie || '').slice(0, 200),
        cookieLen: (document.cookie || '').length,
      }, null, 2);
    })()
    """)
    text = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False, indent=2)
    Path(ROOT / "logs" / "liepin_probe6.txt").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
