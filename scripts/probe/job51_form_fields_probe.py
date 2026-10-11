"""51job 新增项目经历表单：抓输入框/描述框/保存按钮的精确结构。"""

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
OUT = ROOT / "logs" / "job51_form_fields.txt"

JS = r"""
(() => {
  const out = { inputs: [], textareas: [], selects: [], saveBtns: [] };
  // 所有可见 input
  document.querySelectorAll('input').forEach(i => {
    const r = i.getBoundingClientRect();
    if (r.width === 0) return;
    out.inputs.push({
      ph: i.placeholder || '', type: i.type || '', cls: (i.className||'').toString().slice(0,60),
      id: i.id || '', maxlen: i.maxLength,
      y: Math.round(r.top),
    });
  });
  document.querySelectorAll('textarea').forEach(t => {
    const r = t.getBoundingClientRect();
    out.textareas.push({ ph: t.placeholder||'', cls:(t.className||'').toString().slice(0,60), id:t.id||'', y:Math.round(r.top), maxlen: t.maxLength });
  });
  // 保存/确认按钮
  [...document.querySelectorAll('button,.el-button,span,div')].forEach(e => {
    const t = (e.textContent||'').trim();
    if (/^(保存|提交|确定|确认)$/.test(t)) {
      const r = e.getBoundingClientRect();
      if (r.width > 0) out.saveBtns.push({ tag: e.tagName, text: t, cls: (e.className||'').toString().slice(0,70), y: Math.round(r.top) });
    }
  });
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

    # 点新增
    try:
        await tab.evaluate(r"""
        (() => {
          const sec = document.getElementById('ProjectExperience');
          let b = sec ? sec.querySelector('.projectEdit') : null;
          if (!b) b = document.querySelector('.projectEdit');
          if (b) b.click();
          return 'ok';
        })()
        """)
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(3)
    # 关提示
    try:
        await tab.evaluate(r"""
        (() => {
          const b = [...document.querySelectorAll('button,.el-button,span')].find(e => /我知道了/.test((e.textContent||'').trim()));
          if (b) { b.click(); return 'd'; }
          return 'n';
        })()
        """)
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(3)
    # 滚到表单
    try:
        await tab.evaluate(r"""
        (() => {
          const el = [...document.querySelectorAll('div')].find(d => /新增项目经历/.test(d.textContent||'') && d.querySelector('input'));
          if (el) el.scrollIntoView({block:'center'});
          return 'ok';
        })()
        """)
        await asyncio.sleep(2)
    except Exception:  # noqa: BLE001
        pass

    try:
        result = await asyncio.wait_for(tab.evaluate(JS), timeout=15)
    except Exception as e:  # noqa: BLE001
        result = f"FAIL {type(e).__name__}"
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    Path(OUT).write_text(text, encoding="utf-8")
    print(text, flush=True)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_form_fields.png"))
    except Exception:  # noqa: BLE001
        pass
    try:
        browser.stop()
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
