"""决定性诊断：在登录态页面里直接调 BOSS 搜索接口，看 page=1/2/3 返回的岗位是否不同。"""

import sys

import nodriver as uc

CHROME_PROFILE = r"B:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\chrome_profile"
URL = (
    "https://www.zhipin.com/web/geek/jobs?city=100010000&jobType=1902"
    "&degree=203&industry=100021,100005,100028"
)

API_JS_TEMPLATE = """
(() => {{
  const x = new XMLHttpRequest();
  x.open('GET', '/wapi/zpgeek/search/joblist.json?scene=1&sortType=0&default=1&city=100010000&jobType=1902&degree=203&industry=100021,100005,100028&page={page}&pageSize=30', false);
  x.send();
  try {{
    const j = JSON.parse(x.responseText);
    const d = j.zpData || {{}};
    const list = d.jobList || [];
    return JSON.stringify({{
      code: j.code,
      message: j.message,
      total: d.count,
      hasMore: d.hasMore,
      jobCount: list.length,
      first3: list.slice(0, 3).map(x => x.jobName + '|' + x.brandName),
    }});
  }} catch (e) {{
    return JSON.stringify({{error: String(e), status: x.status, body: x.responseText.slice(0, 120)}});
  }}
}})()
"""


async def main() -> None:
    browser = await uc.start(user_data_dir=CHROME_PROFILE)
    tab = await browser.get(URL)
    await tab.sleep(8)
    for page in (1, 2, 3):
        raw = await tab.evaluate(API_JS_TEMPLATE.format(page=page))
        print(f"=== API page={page} ===")
        print(raw)
        await tab.sleep(1)
    browser.stop()
    sys.exit(0)


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
