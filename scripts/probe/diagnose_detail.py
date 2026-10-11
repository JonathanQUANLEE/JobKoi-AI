"""被动诊断：API 字段结构 + 滚动正确容器 + 岗位详情页关键元素。只读，不点击任何沟通按钮。"""

import sys

import nodriver as uc

CHROME_PROFILE = r"B:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\chrome_profile"
URL = (
    "https://www.zhipin.com/web/geek/jobs?city=100010000&jobType=1902"
    "&degree=203&industry=100021,100005,100028"
)

API_JS = """
(() => {
  const x = new XMLHttpRequest();
  x.open('GET', '/wapi/zpgeek/search/joblist.json?scene=1&sortType=0&default=1&city=100010000&jobType=1902&degree=203&industry=100021,100005,100028&page=1&pageSize=30', false);
  x.send();
  const j = JSON.parse(x.responseText);
  const list = (j.zpData || {}).jobList || [];
  const first = list[0] || {};
  return JSON.stringify({
    keys: Object.keys(first).slice(0, 40),
    sample: {jobName: first.jobName, encryptJobId: first.encryptJobId, brandName: first.brandName, salaryDesc: first.salaryDesc},
  });
})()
"""

SCROLL_JS = """
(() => {
  const ul = document.querySelector('ul.job-list-box') || document.querySelector('[class*="job-list"]');
  if (!ul) return JSON.stringify({found: false});
  let scrollable = null, el = ul;
  for (let i = 0; i < 6 && el; i++) {
    el = el.parentElement;
    if (el && el.scrollHeight > el.clientHeight + 50) { scrollable = el; break; }
  }
  if (!scrollable) return JSON.stringify({found: true, scrollable: false, cards: ul.querySelectorAll('.job-card-box').length});
  const before = scrollable.scrollTop;
  scrollable.scrollTop = scrollable.scrollHeight;
  return JSON.stringify({found: true, scrollable: true, cls: String(scrollable.className).slice(0,50), moved: scrollable.scrollTop !== before, cards: ul.querySelectorAll('.job-card-box').length});
})()
"""

DETAIL_JS = """
(() => {
  const btns = [...document.querySelectorAll('a, button, div, input')].filter(el => {
    const t = (el.textContent || el.value || '').trim();
    return t.includes('立即沟通') && el.offsetParent !== null;
  }).slice(0, 3).map(el => ({tag: el.tagName, cls: String(el.className).slice(0, 70)}));
  const jd = document.querySelector('.job-sec-text, [class*="job-detail"], .detail-content');
  const name = document.querySelector('.job-banner .name, [class*="job-name"], h1');
  return JSON.stringify({
    url: location.href.slice(0, 90),
    title: name ? name.textContent.trim().slice(0, 40) : null,
    chatBtns: btns,
    jdLen: jd ? jd.textContent.trim().length : 0,
    jdCls: jd ? String(jd.className).slice(0, 50) : null,
  });
})()
"""


async def main() -> None:
    browser = await uc.start(user_data_dir=CHROME_PROFILE)
    tab = await browser.get(URL)
    await tab.sleep(8)

    raw = await tab.evaluate(API_JS)
    print("=== API 字段 ===")
    print(raw)

    raw2 = await tab.evaluate(SCROLL_JS)
    print("=== 正确容器滚动 ===")
    print(raw2)
    await tab.sleep(6)
    count_js = "JSON.stringify({cards: document.querySelectorAll('.job-card-box').length})"
    print("=== 滚动后卡片数 ===")
    print(await tab.evaluate(count_js))

    # 从 API 取一个 encryptJobId，打开详情页（只读不点）
    detail_url = await tab.evaluate(
        """
        (() => {
          const x = new XMLHttpRequest();
          x.open('GET', '/wapi/zpgeek/search/joblist.json?scene=1&sortType=0&default=1&city=100010000&jobType=1902&degree=203&industry=100021,100005,100028&page=2&pageSize=30', false);
          x.send();
          const j = JSON.parse(x.responseText);
          const list = (j.zpData || {}).jobList || [];
          const it = list.find(z => z.encryptJobId);
          return it ? ('https://www.zhipin.com/job_detail/' + it.encryptJobId + '.html') : '';
        })()
        """
    )
    import json as _json
    try:
        detail_url = _json.loads(detail_url)
    except Exception:
        pass  # nodriver evaluate 已返回纯字符串 URL
    print("=== 详情页 URL ===")
    print(detail_url)
    if detail_url:
        tab2 = await browser.get(detail_url, new_tab=True)
        await tab2.sleep(8)
        raw3 = await tab2.evaluate(DETAIL_JS)
        print("=== 详情页元素 ===")
        print(raw3)
    browser.stop()
    sys.exit(0)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
