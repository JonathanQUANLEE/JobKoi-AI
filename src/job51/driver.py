"""前程无忧(51job)自动化：nodriver 浏览器操作原语。

51job 比猎聘简单：投递直接在**搜索页**点 `button.btn.apply`（"投递"），
不用进详情页。已投的岗位按钮会变"已申请"（`.btn.apply.active`），天然去重信号。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
from pathlib import Path
from urllib.parse import quote

import nodriver as uc
from nodriver import Config

from boss_zhipin.paths import get_platform_profile_dir
from boss_zhipin.platforms.browser_lookup import apply_browser_fallback
from boss_zhipin.platforms.session_cleanup import reap_profile_chrome

log = logging.getLogger(__name__)

# 注意：logs/cookie 导出等资源路径仍用 ROOT（__file__ 相对）；只有浏览器
# profile 走统一解析器（打包后 ROOT 指向安装目录，profile 必须去用户数据区）。
ROOT = Path(__file__).resolve().parent.parent.parent

# Profile 目录单一真相（2026-10-13 打包加固）：env 覆盖 > standalone
# %APPDATA%（防 Program Files UAC 只读炸 Cookie 落盘）> dev 仓库根
# job51_profile（历史位置，用户已登录 cookie 一分不动）。
# platforms/job51.py 的登录探测走同一函数，两边永远同源。
PROFILE_DIR = str(get_platform_profile_dir("job51"))
SEARCH_TMPL = "https://we.51job.com/pc/search?keyword={kw}"

_browser: uc.Browser | None = None
_tab: uc.Tab | None = None

# 解析搜索页卡片：jobId / 标题 / 公司 / 薪资 / 地点 / 链接 / 标签 / 是否已投
PARSE_CARDS_JS = r"""
(() => {
  const out = [];
  document.querySelectorAll('.joblist-item').forEach(c => {
    const sd = (c.querySelector('[sensorsdata]')?.getAttribute('sensorsdata') || '');
    let jobId = '', title = '', jobLabel = '', salary = '', location = '', href = '';
    try {
      const d = JSON.parse(sd.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      jobId = d.jobId || '';
      title = d.jobTitle || '';
      jobLabel = d.jobLabel || '';
      salary = d.jobSalary || '';
      location = d.jobArea || d.workArea || '';
    } catch (e) {}

    // DOM 提取兜底（51job 搜索页常用类名）
    if (!salary) {
      const salEl = c.querySelector('.sal, [class*="sal"], [class*="salary"]');
      if (salEl) salary = (salEl.textContent || '').trim();
    }
    if (!location) {
      const areaEl = c.querySelector('.area, [class*="area"], .joblist-item-top .area');
      if (areaEl) location = (areaEl.textContent || '').trim();
    }

    const btn = c.querySelector('button.btn.apply');
    const applied = btn ? btn.classList.contains('active') : false;
    const coLink = c.querySelector('a[href*="jobs.51job.com"]');
    const company = ((coLink && coLink.textContent) || '').trim().split(/\s+/)[0] || '';

    const jobLink = c.querySelector('a.jname, a[href*="jobs.51job.com"], a[href*="/job/"]');
    href = (jobLink && jobLink.href) || (jobId ? `https://jobs.51job.com/${jobId}.html` : '');

    out.push({ jobId, title, company, salary, location, href, jobLabel, applied, hasBtn: !!btn });
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
    # 无 Chrome 电脑自愈：自动降级 Edge（Chromium 兼容内核）
    apply_browser_fallback(cfg)
    _browser = await uc.start(config=cfg)
    # 直接在 Chrome 启动自带的初始窗口里导航（不开新窗口）——与 BOSS 同款
    # 修法：new_window=True 会留下 Chrome 原生空白窗口，用户看到两个窗口
    # （2026-10-13 用户实测反馈）。
    _tab = await _browser.get(url)
    try:
        await _tab.activate()
        await _tab.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(8)
    return _tab


def _on_login_page(url: str) -> bool:
    if not url or url == "about:blank":
        return True
    return any(s in url for s in ("login.51job.com", "passport.51job.com"))


async def is_logged_in(tab: uc.Tab | None = None) -> bool:
    """登录判据：URL 离开登录域名，且存在 localStorage 凭据 (token/accountId)、登录用户专有 DOM、或凭据 Cookie。

    红线：本函数在轮询链路中每 4s 调用一次，必须极速且有界（≤2s），严禁无超时裸调用
    或阻塞性 CDP 命令。
    """
    global _browser, _tab
    current_tab = tab or _tab

    # 1. 收集活跃 Tab
    candidate_tabs: list[Any] = []
    if _browser is not None:
        try:
            candidate_tabs = list(_browser.tabs)
        except Exception:
            candidate_tabs = []
    if current_tab is not None and current_tab not in candidate_tabs:
        candidate_tabs.append(current_tab)

    active_tab = current_tab or (candidate_tabs[0] if candidate_tabs else None)
    active_url = str(getattr(active_tab, "url", "") or "") if active_tab else ""

    # 核心安全栅栏：如果活跃 Tab 明确处于登录页，绝对不能判为已登录（避免关掉扫码窗口）
    if active_url and _on_login_page(active_url):
        return False

    # 2. 活跃页面 LocalStorage 与业务 DOM 探测（有界 1.5s，最准且与实际页面渲染同步）
    # 51job 扫码成功后跳至 www.51job.com / we.51job.com，同时写入 localStorage(token, accountId) 与展示用户数据
    if active_tab is not None and not _on_login_page(active_url) and "51job.com" in active_url:
        try:
            probe_js = """(() => {
                try {
                    const ls = window.localStorage || {};
                    if (ls.getItem('token') || ls.getItem('accountId')) return true;
                    const body = (document.body && document.body.innerText) || '';
                    if (body.includes('我的投递') || body.includes('谁对我感兴趣') || body.includes('在线简历') || body.includes('我的51Job') || body.includes('个人中心') || body.includes('退出')) {
                        return true;
                    }
                    return false;
                } catch (e) {
                    return false;
                }
            })()"""
            raw = await asyncio.wait_for(active_tab.evaluate(probe_js), timeout=1.5)
            if raw is True or raw == "true" or (isinstance(raw, dict) and raw.get("ok")):
                return True
        except Exception:
            pass

    # 3. 强凭证：有界尝试从浏览器 CookieJar 获取凭证 cookie（超时 1.5s 兜底）
    # 51job 扫码登录后下发 51job(内含 cuid) 或 accountid / partner_session
    if _browser is not None:
        try:
            cookies = await asyncio.wait_for(_browser.cookies.get_all(), timeout=1.5)
            for c in cookies:
                c_name = getattr(c, "name", "")
                c_val = str(getattr(c, "value", "") or "")
                if c_name in ("accountid", "partner_session"):
                    return True
                if c_name == "51job" and ("cuid" in c_val or len(c_val) > 20):
                    return True
        except Exception:
            pass

    # 4. URL 与标题证据：进入专属个人中心域名（未登录不可达）或标题明确带有个人中心
    for t in candidate_tabs:
        u = str(getattr(t, "url", "") or "")
        target = getattr(t, "target", None)
        title = str(getattr(target, "title", "") or "")
        if _on_login_page(u):
            continue
        # i.51job.com 是专属求职者个人中心
        if "i.51job.com" in u or "我的51Job" in title or "个人中心" in title:
            return True

    return False


async def shutdown() -> None:
    """优雅关闭 Chrome（2026-10-12 升级：巡航结束自动关浏览器，三平台统一）。

    用 CDP ``browser.close()`` 让 Chrome 走正常退出流程（flush cookie/session
    到磁盘），再兜底 stop——``stop()`` 只断 CDP 连接，进程可能被硬杀导致
    登录态丢在内存里没写盘。
    """
    global _browser, _tab
    if _browser is not None:
        # 先摘 nodriver 的 target 事件监听（2026-10-15）：避免 close 引发的
        # TargetDestroyed 事件风暴派生 update_targets 重连任务，对着已死端口
        # 刷 WinError 1225 红字（机制详见 browser_session 的 helper 注释）。
        from boss_zhipin.website_oper.core.browser_session import (
            detach_nodriver_target_handlers,
        )

        detach_nodriver_target_handlers(_browser)
        try:
            from nodriver import cdp

            # 关前刷盘缓冲（2026-10-13 打包加固）：扫码刚成功时 cookie
            # 可能还在 Chrome 内存里——先给 1.5s 追上磁盘再优雅关闭。
            await asyncio.sleep(1.5)
            try:
                await _browser.connection.send(cdp.browser.close())
            except Exception as e:  # noqa: BLE001 — close 已送达但连接先断属正常
                log.info("51job 浏览器 CDP close 连接断开（多为正常退出中）: %s", e)
            await asyncio.sleep(2.0)  # 给 Chrome 时间完成退出 + cookie 落盘
        except Exception as e:  # noqa: BLE001
            log.warning("51job 浏览器优雅关闭失败（stop 兜底）: %s", e)
        try:
            _browser.stop()
        except Exception:  # noqa: BLE001
            pass
    _browser = None
    _tab = None


async def parse_cards(tab: uc.Tab) -> list[dict]:
    raw = await tab.evaluate(PARSE_CARDS_JS)
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


async def human_pause(low: float, high: float) -> None:
    """拟人化停顿（2026-10-15 三平台封号复盘）：高斯钟形分布，截断进
    [low, high]。均匀分布的"随机"延迟同样是机器签名（调研依据见猎聘
    driver.human_pause 注释：JobPilot「Human Actor」技术文）。
    """
    mid = (low + high) / 2.0
    sigma = max((high - low) / 4.0, 0.05)
    await asyncio.sleep(min(high, max(low, random.gauss(mid, sigma))))


async def goto_search(tab: uc.Tab, keyword: str) -> list[dict]:
    await tab.get(SEARCH_TMPL.format(kw=quote(keyword)))
    # 拟人化浏览（2026-10-15 封号复盘）：加载后扫一眼 + 滚动看几条再解析
    # （固定 sleep(8) 是机器签名；滚动顺带触发懒加载多抓卡片）。
    await human_pause(4.0, 8.0)
    # 封禁/风控拦截页检测（2026-10-18 审查补齐）：命中即记日志——apply 层
    # 在 parse_cards 拿 0 张卡时会再探测一次并停轮（两层防线）。
    if await check_ban_page(tab):
        log.warning("[job51] 🛑 检测到封禁/风控拦截页（goto_search）")
        return []
    for _ in range(random.randint(1, 2)):
        try:
            await tab.evaluate(
                "window.scrollBy({top: 400 + Math.floor(Math.random()*500),"
                " behavior: 'smooth'})"
            )
        except Exception:  # noqa: BLE001 — 滚动失败不影响主流程
            pass
        await human_pause(1.5, 4.0)
    return await parse_cards(tab)


async def _check_captcha(tab: uc.Tab) -> bool:
    try:
        txt = await tab.evaluate("(document.body && document.body.innerText || '')")
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    return any(k in txt for k in ("安全验证", "滑块", "拖动", "验证码", "请完成验证", "行为验证"))


# 封禁/风控拦截页特征（2026-10-18 三路审查：51job 缺失猎聘同款封禁检测，
# 被临时封禁时整轮静默空转）。任一命中即判。
_BAN_PAGE_KEYWORDS = ("账号行为异常", "异常访问行为", "暂时禁止访问", "访问过于频繁", "账号异常")


async def check_ban_page(tab: uc.Tab) -> bool:
    """检测封禁/风控拦截页（对齐猎聘 _check_ban_page 的 51job 版）。

    不识别的话整轮巡航静默空转（每词 0 岗位），用户还以为没岗位了。
    """
    try:
        txt = await asyncio.wait_for(
            tab.evaluate(
                "(document.body && document.body.innerText || '').slice(0, 2000)"
            ),
            timeout=5,
        )
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    return any(k in txt for k in _BAN_PAGE_KEYWORDS)


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
        # 拟人化：等列表刷新的间隔从固定 5s 改高斯 4~9s（机器签名消除）
        await human_pause(4.0, 9.0)
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


# ============ 投递后弹窗处理（2026-10-13 用户实测反馈） ============
# 用户实测：投递成功后会弹一个带微信二维码的"投递成功"大 modal，遮住整个
# 页面，不关掉就没法投下一个。旧代码只有"确认弹窗"处理且用 tab.find 全页
# 文本匹配——最坏 15s 低效等待，还可能误点其他岗位卡的"投递"按钮。
# 两个 dismiss 都用单次 JS evaluate：有界、只在弹层内精确匹配。

# 确认类弹窗（"确认投递/选择简历"）：在弹层内点确认按钮
DISMISS_CONFIRM_JS = r"""
(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight);
  const layers = document.querySelectorAll(
    '[class*="dialog" i], [class*="modal" i], [class*="popup" i], [role="dialog"]');
  for (const layer of layers) {
    if (!visible(layer)) continue;
    const text = layer.innerText || '';
    if (text.includes('投递成功')) continue;  // 成功弹窗由 dismiss_success_dialog 关
    const btns = layer.querySelectorAll('button, [class*="btn" i], a');
    for (const b of btns) {
      const t = (b.innerText || '').trim();
      // 精确等于：防止"投递成功"/"继续投递"这类文案误命中
      if (t === '确认' || t === '确定' || t === '立即投递' || t === '投递' || t === '提交') {
        b.click();
        return 'confirm';
      }
    }
  }
  return 'none';
})()
"""

# 成功弹窗（"投递成功"+ 微信二维码）：优先点弹层内关闭钮，找不到发 Escape
DISMISS_SUCCESS_JS = r"""
(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight);
  const layers = document.querySelectorAll(
    '[class*="dialog" i], [class*="modal" i], [class*="popup" i], [role="dialog"], [class*="layer" i]');
  for (const layer of layers) {
    if (!visible(layer)) continue;
    const text = layer.innerText || '';
    if (!text.includes('投递成功')) continue;
    const cands = layer.querySelectorAll(
      '[class*="close" i], [class*="shut" i], [aria-label*="关"], [title*="关"], [class*="icon" i]');
    for (const c of cands) {
      const cls = String(c.className || '');
      const t = (c.innerText || '').trim();
      if (/close|shut/i.test(cls) || t === '×' || t === '✕' || t === 'X' || t === '关闭') {
        c.click();
        return 'closed';
      }
    }
    // 弹层在但没找到关闭钮：Escape 兜底（主流组件库监听 keydown 关弹层）
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    return 'escape';
  }
  return 'none';
})()
"""


async def dismiss_confirm_dialog(tab: uc.Tab) -> str:
    """关"确认投递/选择简历"弹窗（弹层内点确认）。返回 confirm/none。"""
    try:
        raw = await asyncio.wait_for(tab.evaluate(DISMISS_CONFIRM_JS), timeout=5)
    except Exception:  # noqa: BLE001
        return "none"
    return str(raw) if isinstance(raw, str) else "none"


async def dismiss_success_dialog(tab: uc.Tab) -> str:
    """关"投递成功"大弹窗（不关没法投下一个，2026-10-13 用户实测）。

    返回 closed/escape（关掉了）/ none（页面上没有成功弹窗）。
    """
    try:
        raw = await asyncio.wait_for(tab.evaluate(DISMISS_SUCCESS_JS), timeout=5)
    except Exception:  # noqa: BLE001
        return "none"
    return str(raw) if isinstance(raw, str) else "none"


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
