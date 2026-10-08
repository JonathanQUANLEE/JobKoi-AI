"""前程无忧(51job)登录：打开登录页（默认扫码登录）→ 截图二维码 → 等用户扫码。

登录态落在 job51_profile，之后投递模块免登录。
登录成功判据：URL 离开 login.51job.com（登录后跳回回调页/首页）。
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import nodriver as uc
from nodriver import Config

PROFILE = str(ROOT / "job51_profile")
LOGIN_URL = "https://login.51job.com/login.php?lang=c"
QR_PNG = ROOT / "logs" / "job51_qrcode.png"
WAIT = int(os.environ.get("JOB51_LOGIN_WAIT", "1200"))


def _log(msg: str) -> None:
    print(msg, flush=True)


async def _graceful_close(browser) -> None:
    """CDP 优雅关闭，确保 cookie 落盘（nodriver 的 stop() 是强杀，cookie 会丢）。"""
    try:
        from nodriver import cdp

        await browser.connection.send(cdp.browser.close())
        _log("[login] CDP 优雅关闭（cookie 落盘）")
    except Exception as e:  # noqa: BLE001
        _log(f"[login] CDP 关闭失败（{e}），退回 terminate")
        try:
            browser.stop()
        except Exception:  # noqa: BLE001
            pass
    await asyncio.sleep(4)


async def _is_logged_in(tab) -> bool:
    """登录成功判据：URL 已离开 login.51job.com。"""
    url = str(getattr(tab, "url", "") or "")
    return "login.51job.com" not in url and "login" not in url.split("/")[-1]


async def main() -> int:
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
    await asyncio.sleep(8)

    if await _is_logged_in(tab):
        _log("[login] 已登录，无需扫码")
        await _graceful_close(browser)
        return 0

    # 截图二维码（51job 登录页默认就是扫码登录）
    try:
        await tab.save_screenshot(str(QR_PNG))
        _log(f"[login] 二维码已存 {QR_PNG}")
    except Exception as e:  # noqa: BLE001
        _log(f"[login] 截图失败（{e}）")

    _log("[login] >>> 请用「前程无忧 App 或微信」扫浏览器窗口里的二维码，并在手机确认登录 <<<")
    _log(f"[login] 等待登录...（最多 {WAIT} 秒）")

    deadline = asyncio.get_event_loop().time() + WAIT
    last_shot = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() < deadline:
        if await _is_logged_in(tab):
            await asyncio.sleep(2)
            await tab.get("https://we.51job.com")
            await asyncio.sleep(4)
            if await _is_logged_in(tab):
                _log("[login] 登录成功！正在保存登录态...")
                await _graceful_close(browser)
                _log("[login] 登录态已保存到 job51_profile")
                return 0
        now = asyncio.get_event_loop().time()
        if now - last_shot > 60:
            try:
                await tab.save_screenshot(str(QR_PNG))
                last_shot = now
            except Exception:  # noqa: BLE001
                pass
        await asyncio.sleep(3)
    _log("[login] 登录超时")
    await _graceful_close(browser)
    return 1


if __name__ == "__main__":
    raise SystemExit(uc.loop().run_until_complete(main()))
