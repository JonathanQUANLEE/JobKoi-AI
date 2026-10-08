"""51job 简历编辑：登录 + 抓简历中心结构（单次导航，nodriver 0.50.x 兼容版）。

流程：启动 → 打开简历中心 → 检查登录（未登录则扫码）→ 抓结构 → 输出。
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

from job51 import driver  # noqa: E402

PROFILE = str(ROOT / "job51_profile")
RESUME_CENTER = "https://i.51job.com/resume/resume_center.php?lang=c"
LOGIN_URL = "https://login.51job.com/login.php?lang=c"
QR_PNG = ROOT / "logs" / "job51_qrcode.png"
OUT = ROOT / "logs" / "job51_resume_center.txt"
LOGIN_WAIT = int(os.environ.get("JOB51_LOGIN_WAIT", "600"))

JS = r"""
(() => {
  const out = { url: location.href, title: document.title };
  out.bodyText = (document.body && document.body.innerText || '').slice(0, 2500);
  out.links = [...document.querySelectorAll('a')].map(a => ({t:(a.textContent||'').trim().slice(0,25), href:(a.href||'').slice(0,150)}))
    .filter(x => /项目|经历|编辑|修改|工作|教育|技能|自我|resume/i.test(x.t + x.href)).slice(0, 40);
  out.iframes = [...document.querySelectorAll('iframe')].map(f => (f.src||'').slice(0,150));
  return JSON.stringify(out, null, 2);
})()
"""


def _log(msg: str) -> None:
    print(msg, flush=True)


async def _is_logged_in(tab) -> bool:
    url = str(getattr(tab, "url", "") or "")
    return "login" not in url and "passport" not in url


async def _safe_get(tab, url: str, wait: int = 10) -> None:
    """导航（带超时保护，页面卡加载也不阻塞）。"""
    try:
        await asyncio.wait_for(tab.get(url), timeout=35)
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001
        pass
    await asyncio.sleep(wait)


async def main() -> int:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    cfg.sandbox = False
    os.makedirs(PROFILE, exist_ok=True)
    driver.cleanup_profile()

    _log("[resume] 启动浏览器...")
    browser = await uc.start(config=cfg)
    _log("[resume] 打开简历中心...")
    tab = await browser.get(RESUME_CENTER, new_window=True)
    await asyncio.sleep(10)

    logged = await _is_logged_in(tab)
    _log(f"[resume] 登录态: {logged}  url={str(tab.url)[:80]}")

    if not logged:
        _log("[resume] 未登录，跳转登录页...")
        await _safe_get(tab, LOGIN_URL, wait=6)
        try:
            await tab.save_screenshot(str(QR_PNG))
            _log(f"[resume] 二维码已存 {QR_PNG}")
        except Exception as e:  # noqa: BLE001
            _log(f"[resume] 截图失败（{e}）")
        _log("[resume] >>> 请扫码登录（改简历要登录） <<<")
        deadline = asyncio.get_event_loop().time() + LOGIN_WAIT
        while asyncio.get_event_loop().time() < deadline:
            if await _is_logged_in(tab):
                _log("[resume] 登录成功！")
                await _safe_get(tab, RESUME_CENTER, wait=10)
                break
            await asyncio.sleep(3)
        else:
            _log("[resume] 登录超时")
            try:
                browser.stop()
            except Exception:  # noqa: BLE001
                pass
            return 1

    # 抓简历中心结构
    _log("[resume] 抓取简历中心结构...")
    await asyncio.sleep(3)
    try:
        result = await asyncio.wait_for(tab.evaluate(JS), timeout=20)
    except (asyncio.TimeoutError, Exception) as e:  # noqa: BLE001
        result = None
        _log(f"[resume] evaluate 失败（{type(e).__name__}）")

    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    Path(OUT).write_text(text or "(no result)", encoding="utf-8")
    print(text, flush=True)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_resume_center.png"))
    except Exception:  # noqa: BLE001
        pass
    _log(f"[resume] 结构已存 {OUT}")
    try:
        browser.stop()
    except Exception:  # noqa: BLE001
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(uc.loop().run_until_complete(main()))
