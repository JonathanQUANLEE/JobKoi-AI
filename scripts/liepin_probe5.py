"""猎聘"聊一聊"弹窗实测：点开聊一聊，抓输入框/快捷招呼语/发送按钮结构（不发送）。"""

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

PROFILE = str(ROOT / "liepin_profile")
DETAIL_URL = "https://www.liepin.com/job/1985011505.shtml"
OUT = ROOT / "logs" / "liepin_probe5.txt"

JS = r"""
(() => {
  const out = {};
  out.inputs = [...document.querySelectorAll('textarea, [contenteditable=true], input[type=text]')].slice(0, 12).map(e => ({
    tag: e.tagName, cls: (e.className || '').toString().slice(0, 60),
    ph: (e.placeholder || ''), ce: e.getAttribute('contenteditable'),
  }));
  out.sendBtns = [...document.querySelectorAll('button, a, span, div')].map(e => ({
    t: (e.textContent || '').trim(), cls: (e.className || '').toString().slice(0, 60),
  })).filter(x => x.t && x.t.length <= 8 && /发送|立即|确定|提交/.test(x.t)).slice(0, 15);

  out.quickGreets = [...document.querySelectorAll('span,div,a,li,p')].map(e => (e.textContent || '').trim())
    .filter(t => t && t.length >= 4 && t.length <= 40 && /您好|我是|应聘|岗位|感兴趣|打招呼|期待/.test(t)).slice(0, 25);

  out.dialogText = (document.body && document.body.innerText || '').slice(-700);
  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)

    tab = await browser.get(DETAIL_URL, new_window=True)
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(8)

    # 点主按钮"聊一聊"
    try:
        btn = await tab.find("聊一聊", best_match=True, timeout=10)
        if btn:
            await btn.click()
            print("[probe] 已点聊一聊")
            await asyncio.sleep(4)
    except Exception as e:  # noqa: BLE001
        print("[probe] 点聊一聊失败：", e)

    result = await tab.evaluate(JS)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "liepin_chat.png"))
    except Exception:  # noqa: BLE001
        pass
    Path(OUT).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
