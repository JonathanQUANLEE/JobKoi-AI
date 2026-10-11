"""51job 项目时间选择器调研：点开日期面板，抓结构。"""

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

from job51 import driver  # noqa: E402

PROFILE = str(ROOT / "job51_profile")
RESUME_CENTER = "https://www.51job.com/resume/center?lang=c"
OUT = ROOT / "logs" / "job51_datepicker.txt"


async def _ev(tab, js, timeout=15):
    try:
        return await asyncio.wait_for(tab.evaluate(js), timeout=timeout)
    except Exception as e:  # noqa: BLE001
        return f"EVAL_FAIL:{type(e).__name__}"


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    cfg.sandbox = False
    driver.cleanup_profile()
    browser = await uc.start(config=cfg)
    tab = await browser.get(RESUME_CENTER, new_window=True)
    await asyncio.sleep(12)

    log = []
    log.append("add: " + str(await _ev(tab, r"""
    (() => {
      const sec = document.getElementById('ProjectExperience');
      let b = sec ? sec.querySelector('.projectEdit') : null;
      if (!b) b = document.querySelector('.projectEdit');
      if (b) { b.click(); return 'clicked'; }
      return 'no';
    })()
    """)))
    await asyncio.sleep(3)
    log.append("dismiss: " + str(await _ev(tab, r"""
    (() => {
      const b = [...document.querySelectorAll('button,.el-button,span')].find(e => /我知道了/.test((e.textContent||'').trim()));
      if (b) { b.click(); return 'd'; }
      return 'n';
    })()
    """)))
    await asyncio.sleep(3)

    # 点击"请选择"日期输入框
    log.append("click_date: " + str(await _ev(tab, r"""
    (() => {
      const el = [...document.querySelectorAll('input')].find(i => i.placeholder === '请选择' && i.getBoundingClientRect().width > 0);
      if (!el) return 'no_input';
      el.focus();
      el.click();
      const parent = el.closest('[class*=el-date], .el-input');
      return 'clicked, parentCls=' + (parent ? parent.className : '?');
    })()
    """)))
    await asyncio.sleep(3)

    # 抓日期面板
    grab = await _ev(tab, r"""
    (() => {
      const panels = [...document.querySelectorAll('.el-picker-panel,.el-date-picker,.el-popper,[class*=picker]')]
        .filter(p => p.getBoundingClientRect().width > 0);
      if (!panels.length) return JSON.stringify({found: false, body: (document.body.innerText||'').slice(0, 300)});
      const p = panels[0];
      return JSON.stringify({
        found: true,
        panelCls: p.className,
        html: p.outerHTML.slice(0, 4000),
      }, null, 2);
    })()
    """, timeout=15)
    log.append(f"panel:\n{grab}")

    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_datepicker.png"))
    except Exception:  # noqa: BLE001
        pass

    result = "\n".join(str(x) for x in log)
    Path(OUT).write_text(result, encoding="utf-8")
    print(result, flush=True)
    try:
        browser.stop()
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
