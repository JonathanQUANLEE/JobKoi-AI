"""51job 项目经历"新增"弹窗调研：点击 .projectEdit，抓表单字段结构。"""

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
OUT = ROOT / "logs" / "job51_project_form.txt"

CLICK_ADD_JS = r"""
(() => {
  // 项目经历区块的"新增"按钮
  const sec = document.getElementById('ProjectExperience');
  let btn = sec ? sec.querySelector('.projectEdit') : null;
  if (!btn) btn = document.querySelector('.projectEdit');
  if (!btn) return JSON.stringify({clicked: false, reason: 'no .projectEdit'});
  btn.click();
  return JSON.stringify({clicked: true, cls: btn.className, text: (btn.textContent||'').trim()});
})()
"""

FORM_JS = r"""
(() => {
  const dlg = document.querySelector('.el-dialog, .el-drawer, [class*=dialog]');
  if (!dlg) return JSON.stringify({dialog: false, bodyText: (document.body.innerText||'').slice(0,600)});
  const out = { dialog: true, html: dlg.outerHTML.slice(0, 6000) };
  out.inputs = [...dlg.querySelectorAll('input,textarea,select')].map(i => ({
    tag: i.tagName, type: i.type||'', placeholder: i.placeholder||'', name: i.name||'', cls: (i.className||'').toString().slice(0,50),
  }));
  out.labels = [...dlg.querySelectorAll('label,[class*=label],[class*=title]')].map(e=>(e.textContent||'').trim().slice(0,20)).filter(Boolean).slice(0,30);
  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    cfg.sandbox = False
    driver.cleanup_profile()
    browser = await uc.start(config=cfg)
    tab = await browser.get(RESUME_CENTER, new_window=True)
    await asyncio.sleep(12)

    # 先滚动到项目经历区块，再点新增
    try:
        await tab.evaluate("document.getElementById('ProjectExperience')?.scrollIntoView({block:'center'})")
        await asyncio.sleep(2)
    except Exception:  # noqa: BLE001
        pass

    try:
        r = await asyncio.wait_for(tab.evaluate(CLICK_ADD_JS), timeout=15)
        print("CLICK:", r, flush=True)
    except Exception as e:  # noqa: BLE001
        print("CLICK_FAIL:", type(e).__name__, flush=True)

    await asyncio.sleep(5)
    try:
        result = await asyncio.wait_for(tab.evaluate(FORM_JS), timeout=15)
    except Exception as e:  # noqa: BLE001
        result = f"EVAL_FAIL: {type(e).__name__}"
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    Path(OUT).write_text(text, encoding="utf-8")
    print(text, flush=True)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_project_form.png"))
    except Exception:  # noqa: BLE001
        pass
    try:
        browser.stop()
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
