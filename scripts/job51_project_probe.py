"""51job 简历中心 - 项目经历编辑入口调研：找"项目经历"的编辑/添加按钮。"""

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
OUT = ROOT / "logs" / "job51_project_edit_probe.txt"

JS = r"""
(() => {
  const out = {};
  // 所有含"编辑/添加/新增"的可点元素
  out.editBtns = [...document.querySelectorAll('a,button,span,div,i')].map(e => ({
    tag: e.tagName, cls: (e.className||'').toString().slice(0,70),
    text: (e.textContent||'').trim().slice(0,14),
    id: e.id || '',
  })).filter(x => x.text && /^编辑$|^添加$|新增|^修改$/.test(x.text)).slice(0, 40);

  // "项目经历"文字所在容器
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    if ((node.textContent||'').trim() === '项目经历') {
      let el = node.parentElement;
      for (let i = 0; i < 4 && el && el.parentElement; i++) el = el.parentElement;
      out.projectSectionHTML = el ? el.outerHTML.slice(0, 3000) : '';
      break;
    }
  }
  // 所有按钮的 class 统计
  out.btnClasses = [...new Set([...document.querySelectorAll('button,a[class*=btn],[class*=edit]')].map(e=>(e.className||'').toString()).filter(Boolean))].slice(0, 30);
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

    try:
        result = await asyncio.wait_for(tab.evaluate(JS), timeout=20)
    except Exception as e:  # noqa: BLE001
        result = f"EVAL_FAIL: {type(e).__name__}"
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)
    try:
        browser.stop()
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
