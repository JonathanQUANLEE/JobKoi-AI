"""51job 项目经历编辑：点新增 → 关提示 → 抓真正的编辑表单。"""

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
OUT = ROOT / "logs" / "job51_project_form2.txt"

STEPS = [
    # 1. 点项目经历的新增
    ("click_add", r"""
    (() => {
      const sec = document.getElementById('ProjectExperience');
      let btn = sec ? sec.querySelector('.projectEdit') : null;
      if (!btn) btn = document.querySelector('.projectEdit');
      if (!btn) return 'NO_BTN';
      btn.click();
      return 'CLICKED';
    })()
    """),
    # 2. 关掉"我知道了"类提示
    ("dismiss", r"""
    (() => {
      const btns = [...document.querySelectorAll('button,.el-button,span')];
      const b = btns.find(e => /我知道了|确定|知道了/.test((e.textContent||'').trim()));
      if (b) { b.click(); return 'DISMISSED:' + (b.textContent||'').trim(); }
      return 'NO_DISMISS';
    })()
    """),
    # 3. 抓所有可见弹窗
    ("grab", r"""
    (() => {
      const out = { url: location.href, visibleDialogs: [] };
      document.querySelectorAll('.el-dialog__wrapper,.el-drawer__wrapper,[class*=dialog]').forEach(w => {
        const st = (w.getAttribute('style')||'') + (getComputedStyle(w).display||'');
        if (/none/.test(st)) return;
        const dlg = w.querySelector('.el-dialog,.el-drawer') || w;
        out.visibleDialogs.push({ html: dlg.outerHTML.slice(0, 5000) });
      });
      out.bodyText = (document.body.innerText||'').slice(0, 800);
      return JSON.stringify(out, null, 2);
    })()
    """),
]


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    cfg.sandbox = False
    driver.cleanup_profile()
    browser = await uc.start(config=cfg)
    tab = await browser.get(RESUME_CENTER, new_window=True)
    await asyncio.sleep(12)

    logs = []
    for name, js in STEPS:
        try:
            r = await asyncio.wait_for(tab.evaluate(js), timeout=15)
            logs.append(f"### {name}: {r}")
            print(f"### {name}", flush=True)
            print(r if not isinstance(r, str) or len(r) < 400 else r[:400], flush=True)
        except Exception as e:  # noqa: BLE001
            logs.append(f"### {name}: FAIL {type(e).__name__}")
            print(f"### {name} FAIL {type(e).__name__}", flush=True)
        await asyncio.sleep(4)

    Path(OUT).write_text("\n\n".join(str(x) for x in logs), encoding="utf-8")
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_project_form2.png"))
    except Exception:  # noqa: BLE001
        pass
    try:
        browser.stop()
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
