"""登录状态判定、微信扫码等待与验证码检测。"""
from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)

# BOSS 登录页直达 URL（平台中心「换号/登录」与主循环未登录兜底共用）
BOSS_LOGIN_URL = "https://www.zhipin.com/web/user/?ka=header-login"


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


async def log_in() -> bool:
    """识别登录状态；未登录则**直达登录页**弹出扫码，等用户登录。

    Returns:
        True=已登录（可直接开始跑）；False=等待超时仍未登录（调用方应提示用户）。
    """
    from boss_zhipin.website_oper import finding_jobs

    if await finding_jobs._is_logged_in():
        log.info("检测到已登录（profile: %s），跳过扫码", finding_jobs.CHROME_PROFILE_DIR)
        return True

    tab = finding_jobs._tab
    if tab is None:
        return False
    log.info("未登录（cookie 失效或首次使用）— 导航到登录页: %s", BOSS_LOGIN_URL)
    await tab.get(BOSS_LOGIN_URL)
    await finding_jobs._wait_url_stable(stable_for=2.0, timeout=15)

    try:
        wechat_btn = await tab.find("微信", best_match=True, timeout=10)
        if wechat_btn:
            await wechat_btn.click()
            log.info("已点击微信登录入口，请扫码...")
        else:
            log.warning("未自动点上微信入口，请在登录页手动选择登录方式")
    except Exception as e:
        log.warning("查找微信入口出错（%s），请手动选择登录方式", e)

    log.info("等待扫码登录... (最多 300 秒)")
    deadline = asyncio.get_event_loop().time() + 300
    while asyncio.get_event_loop().time() < deadline:
        if await finding_jobs._is_logged_in():
            log.info("登录成功！cookie 已写入 profile，下次跑应该不用再扫")
            return True
        await asyncio.sleep(2)
    log.warning("登录超时，请确认是否已扫码登录")
    return False


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
