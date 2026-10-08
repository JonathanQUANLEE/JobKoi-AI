"""51job 项目经历表单：抓表单容器内的保存按钮。"""

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
OUT = ROOT / "logs" / "job51_form_btns.txt"


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
    r = await _ev(tab, r"""
    (() => {
      const sec = document.getElementById('ProjectExperience');
      let b = sec ? sec.querySelector('.projectEdit') : null;
      if (!b) b = document.querySelector('.projectEdit');
      if (b) { b.click(); return 'clicked'; }
      return 'no_btn';
    })()
    """)
    log.append(f"click_add: {r}")
    await asyncio.sleep(3)
    r = await _ev(tab, r"""
    (() => {
      const b = [...document.querySelectorAll('button,.el-button,span')].find(e => /我知道了/.test((e.textContent||'').trim()));
      if (b) { b.click(); return 'dismissed'; }
      return 'none';
    })()
    """)
    log.append(f"dismiss: {r}")
    await asyncio.sleep(3)

    # 定位"新增项目经历"表单容器，列出其中所有按钮 + 容器 HTML 尾部
    r = await _ev(tab, r"""
    (() => {
      // 找包含"新增项目经历"文字且含 input 的容器
      let box = null;
      for (const d of document.querySelectorAll('div')) {
        if (/新增项目经历/.test(d.textContent || '') && d.querySelector('input')) { box = d; break; }
      }
      if (!box) return JSON.stringify({found: false});
      // 往上找 3 层，拿更大的容器（含按钮）
      let cont = box;
      for (let i = 0; i < 3 && cont.parentElement; i++) cont = cont.parentElement;
      const btns = [...cont.querySelectorAll('button,.el-button,span,div')].filter(e => {
        const t = (e.textContent||'').trim();
        return t && t.length <= 6 && e.getBoundingClientRect().width > 0;
      }).map(e => ({tag: e.tagName, text: (e.textContent||'').trim(), cls: (e.className||'').toString().slice(0,60)}));
      return JSON.stringify({found: true, btns: btns.slice(0, 40)}, null, 2);
    })()
    """)
    log.append(f"form_btns:\n{r}")

    # 滚到表单并截图
    await _ev(tab, r"""
    (() => {
      for (const d of document.querySelectorAll('div')) {
        if (/新增项目经历/.test(d.textContent || '') && d.querySelector('input')) { d.scrollIntoView({block:'start'}); return 'ok'; }
      }
      return 'no';
    })()
    """)
    await asyncio.sleep(2)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_form_btns.png"))
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
