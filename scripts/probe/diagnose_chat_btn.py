"""最小诊断：详情页的沟通按钮到底长什么样。只读，不点击。"""

import sys

import nodriver as uc

CHROME_PROFILE = r"B:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\chrome_profile"
DETAIL_URL = "https://www.zhipin.com/job_detail/7ec3aeadc95a13e41H1y0tu6EVFY.html"

JS = """
(() => {
  const out = {btns: [], opBtns: [], jdLen: 0, jdCls: '', bodySample: ''};
  const walk = document.querySelectorAll('a, button, span, div');
  for (const el of walk) {
    const t = (el.textContent || '').trim();
    if ((t === '立即沟通' || t === '继续沟通') && el.children.length <= 2) {
      out.btns.push({tag: el.tagName, cls: String(el.className).slice(0, 80),
                     ka: el.getAttribute('ka') || '', text: t});
    }
  }
  document.querySelectorAll('.op-btn, [class*="op-btn"]').forEach(el => {
    out.opBtns.push({tag: el.tagName, cls: String(el.className).slice(0, 60),
                     text: (el.textContent || '').trim().slice(0, 12)});
  });
  const jd = document.querySelector('.job-sec-text');
  out.jdLen = jd ? jd.textContent.trim().length : 0;
  out.jdCls = jd ? String(jd.className) : '';
  out.bodySample = (document.body.innerText || '').slice(0, 150).replace(/\\n/g, '|');
  return JSON.stringify(out);
})()
"""


async def main() -> None:
    browser = await uc.start(user_data_dir=CHROME_PROFILE)
    tab = await browser.get(DETAIL_URL)
    await tab.sleep(10)
    raw = await tab.evaluate(JS)
    print("RESULT_START")
    print(raw)
    print("RESULT_END")
    browser.stop()
    sys.exit(0)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
