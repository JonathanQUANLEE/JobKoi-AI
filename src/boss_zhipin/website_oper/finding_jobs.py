"""nodriver-backed BOSS automation.

整个模块对外**全部是 async 函数**。调用方（``write_response.py`` 主循环）
也必须 async，并由 ``main.py`` 用 ``uc.loop().run_until_complete(...)`` **整段
跑在一个事件循环里**。

为什么这么设计：之前对外是 sync facade（每个公开函数内部 ``_run`` 调一次
``uc.loop().run_until_complete``），结果每次 enter/exit 事件循环都让 nodriver
的 CDP websocket 进入半死状态，下一次 evaluate 直接 hang 到 timeout。
``scripts/probe_click_card.py`` 单 coroutine 跑同样的 evaluate 是秒返回，
证实就是 sync facade 模式跟 nodriver 的活跃性需求不兼容。
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
import json
import logging
import os
import re
import shutil
import subprocess
import sys

import nodriver as uc
from nodriver import Config

log = logging.getLogger(__name__)

# 持久化 Chrome profile：第一次手动扫码后 cookie 会留下，之后跑就跳过登录。
# 可用 BOSS_CHROME_PROFILE 环境变量覆盖路径。
CHROME_PROFILE_DIR = os.path.abspath(
    os.environ.get("BOSS_CHROME_PROFILE", "./chrome_profile")
)

_browser: uc.Browser | None = None
_tab: uc.Tab | None = None


@dataclass(frozen=True)
class JobPosting:
    title: str
    description: str
    company: str = ""
    location: str = ""
    salary: str = ""
    tags: list[str] | None = None
    boss_name: str = ""
    boss_active_status: str = ""
    education: str = ""
    detail_url: str = ""


def get_tab() -> uc.Tab | None:
    """同步读当前控制的 Tab 引用。仅用作内省。"""
    return _tab


def get_driver():
    raise RuntimeError(
        "get_driver() 已移除：项目已迁到 nodriver，没有 Selenium driver。"
        "请改用 finding_jobs 里的 async helper（get_text_by_css/click_by_xpath/"
        "wait_for_css/send_chat_message/navigate_back）。"
    )


def _on_login_page(url: str) -> bool:
    return any(s in url for s in ("/web/user/", "passport-zp", "/login"))


def _is_logged_in_from_page_state(url: str, info: dict) -> bool:
    """从 URL + DOM 探测结果判断登录态。

    BOSS 现在未登录时不一定停在登录页：可能落在职位列表页，但顶部仍有
    "登录/注册"，详情正文也会显示"登录查看完整内容"。这些都必须判为未登录，
    否则主流程会误以为已登录，直接开始抓 JD。
    """
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
    """判定登录态：URL + DOM 双 check。

    早期 BOSS 对未登录用户一定 redirect 到 ``/web/user/`` 类路径，只看 URL 够用。
    现在它经常**不 redirect**，而是直接在 ``/web/geek/...`` 原地盖一个登录浮层。
    只看 URL 会把这种情况误判成已登录，后续 ``get_job_description`` 抓到的是
    浮层背后的 ``<style>`` 噪音（关键词命中 0/2 → feed_exhausted 假阴性）。

    所以加一层 DOM 探测：页面里有可见的登录浮层就强制判未登录。选不到浮层时
    退回原 URL 判定，避免 BOSS 改 class 名后把真实已登录态误杀。
    """
    if _tab is None:
        return False
    # URL 命中已知登录页路径 → 直接未登录，连 DOM 都不用问
    if _on_login_page(_tab.url):
        return False

    # BOSS 的登录浮层 class 名换过几版：boss-login-dialog / login-dialog-wrap /
    # loginDialog 等，统一用 attribute selector 兜
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
    info = await _safe_evaluate(js, timeout=5)
    logged_in = _is_logged_in_from_page_state(_tab.url, info)
    if not logged_in:
        log.info("页面上有未登录信号 %s → 判未登录，走扫码", info)
        return False
    return True


async def _wait_url_stable(stable_for: float = 2.0, timeout: float = 30) -> str:
    """等到 tab.url 连续 stable_for 秒不变，避开 BOSS 登录页的重定向抖动。"""
    end = asyncio.get_event_loop().time() + timeout
    last_url = _tab.url
    last_change = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() < end:
        cur = _tab.url
        now = asyncio.get_event_loop().time()
        if cur != last_url:
            last_url = cur
            last_change = now
        elif now - last_change >= stable_for:
            return cur
        await asyncio.sleep(0.2)
    return last_url


# ---------- 浏览器生命周期 ----------


async def shutdown() -> None:
    """关 Chrome 并清空模块级 ``_browser`` / ``_tab``。

    给 GUI 用——用户点"重置"想从头来一遍时调一次，否则下次
    ``open_browser_with_options`` 会留旧 Chrome 进程。CLI 不需要：``main.py``
    退出时 OS 会清理子进程。

    ``Browser.stop()`` 是同步函数，但本函数声明 ``async`` 是为了让 GUI
    runner 能 ``await shutdown()``（runner 一律 await，sync/async 不混用）。

    重启注意：这只关 Chrome 进程；nodriver 跟 uvloop 的重启不兼容问题需要
    GUI 入口传 ``loop="asyncio"`` 才能彻底解决（见 project memory）。
    """
    global _browser, _tab
    if _browser is not None:
        try:
            _browser.stop()
        except Exception as e:
            log.warning("browser.stop() 失败（不致命）: %s", e)
    _browser = None
    _tab = None


def _clear_singleton_locks(profile_dir: str) -> None:
    """删掉 profile 里残留的 Singleton 锁文件。

    上次 Chrome 没退干净会留下 ``SingletonLock/Cookie/Socket``，新 Chrome 看到会
    误判 profile 被占。纯文件操作，便于单测。
    """
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            os.remove(os.path.join(profile_dir, name))
        except FileNotFoundError:
            pass
        except Exception as e:  # noqa: BLE001 — best-effort 清理，失败不致命
            log.debug("清 Singleton 锁 %s 跳过：%s", name, e)


def _kill_profile_chrome(profile_dir: str) -> None:
    """杀掉占着本 profile 的残留 Chrome（上次 run 崩了没收掉的孤儿）。

    profile 目录本工具独占，``--user-data-dir=<profile>`` 命中的一定是我们自己的
    残留，杀掉安全。这是用户实测的"连接失败"根因：上次启动起了 Chrome 但 CDP 没
    连上，孤儿一直占着 profile，下次再起就被锁。
    """
    profile_abs = os.path.abspath(profile_dir)
    if sys.platform == "win32":
        _kill_profile_chrome_windows(profile_abs)
        return
    try:
        subprocess.run(
            ["pkill", "-f", profile_abs],
            capture_output=True, timeout=5,
        )
    except Exception as e:  # noqa: BLE001 — 没装 pkill / 无匹配都不致命
        log.debug("pkill 残留 Chrome 跳过：%s", e)


def _kill_profile_chrome_windows(profile_dir: str) -> None:
    """Windows 下按命令行里的 user-data-dir 回收工具专用 Chrome。"""
    powershell = shutil.which("powershell") or shutil.which("pwsh")
    if not powershell:
        log.debug("找不到 PowerShell，跳过 Windows Chrome 回收")
        return
    script = r"""
$profile = [System.IO.Path]::GetFullPath($args[0])
$escaped = [Regex]::Escape($profile)
$processes = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.Name -like 'chrome*' -and (
    $_.CommandLine -match "--user-data-dir=`"?$escaped`"?" -or
    $_.CommandLine -match "--user-data-dir=$escaped"
  )
}
foreach ($p in $processes) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
}
"""
    try:
        subprocess.run(
            [powershell, "-NoProfile", "-Command", script, profile_dir],
            capture_output=True,
            timeout=10,
        )
    except Exception as e:  # noqa: BLE001 — best-effort 清理，失败不致命
        log.debug("Windows 回收工具专用 Chrome 跳过：%s", e)


def _reap_profile_chrome(profile_dir: str) -> None:
    """起浏览器前的自清理：先收掉占 profile 的孤儿 Chrome，再清 Singleton 锁。"""
    _kill_profile_chrome(profile_dir)
    _clear_singleton_locks(profile_dir)


async def _start_browser_with_retry(config: Config, attempts: int = 3) -> uc.Browser:
    """启动并连上 Chrome，失败重试。

    新版 Chrome（如 149）+ 新 macOS 冷启动时，CDP 端口起得慢，nodriver 第一次连
    经常 timeout 报 "Failed to connect to browser"，但 Chrome 其实已经起来了 →
    变孤儿占住 profile。所以每次失败都先 reap（杀掉这次起的、没连上的 Chrome +
    清锁），再退避重试。
    """
    last_err: Exception | None = None
    for i in range(1, attempts + 1):
        try:
            return await uc.start(config=config)
        except Exception as e:  # noqa: BLE001
            last_err = e
            log.warning("浏览器启动/连接失败（第 %d/%d 次）：%s", i, attempts, e)
            _reap_profile_chrome(config.user_data_dir)
            if i < attempts:
                await asyncio.sleep(2.0 * i)
    assert last_err is not None
    raise last_err


async def open_browser_with_options(url: str, browser: str) -> None:
    """启动 Chrome 并打开 url。``browser`` 仅接受 ``"chrome"``。"""
    global _browser, _tab
    if browser != "chrome":
        raise NotImplementedError(
            f"browser={browser!r} 不再支持；nodriver 只走 Chrome。"
        )
    os.makedirs(CHROME_PROFILE_DIR, exist_ok=True)
    # 起之前先收掉上次没退干净、占着本 profile 的孤儿 Chrome + 清残留锁，
    # 否则会复现用户实测的 "Failed to connect to browser"（profile 被旧实例锁住）。
    _reap_profile_chrome(CHROME_PROFILE_DIR)
    config = Config()
    config.user_data_dir = CHROME_PROFILE_DIR
    config.headless = False
    _browser = await _start_browser_with_retry(config)

    # 持久化 profile 启动时 Chrome 会把上次的 tab 都恢复出来；脚本控制的 tab
    # 直接放到一个独立的新窗口里，跟历史窗口井水不犯河水，新窗口默认抢焦。
    _tab = await _browser.get(url, new_window=True)
    try:
        await _tab.activate()
        await _tab.bring_to_front()
    except Exception as e:
        log.warning("激活控制 tab 失败（%s），不影响后续操作", e)

    log.info("页面加载中... 当前URL: %s", _tab.url)
    stable_url = await _wait_url_stable(stable_for=2.0, timeout=30)
    log.info("页面已稳定，当前URL: %s", stable_url)


async def prepare_manual_boss_page(url: str = "") -> dict:
    """准备一个可由工具控制的 BOSS 页面，供用户手动筛选后继续抓取。"""
    target_url = (url or "").strip() or RECOMMEND_URL
    if _tab is None:
        await open_browser_with_options(target_url, "chrome")
    else:
        await ensure_current_tab()
        current_url = get_current_url()
        if "zhipin.com" not in current_url:
            await open_browser_with_options(target_url, "chrome")
    return get_browser_page_state()


async def ensure_current_tab() -> None:
    """复用当前受控 tab，不新开 URL。

    给 GUI 的“我已在浏览器手动筛好，继续从当前页面抓取”使用。
    """
    if _tab is None:
        await prepare_manual_boss_page()
        return
    try:
        await _tab.activate()
        await _tab.bring_to_front()
    except Exception as e:
        log.warning("激活当前 tab 失败（%s），继续尝试使用当前页面", e)


def get_current_url() -> str:
    """返回当前受控 tab 的 URL；没有 tab 时返回空字符串。"""
    return str(getattr(_tab, "url", "") or "")


def get_browser_page_state() -> dict:
    """返回当前受控页面的轻量状态，供 GUI 展示和调试。"""
    if _tab is None:
        return {
            "has_tab": False,
            "url": "",
            "title": "",
            "loaded_job_count": 0,
        }
    return {
        "has_tab": True,
        "url": str(getattr(_tab, "url", "") or ""),
        "title": "",
        "loaded_job_count": 0,
    }


async def log_in() -> None:
    """识别登录状态；未登录则点开微信扫码，等用户扫码登录。"""
    if await _is_logged_in():
        log.info("检测到已登录（profile: %s），跳过扫码", CHROME_PROFILE_DIR)
        return

    cur_url = _tab.url
    log.info("log_in 入口 URL: %s", cur_url)

    if not _on_login_page(cur_url):
        try:
            login_btn = await _tab.find("登录", best_match=True, timeout=15)
            if login_btn:
                await login_btn.click()
                log.info("已点击 header 登录入口")
                await _wait_url_stable(stable_for=2.0, timeout=15)
        except Exception as e:
            log.warning("找不到 header 登录入口（%s），尝试直接在当前页找微信入口", e)

    try:
        wechat_btn = await _tab.find("微信", best_match=True, timeout=10)
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
        if await _is_logged_in():
            log.info("登录成功！cookie 已写入 profile，下次跑应该不用再扫")
            return
        await asyncio.sleep(2)
    log.warning("登录超时，请确认是否已扫码登录")


# ---------- JS 评估辅助 ----------


async def _safe_evaluate(js: str, timeout: float = 10) -> dict:
    """跑 ``tab.evaluate(js)``，期望 JS 自己 ``JSON.stringify`` 返回字符串。

    自带 ``asyncio.wait_for`` 兜底 + JSON 解析容错 —— 永远不抛、永远返回 dict
    （失败时空 dict）。
    """
    js_head = js.strip()[:80].replace("\n", " ")
    try:
        raw = await asyncio.wait_for(_tab.evaluate(js), timeout=timeout)
    except asyncio.TimeoutError:
        log.warning("evaluate 超过 %ss 没返回（JS: %s...）", timeout, js_head)
        return {}
    except Exception as e:
        log.warning("evaluate 抛 %s: %s（JS: %s...）", type(e).__name__, e, js_head)
        return {}
    if isinstance(raw, tuple):
        raw = raw[0]
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            log.warning("JS 返回不是合法 JSON：%s（前 200 字符：%r）", e, raw[:200])
            return {}
    if isinstance(raw, dict):
        return raw
    log.warning("evaluate 返回类型 %s（不是 str/dict）：%r", type(raw).__name__, repr(raw)[:200])
    return {}


async def _js_click_at_index(css_selector: str, index_1: int) -> dict:
    """在 JS 里点 ``css_selector`` 命中的第 N 个元素（1-indexed）。"""
    js = f"""
    JSON.stringify((() => {{
      try {{
        const els = document.querySelectorAll({json.dumps(css_selector)});
        if (els.length < {index_1}) return {{ok: false, total: els.length}};
        els[{index_1 - 1}].click();
        return {{ok: true, total: els.length}};
      }} catch (e) {{
        return {{ok: false, error: String(e), stack: e.stack || ''}};
      }}
    }})())
    """
    return await _safe_evaluate(js)


async def _js_click_job_card_and_get_title(index_1: int) -> dict:
    """点击第 N 个岗位卡，并返回岗位卡文本。"""
    js = f"""
    JSON.stringify((() => {{
      try {{
        const cards = document.querySelectorAll('.job-card-box');
        if (cards.length < {index_1}) return {{ok: false, total: cards.length}};
        const card = cards[{index_1 - 1}];
        const titleEl = card.querySelector('.job-name, .job-title, [class*="job-name"], [class*="job-title"]');
        const text = ((titleEl && titleEl.innerText) || card.innerText || '').trim();
        const title = text.split('\\n').map((line) => line.trim()).find(Boolean) || '';
        card.click();
        return {{ok: true, total: cards.length, title, cardText: (card.innerText || '').trim()}};
      }} catch (e) {{
        return {{ok: false, error: String(e), stack: e.stack || ''}};
      }}
    }})())
    """
    return await _safe_evaluate(js)


async def _js_wait_text(css_selector: str, min_len: int, timeout_s: float) -> str | None:
    """轮询直到 ``css_selector`` 命中且 ``text.length >= min_len``，返回 text；超时返回 None。"""
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        js = f"""
        JSON.stringify((() => {{
          try {{
            const el = document.querySelector({json.dumps(css_selector)});
            if (!el) return {{ok: false, reason: 'not_found'}};
            // 用 innerText 而非 textContent：BOSS 反爬往 JD 里塞了 <style> 块（其 CSS
            // 源码会被 textContent 读出来）+ display:none / width:0.1px 的隐藏诱饵 span
            // （逐字插 "来自BOSS直聘"/"kanzhun" 把真词劈开，导致关键词匹配全废、命中骤降）。
            // innerText 只返回「渲染可见」文本，自动排除 <style> 源码和隐藏元素，拿到干净
            // JD 正文。诊断见 scripts/probe_jd_extract.py（s1=textContent 脏 / s2=innerText 净）。
            const text = (el.innerText || '').trim();
            if (text.length < {min_len}) return {{ok: false, reason: 'too_short', len: text.length}};
            return {{ok: true, text: text}};
          }} catch (e) {{
            return {{ok: false, error: String(e)}};
          }}
        }})())
        """
        result = await _safe_evaluate(js, timeout=5)
        if result.get("ok"):
            return result["text"]
        await asyncio.sleep(0.5)
    return None


async def _xpath_safe(xp: str, timeout: float = 3.0) -> list:
    """``tab.xpath`` 的兜底封装（保留给 ``select_dropdown_option`` 用，主路径已不依赖它）。"""
    try:
        result = await asyncio.wait_for(
            _tab.xpath(xp, timeout=timeout),
            timeout=timeout + 2,
        )
        return result or []
    except asyncio.TimeoutError:
        log.warning("xpath 超时: %s", xp[:80])
        return []
    except Exception as e:
        log.warning("xpath 出错: %s: %s", type(e).__name__, e)
        return []


# ---------- 业务 helper ----------


async def select_dropdown_option(label: str) -> None:
    """空 label 表示用 BOSS 默认推荐 feed，不主动选 tag。"""
    if not label:
        log.info("[select_dropdown_option] label 为空，沿用当前推荐 feed")
        return
    log.info("[select_dropdown_option] label=%r", label)

    log.info("  路径 1: 找推荐 tag chip ...")
    chip_xp = (
        "//*[contains(@class,'recommend-job-btn')"
        " and contains(@class,'has-tooltip')]"
    )
    chips = await _xpath_safe(chip_xp, timeout=3)
    log.info("    找到 %d 个 tag chip", len(chips))
    for el in chips:
        text = (el.text or "").strip()
        if label in text:
            log.info("    → 命中 %r，点击", text)
            await el.click()
            return

    log.info("  路径 2: 找下拉菜单触发器 ...")
    trigger = await _xpath_safe(
        "//*[@id='wrap']/div[2]/div[1]/div/div[1]/div", timeout=3
    )
    if trigger:
        log.info("    → 点开下拉")
        await trigger[0].click()
        await _xpath_safe(
            "//ul[contains(@class,'dropdown-expect-list')]", timeout=3
        )
        options = await _xpath_safe(
            f"//li[contains(text(), '{label}')]", timeout=3
        )
        if options:
            log.info("    → 命中下拉 option %r，点击", label)
            await options[0].click()
            return
        log.info("    下拉里没有 %r", label)
    else:
        log.info("    没找到下拉触发器")

    log.info("  路径 3: fallback —— 用 BOSS 默认的推荐 feed 继续（不主动选 tag）")


_PAGE_FILTER_LABELS = {
    "city": "城市",
    "education": "学历",
    "boss_active": "BOSS活跃",
    "experience": "经验",
    "salary": "薪资待遇",
    "company_scale": "公司规模",
    "industry": "行业",
}

_BOSS_ACTIVE_PATTERNS = (
    "刚刚活跃",
    "今日活跃",
    "3日内活跃",
    "本周活跃",
    "本月活跃",
    "3月内活跃",
    "刚刚在线",
)


def extract_boss_active_status(text: str) -> str:
    """从岗位卡片或详情文本里提取 BOSS 活跃状态。"""
    if not text:
        return ""
    for pattern in _BOSS_ACTIVE_PATTERNS:
        if pattern in text:
            return pattern
    match = re.search(r"\d+日内活跃|\d+月内活跃", text)
    return match.group(0) if match else ""


async def click_filter_value(group_name: str, value: str, timeout: float = 5) -> bool:
    """按页面筛选组和值文本尽力点击。

    BOSS 的筛选 DOM 经常变，这里只依赖可见文本：先点筛选组标题，再点具体值。
    找不到时返回 False，由 ``apply_page_filters`` 决定 warning 继续还是 strict 中止。
    """
    if _tab is None:
        return False
    group_label = _PAGE_FILTER_LABELS.get(group_name, group_name)
    try:
        group = await _tab.find(group_label, best_match=True, timeout=timeout)
        if group:
            await group.click()
            await asyncio.sleep(0.3)
    except Exception as e:
        log.debug("页面筛选组 %s 点击失败，继续尝试直接点击值：%s", group_label, e)

    try:
        option = await _tab.find(value, best_match=True, timeout=timeout)
        if not option:
            return False
        await option.click()
        log.info("页面筛选已点击：%s=%s", group_name, value)
        return True
    except Exception as e:
        log.warning("页面筛选值点击失败：%s=%s，%s", group_name, value, e)
        return False


async def apply_page_filters(
    filters: dict | None,
    *,
    emit_event: Callable[[dict], None] | None = None,
) -> None:
    """执行 profile.page_filters。

    默认 ``strict=false``：页面筛选点不上只记 warning，后续仍由本地规则兜底。
    """
    if not isinstance(filters, dict) or not filters:
        return
    strict = bool(filters.get("strict", False))
    clicked_any = False
    for group_name, config in filters.items():
        if group_name == "strict" or not isinstance(config, dict):
            continue
        if not bool(config.get("enabled", True)):
            continue
        values = [str(item).strip() for item in config.get("values") or [] if str(item).strip()]
        for value in values:
            ok = await click_filter_value(str(group_name), value)
            if ok:
                if emit_event:
                    emit_event(
                        {
                            "group": str(group_name),
                            "value": value,
                            "status": "success",
                            "message": f"页面筛选成功：{_PAGE_FILTER_LABELS.get(str(group_name), str(group_name))}={value}",
                        }
                    )
                clicked_any = True
                continue
            label = _PAGE_FILTER_LABELS.get(str(group_name), str(group_name))
            message = f"页面筛选失败：{label}={value}"
            if strict:
                raise RuntimeError(message)
            detailed_message = f"{message}。已继续运行，本地规则继续兜底。"
            suggestion = "你可以在 BOSS 页面手动筛选到合适页面，再回到 GUI 直接点击开始运行。"
            log.warning("%s%s", detailed_message, suggestion)
            if emit_event:
                emit_event(
                    {
                        "group": str(group_name),
                        "value": value,
                        "status": "failed",
                        "message": detailed_message,
                        "suggestion": suggestion,
                    }
                )
    if clicked_any:
        await asyncio.sleep(1)


async def captcha_visible() -> bool:
    """保守检测验证码/安全校验页；命中时主流程停止，不做绕过。"""
    result = await _safe_evaluate(
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


# BOSS 详情面板顶部的 UI 文字（按钮 / 区块标题），不是 JD 正文。innerText 会把它们
# 带在最前面（"举报\n微信扫码分享\n职位描述\n…"），剥掉让喂给匹配/LLM 的更纯。
_JD_NOISE_LINES = frozenset({"举报", "微信扫码分享", "微信分享", "分享", "职位描述", "立即沟通", "收藏"})


def _strip_jd_noise(text: str) -> str:
    """剥掉 JD 文本**开头连续**的页面 UI 噪声行。

    只剥开头那几行（举报 / 微信扫码分享 / 职位描述 …）；正文里万一再出现同样的词
    不动。纯函数，便于单测（见 tests/test_finding_jobs_text.py）。
    """
    lines = (text or "").split("\n")
    i = 0
    while i < len(lines) and lines[i].strip() in _JD_NOISE_LINES:
        i += 1
    return "\n".join(lines[i:]).strip()


def _parse_job_card_text(text: str, *, fallback_title: str = "") -> JobPosting:
    """从岗位卡片可见文本中尽力提取结构化字段。

    BOSS 卡片 DOM 会变，字段缺失时宁可返回空字符串，也不影响后续 JD 提取。
    """
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    title = fallback_title or (lines[0] if lines else "")
    salary = _first_line_matching(lines, ("元/天", "K", "k", "薪"))
    location = _first_line_matching(lines, ("·", "广州", "深圳", "北京", "上海", "杭州", "成都"))
    education = _first_line_matching(lines, ("博士", "硕士", "本科", "大专", "学历不限"))
    company = _first_company_line(lines)
    boss_line = _first_line_matching(lines, ("活跃", "刚刚在线", "在线"))
    boss_name, boss_active_status = _split_boss_line(boss_line)
    boss_active_status = boss_active_status or extract_boss_active_status(text)
    known = {title, salary, location, education, company, boss_line}
    tags = [line for line in lines[1:] if line not in known]
    return JobPosting(
        title=title,
        description="",
        company=company,
        location=location,
        salary=salary,
        tags=tags,
        boss_name=boss_name,
        boss_active_status=boss_active_status,
        education=education,
    )


def _first_line_matching(lines: list[str], needles: tuple[str, ...]) -> str:
    return next((line for line in lines if any(needle in line for needle in needles)), "")


def _first_company_line(lines: list[str]) -> str:
    for line in lines:
        if any(word in line for word in ("公司", "科技", "网络", "信息", "智能", "软件")):
            return line
    return ""


def _split_boss_line(line: str) -> tuple[str, str]:
    if not line:
        return "", ""
    parts = line.split(maxsplit=1)
    if len(parts) == 1:
        return "", parts[0]
    return parts[0], parts[1]


def job_key(job: JobPosting) -> str:
    """生成岗位去重 key；详情 URL 优先，其次用标题/公司/地点/BOSS。"""
    if job.detail_url:
        return job.detail_url
    parts = [job.title, job.company, job.location, job.boss_name]
    if any(part.strip() for part in parts):
        return "|".join(parts)
    return (job.description or "").strip()[:120]


async def get_job_description_by_index(index: int) -> str | None:
    """点开第 N 个岗位卡（1-indexed），返回右侧 JD 详情面板的文本；失败返回 None。"""
    log.info("[get_job_description_by_index] index=%d", index)
    job = await get_job_by_index(index)
    return job.description if job else None


async def get_job_by_index(index: int) -> JobPosting | None:
    """点开第 N 个岗位卡（1-indexed），返回岗位标题和右侧 JD；失败返回 None。"""
    log.info("[get_job_by_index] index=%d", index)
    click_result = await _js_click_job_card_and_get_title(index)
    log.info("  点击 .job-card-box[%d]: %s", index, click_result)
    if not click_result.get("ok"):
        return None

    jd = await _js_wait_text(".job-detail-body", min_len=50, timeout_s=10)
    if jd is None:
        log.info("  10s 内 .job-detail-body 没出现或文本太短")
        return None
    jd = _strip_jd_noise(jd)
    title = (click_result.get("title") or "").strip()
    card = _parse_job_card_text(click_result.get("cardText") or "", fallback_title=title)
    log.info("  标题 %r，JD 长度 %d 字符", title, len(jd))
    return JobPosting(
        title=card.title,
        description=jd,
        company=card.company,
        location=card.location,
        salary=card.salary,
        tags=card.tags or [],
        boss_name=card.boss_name,
        boss_active_status=card.boss_active_status,
        education=card.education,
        detail_url=card.detail_url,
    )


async def get_loaded_job_count() -> int:
    """返回当前已加载的岗位卡数量。"""
    result = await _safe_evaluate(
        """
        JSON.stringify((() => {
          return {count: document.querySelectorAll('.job-card-box').length};
        })())
        """,
        timeout=5,
    )
    return int(result.get("count") or 0)


async def get_selected_job_index() -> int:
    """返回当前选中的岗位卡索引（1-indexed），无法识别时回退到 1。"""
    result = await _safe_evaluate(
        r"""
        JSON.stringify((() => {
          const cards = Array.from(document.querySelectorAll('.job-card-box'));
          if (!cards.length) return {index: 1, detected: false, reason: 'no_cards'};

          const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
          const hasSelectedMarker = (element) => {
            if (!element) return false;
            if (element.getAttribute && (
              element.getAttribute('aria-selected') === 'true'
              || element.getAttribute('aria-current') === 'true'
            )) return true;
            const classes = normalize(
              typeof element.className === 'string' ? element.className : ''
            );
            return /(^|\s)(active|selected|current)(\s|$)/i.test(classes);
          };

          let selected = cards.findIndex((card) => {
            const parent = card.parentElement;
            const grandparent = parent && parent.parentElement;
            return [card, parent, grandparent].some(hasSelectedMarker);
          });
          if (selected >= 0) {
            return {index: selected + 1, detected: true, reason: 'active_marker'};
          }

          const detailTitleElement = document.querySelector(
            '.job-detail-box .job-name, .job-detail-info .job-name, '
            + '.job-detail-header .job-name, .job-detail-box [class*="job-name"], '
            + '.job-detail-box [class*="job-title"]'
          );
          const detailTitle = normalize(detailTitleElement && detailTitleElement.innerText);
          if (detailTitle) {
            selected = cards.findIndex((card) => {
              const titleElement = card.querySelector(
                '.job-name, .job-title, [class*="job-name"], [class*="job-title"]'
              );
              const title = normalize(
                (titleElement && titleElement.innerText)
                || (card.innerText || '').split('\n')[0]
              );
              return title === detailTitle;
            });
          }
          return selected >= 0
            ? {index: selected + 1, detected: true, reason: 'detail_title'}
            : {index: 1, detected: false, reason: 'not_detected'};
        })())
        """,
        timeout=5,
    )
    try:
        index = max(1, int(result.get("index") or 1))
    except (TypeError, ValueError):
        index = 1
    if result.get("detected"):
        log.info("检测到当前选中的岗位卡：第 %d 条", index)
    else:
        log.info("未识别到当前选中的岗位卡，从第 1 条开始")
    return index


async def scroll_to_load_more_jobs(timeout: float = 8.0) -> bool:
    """滚动左侧岗位列表并等待新岗位出现。成功返回 True，否则 False。

    BOSS 岗位页通常不是整个 window 滚动，而是左侧岗位列表容器滚动；同时它会
    复用固定数量的岗位卡 DOM，所以不能只用卡片数量增加判断是否加载成功。
    """
    before = await get_loaded_job_count()
    scroll_result = await _safe_evaluate(
        """
        JSON.stringify((() => {
          const firstCardText = () => {
            const card = document.querySelector('.job-card-box');
            return card ? (card.innerText || '').trim().slice(0, 120) : '';
          };
          const cards = Array.from(document.querySelectorAll('.job-card-box'));
          const candidates = [
            document.querySelector('.job-list-box'),
            document.querySelector('.job-list'),
            document.querySelector('.job-list-container'),
            document.querySelector('[class*="job-list"]'),
            cards[0] ? cards[0].closest('div') : null,
          ].filter(Boolean);
          const scrollable = candidates.find((el) => el.scrollHeight > el.clientHeight + 20);
          const target = scrollable || document.scrollingElement || document.documentElement || document.body;
          const beforeTop = target.scrollTop || window.scrollY || 0;
          const beforeFirst = firstCardText();
          target.scrollTop = beforeTop + Math.max(600, Math.floor((target.clientHeight || window.innerHeight || 600) * 0.85));
          if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
            window.scrollBy(0, Math.max(600, Math.floor(window.innerHeight * 0.85)));
          }
          const afterTop = target.scrollTop || window.scrollY || 0;
          const afterFirst = firstCardText();
          return {
            ok: true,
            target: scrollable ? 'left-list' : 'window',
            beforeTop,
            afterTop,
            beforeFirst,
            afterFirst,
          };
        })())
        """,
        timeout=5,
    )
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(0.5)
        after = await get_loaded_job_count()
        if after > before:
            log.info(
                "滚动加载更多岗位：%d -> %d（target=%s）",
                before,
                after,
                scroll_result.get("target", ""),
            )
            return True
        if (
            scroll_result.get("afterTop") != scroll_result.get("beforeTop")
            or scroll_result.get("afterFirst") != scroll_result.get("beforeFirst")
        ):
            log.info(
                "岗位列表已滚动（target=%s，count=%d，DOM 数量未变，按虚拟列表继续）",
                scroll_result.get("target", ""),
                before,
            )
            return True
    log.info("滚动后岗位数量和可见内容均未变化：%d", before)
    return False


async def click_next_page_if_present(timeout: float = 3.0) -> bool:
    """列表滚动没有新岗位时，尝试点击分页里的“下一页”。"""
    next_xpaths = (
        "//*[normalize-space(text())='下一页']",
        "//*[contains(normalize-space(text()), '下一页')]",
        "//*[@aria-label='下一页' or @aria-label='Next']",
        "//*[contains(@class, 'next') and not(contains(@class, 'disabled'))]",
    )
    for xpath in next_xpaths:
        if await click_by_xpath(xpath, timeout=timeout):
            log.info("已点击岗位列表下一页")
            await asyncio.sleep(2)
            return True
    return False


async def get_text_by_css(selector: str, timeout: float = 5) -> str | None:
    """通用：返回 CSS 选择器命中元素的 text，找不到返回 None。"""
    try:
        el = await _tab.select(selector, timeout=timeout)
    except Exception:
        return None
    return el.text if el else None


async def click_by_xpath(xpath: str, timeout: float = 10) -> bool:
    """通过 xpath 找到元素并点击。成功返回 True。"""
    els = await _xpath_safe(xpath, timeout=timeout)
    if not els:
        return False
    await els[0].click()
    return True


async def click_stay_on_page_if_present(timeout: float = 3) -> bool:
    """BOSS 弹出跳转确认时，点击“留在此页”。

    点击“立即沟通”后有时会出现引导去 App / 新页跳转确认。这个弹窗不处理会导致
    后续找不到聊天输入框。找不到按钮时返回 False，表示没有弹窗，不算错误。
    """
    stay_xpaths = (
        "//*[normalize-space(text())='留在此页']",
        "//*[contains(normalize-space(text()), '留在此页')]",
    )
    for xpath in stay_xpaths:
        if await click_by_xpath(xpath, timeout=timeout):
            log.info("已点击“留在此页”")
            await asyncio.sleep(1)
            return True
    return False


async def dismiss_greeting_dialog(timeout: float = 5) -> bool:
    """关闭“立即沟通”后出现的默认招呼语确认框。

    BOSS 2026-08 改版后，点击“立即沟通”会先发送默认招呼语，再弹出
    “已向BOSS发送消息”确认框，需要点击“继续沟通”才能进入聊天页。
    旧版没有该弹窗时静默返回 False。
    """
    try:
        button = await _tab.find("继续沟通", best_match=True, timeout=timeout)
    except Exception:
        button = None
    if button:
        await button.click()
        log.info("已关闭默认招呼语弹窗（点击‘继续沟通’）")
        await asyncio.sleep(1)
        return True
    log.debug("未检测到默认招呼语弹窗，跳过")
    return False


async def wait_for_css(selector: str, timeout: float = 50) -> bool:
    """等 CSS 选择器命中。成功返回 True，超时返回 False。"""
    try:
        el = await _tab.select(selector, timeout=timeout)
    except Exception:
        return False
    return el is not None


async def send_chat_message(text: str) -> None:
    """把 text 打进 ``#chat-input``，优先点击发送按钮。"""
    chat = await _tab.select("#chat-input", timeout=10)
    if not chat:
        raise RuntimeError("chat input (#chat-input) 未找到")
    await chat.send_keys(text)
    await asyncio.sleep(3)
    # BOSS 2026-08 改版后回车不再稳定触发发送，优先点击页面发送按钮。
    try:
        send_button = await _tab.find("发送", best_match=True, timeout=5)
    except Exception:
        send_button = None
    if send_button:
        await send_button.click()
        log.info("已点击‘发送’按钮")
    else:
        log.warning("未找到‘发送’按钮，回退使用回车发送")
        await chat.send_keys("\n")
    await asyncio.sleep(1)


async def click_send_resume(timeout: float = 5) -> bool:
    """发送招呼语后尝试点击“发简历”。

    按钮不存在时静默返回 False，不影响已经完成的招呼语发送。
    """
    try:
        button = await _tab.find("发简历", best_match=True, timeout=timeout)
    except Exception:
        button = None
    if button:
        await button.click()
        log.info("已点击‘发简历’")
        await asyncio.sleep(2)
        return True
    log.debug("未找到‘发简历’按钮，跳过")
    return False


async def navigate_back() -> None:
    """``history.back()`` —— 浏览器返回上一页。"""
    await _tab.evaluate("history.back()")
    await asyncio.sleep(3)


async def return_to_job_list(timeout: float = 12.0, max_attempts: int = 2) -> bool:
    """尽量回到岗位列表页，并确认列表真的回来了。

    发送招呼语后 BOSS 可能停留在聊天页或详情页，单次 ``history.back()`` 不一定
    足够。这里会最多尝试 ``max_attempts`` 次，每次后都确认列表卡片是否出现。
    """
    for attempt in range(1, max_attempts + 1):
        await navigate_back()
        if await wait_for_css(".job-card-box", timeout=timeout):
            return True
        log.warning("返回岗位列表第 %d 次失败，继续重试", attempt)
    return False


# Variables（保持向后兼容）
RECOMMEND_URL = "https://www.zhipin.com/web/geek/job-recommend?ka=header-job-recommend"
url = RECOMMEND_URL
browser_type = "chrome"
