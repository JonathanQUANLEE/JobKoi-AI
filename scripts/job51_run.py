"""前程无忧登录+投递一条龙（同一个浏览器 session）。

51job 登录靠 JSESSIONID（会话 cookie），浏览器一关就失效，所以**登录和投递
必须在同一个浏览器进程里完成**。这个脚本：
1. 开浏览器 → 搜索页，检查登录态
2. 未登录 → 跳登录页、截图二维码、等扫码（不关浏览器）
3. 登录成功 → 直接在同一 session 里投递（复用 tab）
4. 投完优雅关闭

跟 job51_login.py + job51_invest.py 分离式的区别：那两个会中途关浏览器，JSESSIONID 丢。
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import nodriver as uc
from nodriver import Config

from job51 import driver, apply

LOGIN_URL = "https://login.51job.com/login.php?lang=c"
QR_PNG = ROOT / "logs" / "job51_qrcode.png"
LOGIN_WAIT = int(os.environ.get("JOB51_LOGIN_WAIT", "900"))
DAILY_LIMIT = int(os.environ.get("JOB51_DAILY_LIMIT", "40"))


def _log(msg: str) -> None:
    print(msg, flush=True)


async def _graceful_close(browser) -> None:
    try:
        from nodriver import cdp

        await browser.connection.send(cdp.browser.close())
        _log("[job51] CDP 优雅关闭")
    except Exception:  # noqa: BLE001
        try:
            browser.stop()
        except Exception:  # noqa: BLE001
            pass
    await asyncio.sleep(3)


async def main() -> int:
    cfg = Config()
    cfg.user_data_dir = driver.PROFILE_DIR
    cfg.headless = False
    cfg.sandbox = False  # Chrome 154 + nodriver 0.50.x 下更稳
    os.makedirs(driver.PROFILE_DIR, exist_ok=True)
    driver.cleanup_profile()
    browser = await uc.start(config=cfg)

    tab = await browser.get(driver.SEARCH_TMPL.format(kw="AI Agent"), new_window=True)
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(8)

    # 未登录 → 跳登录页等扫码（不关浏览器）
    if not await driver.is_logged_in(tab):
        await tab.get(LOGIN_URL)
        await asyncio.sleep(5)
        try:
            await tab.save_screenshot(str(QR_PNG))
            _log(f"[job51] 二维码已存 {QR_PNG}")
        except Exception as e:  # noqa: BLE001
            _log(f"[job51] 截图失败（{e}）")

        _log("[job51] >>> 请用「前程无忧 App 或微信」扫码，并在手机确认登录 <<<")
        deadline = asyncio.get_event_loop().time() + LOGIN_WAIT
        last_shot = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() < deadline:
            if await driver.is_logged_in(tab):
                _log("[job51] 登录成功！")
                break
            now = asyncio.get_event_loop().time()
            if now - last_shot > 60:
                try:
                    await tab.save_screenshot(str(QR_PNG))
                    last_shot = now
                except Exception:  # noqa: BLE001
                    pass
            await asyncio.sleep(3)
        else:
            _log("[job51] 登录超时")
            await _graceful_close(browser)
            return 1

    # 登录成功 → 同一 session 直接投递
    _log("[job51] 登录就绪，开始投递计算机相关岗位（不限实习）...")
    await apply.run(apply.DEFAULT_KEYWORDS, DAILY_LIMIT, tab=tab)

    await _graceful_close(browser)
    return 0


if __name__ == "__main__":
    raise SystemExit(uc.loop().run_until_complete(main()))
