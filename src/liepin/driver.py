"""猎聘（liepin.com）自动化：nodriver 浏览器操作原语。

与 BOSS 的 finding_jobs.py 对应，但猎聘的 DOM/流程完全不同：
- 搜索页卡片 class：``jobCardPcContainer``
- 详情页投递按钮：``a.btn-main`` = "聊一聊"
- 聊一聊弹窗：``textarea.im-ui-textarea`` 输入 + ``button.im-ui-basic-send-btn`` 发送

用户要求：点"聊一聊" + 自动发一句**固定招呼语**（猎聘必须发消息才建立对话，
这点跟 BOSS"点一下就对话"不同）。发什么话写在 ``greetings/liepin-greeting.txt``。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import nodriver as uc
from nodriver import Config

from boss_zhipin.paths import get_platform_profile_dir
from boss_zhipin.platforms.browser_lookup import apply_browser_fallback
from boss_zhipin.platforms.session_cleanup import reap_profile_chrome

log = logging.getLogger(__name__)

# 注意：greetings/logs 等资源路径仍用 ROOT（__file__ 相对）；只有浏览器
# profile 走统一解析器（打包后 ROOT 指向安装目录，profile 必须去用户数据区）。
ROOT = Path(__file__).resolve().parent.parent.parent

# Profile 目录单一真相（2026-10-13 打包加固）：env 覆盖 > standalone
# %APPDATA%（防 Program Files UAC 只读炸 Cookie 落盘）> dev 仓库根
# liepin_profile（历史位置，用户已登录 cookie 一分不动）。
# platforms/liepin.py 的登录探测走同一函数，两边永远同源。
PROFILE_DIR = str(get_platform_profile_dir("liepin"))

SEARCH_TMPL = "https://www.liepin.com/zhaopin/?key={kw}"

_browser: uc.Browser | None = None
_tab: uc.Tab | None = None

# 卡片解析 JS：抓 jobId、标题、链接、薪资、地点（公司名在详情页再补充）
PARSE_CARDS_JS = r"""
(() => {
  const out = [];
  document.querySelectorAll('.jobCardPcContainer').forEach(c => {
    const a = c.querySelector('a[data-nick="job-detail-job-info"]');
    const titleEl = c.querySelector('.jobTitleBox .ellipsis-1, [class*=jobTitle] .ellipsis-1');
    const title = (titleEl && titleEl.textContent || '').trim();
    let jobId = '', salary = '', location = '';
    const ext = c.getAttribute('data-tlg-ext') || '';
    try {
      const d = JSON.parse(decodeURIComponent(ext));
      jobId = d.jobId || '';
      if (d.salary) salary = d.salary;
      if (d.city || d.workArea) location = d.city || d.workArea;
    } catch (e) {}

    // DOM 提取薪资（如 20-40k·14薪）
    if (!salary) {
      const salEl = c.querySelector('.jobSalary, [class*=jobSalary], [class*=salary], [class*=Salary]');
      if (salEl) salary = (salEl.textContent || '').trim();
    }
    // DOM 提取地点（卡片标签首项通常为城市，如 上海-浦东新区）
    if (!location) {
      const locEl = c.querySelector('.jobLabelsBox span, [class*=labelsBox] span, [class*=labels] span, [class*=city], [data-nick="job-area"]');
      if (locEl) location = (locEl.textContent || '').trim();
    }

    // 公司名：卡片里 HR 行（形如 "金女士·资深招聘专家"）前面的那一段短文本
    const textLines = (c.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    let company = '';
    for (let i = 0; i < textLines.length; i++) {
      if (/女士|先生|HR|经理|顾问|招聘|猎头/.test(textLines[i]) && i > 0) {
        company = textLines[i - 1];
        break;
      }
    }
    const href = (a && a.href) || (jobId ? `https://www.liepin.com/job/${jobId}.shtml` : '');
    out.push({ title, company, salary, location, jobId, href });
  });
  return JSON.stringify(out);
})()
"""

DETAIL_INFO_JS = r"""
(() => {
  const t = (document.body && document.body.innerText || '');
  return JSON.stringify({
    title: (document.querySelector('.title-info h1, [class*=job-title], h1')?.textContent || '').trim().slice(0, 60),
    company: '',
    text: t.slice(0, 400),
  });
})()
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
    await asyncio.sleep(6)
    return _tab


async def shutdown() -> None:
    """优雅关闭 Chrome（2026-10-12 升级：巡航结束自动关浏览器，三平台统一）。

    与 BOSS 同款教训：``stop()`` 只断 CDP 连接、进程可能被硬杀，新登录的
    cookie 还在 Chrome 内存里没写盘就死了——下次巡航又变未登录。改用 CDP
    ``browser.close()`` 让 Chrome 走正常退出流程（flush cookie 到磁盘），
    再兜底 stop。
    """
    global _browser, _tab
    if _browser is not None:
        try:
            from nodriver import cdp

            # 关前刷盘缓冲（2026-10-13 打包加固）：扫码刚成功时 cookie
            # 可能还在 Chrome 内存里——先给 1.5s 追上磁盘再优雅关闭。
            await asyncio.sleep(1.5)
            try:
                await _browser.connection.send(cdp.browser.close())
            except Exception as e:  # noqa: BLE001 — close 已送达但连接先断属正常
                log.info("猎聘浏览器 CDP close 连接断开（多为正常退出中）: %s", e)
            await asyncio.sleep(2.0)  # 给 Chrome 时间完成退出 + cookie 落盘
        except Exception as e:  # noqa: BLE001
            log.warning("猎聘浏览器优雅关闭失败（stop 兜底）: %s", e)
        try:
            _browser.stop()
        except Exception:  # noqa: BLE001
            pass
    _browser = None
    _tab = None


def _on_login_page(url: str) -> bool:
    if not url or url == "about:blank":
        return True
    return any(s in url for s in ("/login", "passport", "/register"))


# c.liepin.com 右下角聊天挂件的未读角标（2026-10-13 probe 实测：
# #im-c-entry 内 .im-ui-basic-entry-unread-count 文本即未读数，干净唯一）
UNREAD_JS = r"""
JSON.stringify((() => {
  const el = document.querySelector('.im-ui-basic-entry-unread-count');
  if (!el) return { found: false, unread: 0 };
  const n = parseInt((el.innerText || '').trim(), 10);
  return { found: true, unread: Number.isFinite(n) ? n : 0 };
})())
"""


async def check_unread() -> dict[str, Any]:
    """读猎聘当前未读消息数（聊天挂件角标）。

    语义（2026-10-13 三平台未读需求）：
    - 浏览器没开：自己开一个到 c.liepin.com，读完**立即关闭**（不常驻、
      不打扰；打开是读未读的唯一途径——猎聘没有免浏览器的未读接口）；
    - 浏览器已开（巡航中/登录后）：从当前受控页直接读，**绝不导航**——
      巡航中的搜索/详情页不能被未读检查打断。

    Returns::

        {"status": "ok", "unread": 19, "chat_url": "https://c.liepin.com/"}
        {"status": "error", "code": "no_tab"|"no_widget", "message": str}
    """
    global _browser, _tab
    opened_here = _browser is None
    if opened_here:
        tab = await open_browser("https://c.liepin.com/")
        await asyncio.sleep(3)  # 等挂件 JS 渲染出角标
    else:
        tab = _tab
        if tab is None:
            return {
                "status": "error",
                "code": "no_tab",
                "message": "猎聘浏览器已打开但没有受控标签页。",
            }
    try:
        raw = await asyncio.wait_for(tab.evaluate(UNREAD_JS), timeout=8)
        data = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(data, dict) or not data.get("found"):
            return {
                "status": "error",
                "code": "no_widget",
                "message": "当前猎聘页面上没有未读角标（可能停留在搜索/详情页，或未登录）。",
            }
        return {
            "status": "ok",
            "unread": int(data.get("unread") or 0),
            "chat_url": "https://c.liepin.com/",
        }
    finally:
        if opened_here:
            await shutdown()


async def is_logged_in(tab: uc.Tab | None = None) -> bool:
    """登录判据：URL 进入 c.liepin.com 个人首页、离开 /login、或已写入登录凭证 cookie。

    红线：本函数在轮询链路中每 4s 调用一次，必须极速且有界（≤2s），严禁无超时裸调用
    或阻塞性 CDP 命令（2026-10-12 事故：tab.send(cdp.network.get_cookies) 挂起导致
    DOM 探测连续超时死锁，已扫码却无法自动关闭浏览器）。
    """
    global _browser, _tab
    current_tab = tab or _tab

    # 1. 零成本内存判断：检查受控浏览器所有活跃页面的 URL 与标题
    # nodriver 的 tab.url 与 target.title 是由 CDP 事件驱动在内存维护的属性，0ms、永不卡死。
    candidate_tabs: list[Any] = []
    if _browser is not None:
        try:
            candidate_tabs = list(_browser.tabs)
        except Exception:
            candidate_tabs = []
    if current_tab is not None and current_tab not in candidate_tabs:
        candidate_tabs.append(current_tab)

    for t in candidate_tabs:
        u = str(getattr(t, "url", "") or "")
        target = getattr(t, "target", None)
        title = str(getattr(target, "title", "") or "")
        # 进入个人首页（用户端专属域名 c.liepin.com 或 "我的首页"）= 绝对登录证据
        if "c.liepin.com" in u or "我的首页" in title:
            return True
        # 离开登录页，且已处于猎聘有效业务域
        if u and "liepin.com" in u and not _on_login_page(u) and "登录" not in title:
            return True

    # 2. 强凭证：有界尝试从浏览器 CookieJar 获取凭证 cookie（超时 1.5s 兜底）
    if _browser is not None:
        try:
            cookies = await asyncio.wait_for(_browser.cookies.get_all(), timeout=1.5)
            if any(
                getattr(c, "name", "") in ("lt_auth", "liepin_login_valid")
                for c in cookies
            ):
                return True
        except Exception:
            pass

    # 3. DOM 探测兜底（有界 1.5s，带超时保护，避免页面跳转中 evaluate 挂起）
    active_tab = current_tab or (candidate_tabs[0] if candidate_tabs else None)
    if active_tab is not None:
        try:
            u = str(getattr(active_tab, "url", "") or "")
            if not _on_login_page(u):
                js = "(() => { const t = document.body ? document.body.innerText || '' : ''; return t.slice(0, 500); })()"
                txt = await asyncio.wait_for(active_tab.evaluate(js), timeout=1.5)
                if isinstance(txt, str):
                    if "我的首页" in txt or "退出登录" in txt:
                        return True
                    if "扫码登录" not in txt and "账号密码登录" not in txt and "登录/注册" not in txt[:200]:
                        return True
        except Exception:
            pass

    return False


async def parse_cards(tab: uc.Tab) -> list[dict]:
    raw = await tab.evaluate(PARSE_CARDS_JS)
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


async def goto_search(tab: uc.Tab, keyword: str) -> list[dict]:
    await tab.get(SEARCH_TMPL.format(kw=__import__("urllib.parse", fromlist=["quote"]).quote(keyword)))
    await asyncio.sleep(6)
    return await parse_cards(tab)


def _greeting_text() -> str:
    p = ROOT / "greetings" / "liepin-greeting.txt"
    if p.exists():
        t = p.read_text(encoding="utf-8").strip()
        if t:
            return t
    return "对这个职位很感兴趣，希望可以详聊"


async def open_detail(tab: uc.Tab, href: str) -> None:
    await tab.get(href)
    await asyncio.sleep(5)


async def detail_company(tab: uc.Tab) -> str:
    """从详情页抓公司名（去重用）。"""
    try:
        txt = await tab.evaluate(
            "(document.body && document.body.innerText || '').slice(0, 800)"
        )
    except Exception:  # noqa: BLE001
        return ""
    if not isinstance(txt, str):
        return ""
    # 详情页公司名通常在"已认证"或"猎头顾问"附近，形如 "金女士 6天前在线 已认证\n资深招聘专家 · Unity中国"
    for pat in (r"已认证\s*\n[^\n]*·\s*([^\n]+)", r"·\s*([^\n]{2,30}?)\s*\n"):
        m = re.search(pat, txt)
        if m:
            return m.group(1).strip()
    return ""


async def _check_captcha(tab: uc.Tab) -> bool:
    """检测页面是否弹出验证码/滑块/安全验证（猎聘风控）。"""
    try:
        txt = await tab.evaluate("(document.body && document.body.innerText || '')")
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    return any(k in txt for k in ("安全验证", "滑块", "拖动", "验证码", "请完成验证", "点击完成", "行为验证"))


async def _check_limit_alert(tab: uc.Tab) -> bool:
    """检测页面是否弹出「今日投递/打招呼次数已达上限」提示（平台限额）。"""
    from boss_zhipin.platforms.platform_limits import match_limit_alert

    try:
        txt = await tab.evaluate("(document.body && document.body.innerText || '')")
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    return match_limit_alert("liepin", txt) is not None


async def click_chat_and_send(tab: uc.Tab, greeting: str) -> str:
    """点详情页"聊一聊"，在 IM 输入框里发招呼语。

    返回 "sent" / "limit"（平台今日上限） / "captcha"（触发风控，应立即停止） / "failed: 原因" / "already"。
    """
    # 0. 先查是不是风控验证页（找不到按钮多半是因为被验证码顶掉了）
    if await _check_captcha(tab):
        return "captcha"

    # 1. 点"聊一聊"主按钮
    try:
        btn = await tab.find("聊一聊", best_match=True, timeout=10)
        if not btn:
            return "captcha" if await _check_captcha(tab) else "failed: 找不到聊一聊按钮"
        await btn.click()
        await asyncio.sleep(3)
    except Exception as e:  # noqa: BLE001
        return f"failed: 点聊一聊异常 {e}"

    # 1.5 点击后检查平台限额提示（动作点检测）
    if await _check_limit_alert(tab):
        return "limit"

    # 2. 找输入框，填招呼语
    try:
        box = await tab.find("请输入文字", best_match=True, timeout=10)
        if not box:
            # 退而求其次用 textarea 选择器
            box = await tab.select("textarea.im-ui-textarea", timeout=8)
        if not box:
            return "captcha" if await _check_captcha(tab) else "failed: 找不到聊天输入框"
        await box.click()
        await asyncio.sleep(1)
        # nodriver 输入：send_keys
        await box.send_keys(greeting)
        await asyncio.sleep(1)
    except Exception as e:  # noqa: BLE001
        return f"failed: 输入招呼语异常 {e}"

    # 3. 点"发送"按钮
    try:
        send = await tab.find("发送", best_match=True, timeout=8)
        if not send:
            send = await tab.select("button.im-ui-basic-send-btn", timeout=6)
        if not send:
            return "failed: 找不到发送按钮"
        await send.click()
        await asyncio.sleep(2)
    except Exception as e:  # noqa: BLE001
        return f"failed: 点发送异常 {e}"

    # 3.5 发送后二次检查平台限额提示（防止某些版本在点击发送后才弹限额气泡）
    if await _check_limit_alert(tab):
        return "limit"

    return "sent"
