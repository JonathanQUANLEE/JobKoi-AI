"""前程无忧(51job)自动化：nodriver 浏览器操作原语。

51job 比猎聘简单：投递直接在**搜索页**点 `button.btn.apply`（"投递"），
不用进详情页。已投的岗位按钮会变"已申请"（`.btn.apply.active`），天然去重信号。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from urllib.parse import quote

import nodriver as uc
from nodriver import Config

from boss_zhipin.platforms.session_cleanup import reap_profile_chrome

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent.parent
PROFILE_DIR = os.path.abspath(
    os.environ.get("JOB51_CHROME_PROFILE", str(ROOT / "job51_profile"))
)
SEARCH_TMPL = "https://we.51job.com/pc/search?keyword={kw}"

_browser: uc.Browser | None = None
_tab: uc.Tab | None = None

# 解析搜索页卡片：jobId / 标题 / 公司 / 标签（实习/校招）/ 是否已投
PARSE_CARDS_JS = r"""
(() => {
  const out = [];
  document.querySelectorAll('.joblist-item').forEach(c => {
    const sd = (c.querySelector('[sensorsdata]')?.getAttribute('sensorsdata') || '');
    let jobId = '', title = '', jobLabel = '';
    try {
      const d = JSON.parse(sd.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      jobId = d.jobId || ''; title = d.jobTitle || ''; jobLabel = d.jobLabel || '';
    } catch (e) {}
    const btn = c.querySelector('button.btn.apply');
    const applied = btn ? btn.classList.contains('active') : false;
    const coLink = c.querySelector('a[href*="jobs.51job.com"]');
    const company = ((coLink && coLink.textContent) || '').trim().split(/\s+/)[0] || '';
    out.push({ jobId, title, company, jobLabel, applied, hasBtn: !!btn });
  });
  return JSON.stringify(out);
})()
"""

# 按 jobId 精确点击对应卡片的"投递"按钮（避免点到社招岗）
CLICK_BY_ID_JS = r"""
(jobId) => {
  const cards = document.querySelectorAll('.joblist-item');
  for (const c of cards) {
    const sd = (c.querySelector('[sensorsdata]')?.getAttribute('sensorsdata') || '');
    let jid = '';
    try { jid = JSON.parse(sd.replace(/&quot;/g, '"').replace(/&amp;/g, '&')).jobId || ''; } catch (e) {}
    if (jid === jobId) {
      const btn = c.querySelector('button.btn.apply');
      if (btn && !btn.classList.contains('active')) {
        btn.click();
        return JSON.stringify({ clicked: true, jobId: jid });
      }
      return JSON.stringify({ clicked: false, applied: true });
    }
  }
  return JSON.stringify({ clicked: false, notFound: true });
}
"""


def cleanup_profile() -> None:
    reap_profile_chrome(PROFILE_DIR)


async def open_browser(url: str) -> uc.Tab:
    global _browser, _tab
    os.makedirs(PROFILE_DIR, exist_ok=True)
    cleanup_profile()
    cfg = Config()
    cfg.user_data_dir = PROFILE_DIR
    cfg.headless = False
    cfg.sandbox = False  # Chrome 154 + nodriver 0.50.x 下更稳
    _browser = await uc.start(config=cfg)
    _tab = await _browser.get(url, new_window=True)
    try:
        await _tab.activate()
        await _tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(8)
    return _tab


async def is_logged_in(tab: uc.Tab) -> bool:
    url = str(getattr(tab, "url", "") or "")
    return "login.51job.com" not in url


async def parse_cards(tab: uc.Tab) -> list[dict]:
    raw = await tab.evaluate(PARSE_CARDS_JS)
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


async def goto_search(tab: uc.Tab, keyword: str) -> list[dict]:
    await tab.get(SEARCH_TMPL.format(kw=quote(keyword)))
    await asyncio.sleep(8)
    return await parse_cards(tab)


async def _check_captcha(tab: uc.Tab) -> bool:
    try:
        txt = await tab.evaluate("(document.body && document.body.innerText || '')")
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    return any(k in txt for k in ("安全验证", "滑块", "拖动", "验证码", "请完成验证", "行为验证"))


async def check_limit_alert(tab: uc.Tab) -> bool:
    """检测页面是否弹出「今日投递次数已达上限」提示（平台限额）。"""
    from boss_zhipin.platforms.platform_limits import match_limit_alert

    try:
        txt = await tab.evaluate("(document.body && document.body.innerText || '')")
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    return match_limit_alert("job51", txt) is not None


NEXT_PAGE_JS = r"""
(() => {
  const btn = document.querySelector('button.btn-next');
  if (!btn || btn.disabled) return JSON.stringify({ ok: false });
  btn.click();
  return JSON.stringify({ ok: true });
})()
"""


async def next_page(tab: uc.Tab) -> bool:
    """点"下一页"，返回是否成功（False = 没有下一页了）。"""
    raw = await tab.evaluate(NEXT_PAGE_JS)
    try:
        ok = json.loads(raw).get("ok", False)
    except (json.JSONDecodeError, TypeError):
        return False
    if ok:
        await asyncio.sleep(5)  # 等列表刷新
    return ok


async def apply_by_jobid(tab: uc.Tab, job_id: str) -> dict:
    """按 jobId 精确点对应岗位的"投递"按钮，返回 {clicked, jobId} / {captcha}。"""
    if await _check_captcha(tab):
        return {"clicked": False, "captcha": True}
    js = f"({CLICK_BY_ID_JS})({json.dumps(job_id)})"
    raw = await tab.evaluate(js)
    try:
        result = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"clicked": False}
    return result


# ============ 登录态持久化：CDP 导出/注入 cookie ============
# 51job 的 JSESSIONID 是会话 cookie（关浏览器即丢），但只要服务端 session 没过期，
# 把登录后的全部 cookie 用 CDP 导出存盘、下次启动注入回去，登录态就能跨进程恢复。

COOKIE_FILE = ROOT / "logs" / "job51_cookies.json"


async def export_cookies(tab: uc.Tab, path: Path | None = None) -> int:
    """导出当前全部 cookie（含会话 cookie）到 JSON，返回条数。"""
    from nodriver import cdp

    path = path or COOKIE_FILE
    try:
        cookies = await tab.send(cdp.network.get_all_cookies())
    except Exception:  # noqa: BLE001
        return 0
    data = []
    for c in cookies:
        data.append({
            "name": c.name, "value": c.value, "domain": c.domain, "path": c.path,
            "expires": c.expires, "httpOnly": bool(c.http_only), "secure": bool(c.secure),
            "sameSite": c.same_site.value if c.same_site else None,
        })
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return len(data)


async def import_cookies(tab: uc.Tab, path: Path | None = None) -> int:
    """从 JSON 注入 cookie 到当前浏览器，返回成功条数。"""
    from nodriver import cdp

    path = path or COOKIE_FILE
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return 0
    ok = 0
    for c in data:
        try:
            same = None
            if c.get("sameSite"):
                try:
                    same = cdp.network.CookieSameSite(c["sameSite"])
                except ValueError:
                    same = None
            await tab.send(cdp.network.set_cookie(
                name=c["name"], value=c["value"], domain=c["domain"], path=c.get("path") or "/",
                secure=bool(c.get("secure")), http_only=bool(c.get("httpOnly")),
                expires=c.get("expires"), same_site=same,
            ))
            ok += 1
        except Exception:  # noqa: BLE001
            continue
    return ok
