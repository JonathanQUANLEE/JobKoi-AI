"""猎聘登录：打开登录页 → 切"扫码登录" → 截图二维码 → 等用户扫码。

登录态落在 liepin_profile，之后投递模块免登录。
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

PROFILE = str(ROOT / "liepin_profile")
LOGIN_URL = "https://www.liepin.com/login"
HOME_URL = "https://www.liepin.com/"
QR_PNG = ROOT / "logs" / "liepin_qrcode.png"
WAIT = int(os.environ.get("LIEPIN_LOGIN_WAIT", "900"))


def _log(msg: str) -> None:
    print(msg, flush=True)


async def _graceful_close(browser) -> None:
    """优雅关闭浏览器，确保 cookie 落盘。

    nodriver 的 ``browser.stop()`` 用的是 ``process.terminate()``（SIGTERM 强杀），
    不会触发 Chrome 把 cookie flush 到磁盘——实测 BOSS 靠"投递时浏览器持续运行、
    Chrome 定期自动 flush"才没丢，而登录脚本登录成功就 stop，cookie 全丢。

    正确做法：先走 CDP ``Browser.close``（优雅关闭，Chrome 会 flush cookie），
    失败再退回 terminate。
    """
    try:
        from nodriver import cdp

        await browser.connection.send(cdp.browser.close())
        _log("[login] 已通过 CDP 优雅关闭浏览器（cookie 落盘）")
    except Exception as e:  # noqa: BLE001
        _log(f"[login] CDP 优雅关闭失败（{e}），退回 terminate")
        try:
            browser.stop()
        except Exception:  # noqa: BLE001
            pass
    await asyncio.sleep(4)


async def _is_logged_in(tab) -> bool:
    """登录成功的可靠判据：URL 已离开 /login，且页面顶部不再有"登录/注册"。

    之前用 `body.slice(0,300)` 判断会漏检（导航文字位置不定），导致误判"已登录"。
    """
    try:
        txt = await tab.evaluate("(document.body && document.body.innerText || '')")
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    url = str(getattr(tab, "url", "") or "")
    on_login_page = "/login" in url
    has_login_entry = "登录/注册" in txt[:1000]
    return (not on_login_page) and (not has_login_entry)


async def main() -> int:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)

    tab = await browser.get(HOME_URL, new_window=True)
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(6)

    # 如果已经登录（首页右上角是用户名而非"登录/注册"），直接返回
    if await _is_logged_in(tab):
        _log("[login] 已登录，无需扫码")
        await _graceful_close(browser)
        return 0

    # 未登录 → 跳到登录页
    await tab.get(LOGIN_URL)
    await asyncio.sleep(4)

    # 截图当前登录页（二维码或扫码入口）
    try:
        await tab.save_screenshot(str(QR_PNG))
        _log(f"[login] 登录页截图已存 {QR_PNG}")
    except Exception as e:  # noqa: BLE001
        _log(f"[login] 截图失败（{e}）")

    _log("[login] >>> 请在浏览器窗口里手动登录：切到'扫码登录'，用猎聘App扫码，并在手机上点'确认登录' <<<")

    _log(f"[login] 等待登录...（最多 {WAIT} 秒）")
    deadline = asyncio.get_event_loop().time() + WAIT
    last_shot = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() < deadline:
        if await _is_logged_in(tab):
            # 再等 2 秒并访问首页二次确认，避免"跳转但未真正登录"的假阳性
            await asyncio.sleep(2)
            await tab.get("https://www.liepin.com")
            await asyncio.sleep(4)
            if await _is_logged_in(tab):
                _log("[login] 登录成功！正在保存登录态...")
                await _graceful_close(browser)
                _log("[login] 登录态已保存到 liepin_profile")
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
