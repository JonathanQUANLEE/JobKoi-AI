"""猎聘登录页调研：确认登录方式（扫码/手机号）、iframe、二维码位置。"""

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
LOGIN_URL = "https://www.liepin.com/login"
OUT = ROOT / "logs" / "liepin_probe4.txt"

JS = r"""
(() => {
  const out = { url: location.href };
  out.bodyText = (document.body && document.body.innerText || '').slice(0, 1000);
  out.iframes = [...document.querySelectorAll('iframe')].map(f => (f.src || '').slice(0, 120));
  out.qrImgs = [...document.querySelectorAll('img')].map(i => ({
    src: (i.src || '').slice(0, 120), w: i.naturalWidth, h: i.naturalHeight,
  })).filter(x => x.w >= 100 && x.h >= 100);
  out.loginTabs = [...document.querySelectorAll('a,button,div,span')].map(e => (e.textContent || '').trim())
    .filter(t => t && t.length <= 12 && /扫码|微信|手机号|密码|验证码|短信|账号/.test(t)).slice(0, 30);
  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)

    tab = await browser.get(LOGIN_URL, new_window=True)
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(9)

    result = await tab.evaluate(JS)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "liepin_login.png"))
    except Exception:  # noqa: BLE001
        pass
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
