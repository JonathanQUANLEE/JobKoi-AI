"""诊断 BOSS 搜索结果页的翻页机制：有没有分页按钮？滚动能不能加载更多？"""

import asyncio
import sys

import nodriver as uc

CHROME_PROFILE = r"B:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\chrome_profile"
URL = (
    "https://www.zhipin.com/web/geek/jobs?city=100010000&jobType=1902"
    "&degree=203&industry=100021,100005,100028"
)

DUMP_JS = """
(() => {
  const cards = document.querySelectorAll('.job-card-box');
  const pagers = [...document.querySelectorAll('[ka*="page"], .page, .ui-icon-arrow, [class*="pager"], [class*="pagination"]')];
  const nextBtns = [...document.querySelectorAll('a, li, button, div')].filter(el => {
    const t = (el.textContent || '').trim();
    return (t === '下一页' || t === ' next ' ) && el.offsetParent !== null;
  }).map(el => ({tag: el.tagName, cls: el.className.slice(0,80), ka: el.getAttribute('ka') || '', text: (el.textContent||'').trim().slice(0,20)}));
  return JSON.stringify({
    cardCount: cards.length,
    firstTitles: [...cards].slice(0, 3).map(c => (c.querySelector('.job-name') || c).textContent.trim().slice(0, 30)),
    pagerCount: pagers.length,
    pagerSample: pagers.slice(0, 3).map(p => ({tag: p.tagName, cls: String(p.className).slice(0, 80), text: (p.textContent || '').trim().slice(0, 60), visible: p.offsetParent !== null})),
    nextBtns: nextBtns.slice(0, 5),
  });
})()
"""


async def main() -> None:
    browser = await uc.start(user_data_dir=CHROME_PROFILE)
    tab = await browser.get(URL)
    await tab.sleep(5)

    raw = await tab.evaluate(DUMP_JS)
    print("=== 初始状态 ===")
    print(raw)

    # 滚动列表容器到底，看会不会加载更多
    scroll_js = """
    (() => {
      const cands = [...document.querySelectorAll('div')].filter(
        (el) => el.scrollHeight > el.clientHeight + 20 && el.querySelector('.job-card-box')
      );
      const target = cands[0] || document.scrollingElement;
      const before = target.scrollTop;
      target.scrollTop = target.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      return JSON.stringify({scrolled: target.scrollTop !== before, target: target.className.slice(0, 60)});
    })()
    """
    raw2 = await tab.evaluate(scroll_js)
    print("=== 滚动到底 ===")
    print(raw2)
    await tab.sleep(6)
    raw3 = await tab.evaluate(DUMP_JS)
    print("=== 滚动后状态 ===")
    print(raw3)

    # 尝试点击“下一页”按钮（如果存在）
    click_js = """
    (() => {
      const btn = [...document.querySelectorAll('a, li, button, div, i')].find(el => {
        const t = (el.textContent || '').trim();
        return t === '下一页' && el.offsetParent !== null;
      });
      if (!btn) return JSON.stringify({found: false});
      btn.scrollIntoView({block: 'center'});
      btn.click();
      return JSON.stringify({found: true, tag: btn.tagName, cls: String(btn.className).slice(0, 60), ka: btn.getAttribute('ka') || ''});
    })()
    """
    raw4 = await tab.evaluate(click_js)
    print("=== 点击下一页 ===")
    print(raw4)
    await tab.sleep(6)
    print("=== 点击后 URL ===")
    print(tab.url)
    raw5 = await tab.evaluate(DUMP_JS)
    print("=== 点击后状态 ===")
    print(raw5)

    browser.stop()
    sys.exit(0)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
