"""登录状态判定、微信扫码等待与验证码检测。"""
from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)


def _on_login_page(url: str) -> bool:
    return any(s in url for s in ("/web/user/", "passport-zp", "/login"))


def _is_logged_in_from_page_state(url: str, info: dict) -> bool:
    """从 URL + DOM 探测结果判断登录态。"""
    if _on_login_page(url):
        return False
    if info.get("loginWallVisible"):
        return False
    if info.get("headerLoginVisible"):
        return False
    if info.get("loginRequiredVisible"):
        return False
    return True


async def _is_logged_in() -> bool:
    """判定登录态：URL + DOM 双 check。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return False
    if _on_login_page(tab.url):
        return False

    js = """
    JSON.stringify((() => {
      const visible = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const wall = document.querySelector(
        '[class*="login-dialog"], [class*="boss-login"], '
        + '[class*="loginDialog"], [class*="login-wrap"]'
      );
      const headerLogin = document.querySelector(
        '.header-login-btn, a[ka="header-login"], [ka="guide_login_btn_click"], '
        + '.guide-login-btn, .zp-job-list-login-card'
      );
      const bodyText = document.body ? document.body.innerText || '' : '';
      return {
        loginWallVisible: visible(wall),
        headerLoginVisible: visible(headerLogin),
        loginRequiredVisible: bodyText.includes('登录查看完整内容')
          || bodyText.includes('登录账号，查看更多好职位')
      };
    })());
    """
    info = await finding_jobs._safe_evaluate(js, timeout=5)
    logged_in = _is_logged_in_from_page_state(tab.url, info)
    if not logged_in:
        log.info("页面上有未登录信号 %s → 判未登录，走扫码", info)
        return False
    return True


async def _wait_url_stable(stable_for: float = 2.0, timeout: float = 30) -> str:
    """等到 tab.url 连续 stable_for 秒不变，避开 BOSS 登录页的重定向抖动。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return ""
    end = asyncio.get_event_loop().time() + timeout
    last_url = tab.url
    last_change = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() < end:
        cur = tab.url
        now = asyncio.get_event_loop().time()
        if cur != last_url:
            last_url = cur
            last_change = now
        elif now - last_change >= stable_for:
            return cur
        await asyncio.sleep(0.2)
    return last_url


async def log_in() -> None:
    """识别登录状态；未登录则点开微信扫码，等用户扫码登录。"""
    from boss_zhipin.website_oper import finding_jobs

    if await finding_jobs._is_logged_in():
        log.info("检测到已登录（profile: %s），跳过扫码", finding_jobs.CHROME_PROFILE_DIR)
        return

    tab = finding_jobs._tab
    if tab is None:
        return
    cur_url = tab.url
    log.info("log_in 入口 URL: %s", cur_url)

    if not _on_login_page(cur_url):
        try:
            login_btn = await tab.find("登录", best_match=True, timeout=15)
            if login_btn:
                await login_btn.click()
                log.info("已点击 header 登录入口")
                await finding_jobs._wait_url_stable(stable_for=2.0, timeout=15)
        except Exception as e:
            log.warning("找不到 header 登录入口（%s），尝试直接在当前页找微信入口", e)

    try:
        wechat_btn = await tab.find("微信", best_match=True, timeout=10)
        if wechat_btn:
            await wechat_btn.click()
            log.info("已点击微信登录入口，请扫码...")
        else:
            log.warning("未自动点上微信入口，请在浏览器里手动选择登录方式")
    except Exception as e:
        log.warning("查找微信入口出错（%s），请手动选择登录方式", e)

    log.info("等待扫码登录... (最多 300 秒)")
    deadline = asyncio.get_event_loop().time() + 300
    while asyncio.get_event_loop().time() < deadline:
        if await finding_jobs._is_logged_in():
            log.info("登录成功！cookie 已写入 profile，下次跑应该不用再扫")
            return
        await asyncio.sleep(2)
    log.warning("登录超时，请确认是否已扫码登录")


async def captcha_visible() -> bool:
    """保守检测验证码/安全校验页；命中时主流程停止，不做绕过。"""
    from boss_zhipin.website_oper import finding_jobs

    result = await finding_jobs._safe_evaluate(
        """
        JSON.stringify((() => {
          const text = document.body ? document.body.innerText || '' : '';
          return {text};
        })())
        """,
        timeout=5,
    )
    text = str(result.get("text") or "")
    return any(word in text for word in ("验证码", "安全验证", "拖动滑块", "完成验证"))
