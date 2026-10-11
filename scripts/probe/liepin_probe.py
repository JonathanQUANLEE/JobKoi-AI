"""猎聘网页结构调研：用 nodriver 打开猎聘搜索页，dump DOM 结构和岗位卡片。

目的：搞清楚猎聘的岗位列表 DOM、沟通/投递按钮、登录墙，为写 liepin 投递模块做准备。
用独立 profile（liepin_profile），跟 BOSS 的 chrome_profile 隔离。
"""

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
SEARCH_URL = "https://www.liepin.com/zhaopin/?key=AI%20Agent"
OUT = ROOT / "logs" / "liepin_probe.txt"
OUT2 = ROOT / "logs" / "liepin_probe2.txt"

JS_PROBE = r"""
(() => {
  const out = { url: location.href, title: document.title, webdriver: navigator.webdriver };

  // jobCard 卡片的实际 class 名（去重）
  const cls = new Set();
  document.querySelectorAll('[class*=jobCard]').forEach(el => {
    (el.className || '').toString().split(/\s+/).forEach(c => c && cls.add(c));
  });
  out.jobCardClasses = [...cls].slice(0, 40);
  out.jobCardCount = document.querySelectorAll('[class*=jobCard]').length;

  // 第一个卡片的外层 HTML（看结构和链接/按钮）
  const first = document.querySelector('[class*=jobCard]');
  out.firstCardHTML = first ? first.outerHTML.slice(0, 2500) : null;

  // 卡片内的 <a> 链接
  out.links = [...document.querySelectorAll('[class*=jobCard] a')].slice(0, 15).map(a => ({
    href: (a.href || '').slice(0, 120),
    text: (a.textContent || '').trim().slice(0, 40),
    cls: (a.className || '').toString().slice(0, 50),
  }));

  // 卡片内所有按钮/可点元素（找"沟通/投递"按钮，可能 hover 才显示或用了图标）
  out.cardBtns = [...document.querySelectorAll('[class*=jobCard] button, [class*=jobCard] [class*=btn], [class*=jobCard] [class*=chat], [class*=jobCard] [class*=apply], [class*=jobCard] [class*=deliver]')].slice(0, 20).map(b => ({
    tag: b.tagName, cls: (b.className || '').toString().slice(0, 60), text: (b.textContent || '').trim().slice(0, 20),
  }));

  return JSON.stringify(out, null, 2);
})()
"""


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    browser = await uc.start(config=cfg)

    tab = await browser.get(SEARCH_URL, new_window=True)
    try:
        await tab.activate()
        await tab.bring_to_front()
    except Exception as e:  # noqa: BLE001
        print("activate fail:", e)

    print("waiting page load...")
    await asyncio.sleep(12)

    result = await tab.evaluate(JS_PROBE)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)

    # 补一次截图
    shot = str(ROOT / "logs" / "liepin_probe.png")
    try:
        await tab.save_screenshot(shot)
        print("screenshot:", shot)
    except Exception as e:  # noqa: BLE001
        print("screenshot fail:", e)

    Path(OUT2).write_text(text, encoding="utf-8")
    print("=== PROBE2 RESULT ===")
    print(text)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
