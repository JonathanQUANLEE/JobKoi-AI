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
import subprocess
from pathlib import Path

import nodriver as uc
from nodriver import Config

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent.parent

PROFILE_DIR = os.path.abspath(
    os.environ.get("LIEPIN_CHROME_PROFILE", str(ROOT / "liepin_profile"))
)

SEARCH_TMPL = "https://www.liepin.com/zhaopin/?key={kw}"

_browser: uc.Browser | None = None
_tab: uc.Tab | None = None

# 卡片解析 JS：抓 jobId、标题、链接（公司名在详情页再取）
PARSE_CARDS_JS = r"""
(() => {
  const out = [];
  document.querySelectorAll('.jobCardPcContainer').forEach(c => {
    const a = c.querySelector('a[data-nick="job-detail-job-info"]');
    const titleEl = c.querySelector('.jobTitleBox .ellipsis-1, [class*=jobTitle] .ellipsis-1');
    const title = (titleEl && titleEl.textContent || '').trim();
    let jobId = '';
    const ext = c.getAttribute('data-tlg-ext') || '';
    try { jobId = JSON.parse(decodeURIComponent(ext)).jobId || ''; } catch (e) {}
    // 公司名：卡片里 HR 行（形如 "金女士·资深招聘专家"）前面的那一段短文本
    const textLines = (c.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    let company = '';
    for (let i = 0; i < textLines.length; i++) {
      if (/女士|先生|HR|经理|顾问|招聘|猎头/.test(textLines[i]) && i > 0) {
        company = textLines[i - 1];
        break;
      }
    }
    out.push({ title, company, jobId, href: (a && a.href) || '' });
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


def _kill_profile_chrome(profile_dir: str) -> None:
    subprocess.run(
        [
            "powershell", "-NoProfile", "-Command",
            f"Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | "
            f"Where-Object {{ $_.CommandLine -like '*{profile_dir}*' }} | "
            f"ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}",
        ],
        capture_output=True,
    )


def _clear_singleton_locks(profile_dir: str) -> None:
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            os.remove(os.path.join(profile_dir, name))
        except FileNotFoundError:
            pass
        except Exception:  # noqa: BLE001
            pass


def cleanup_profile() -> None:
    _kill_profile_chrome(PROFILE_DIR)
    _clear_singleton_locks(PROFILE_DIR)


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
    await asyncio.sleep(6)
    return _tab


async def shutdown() -> None:
    global _browser, _tab
    if _browser is not None:
        try:
            _browser.stop()
        except Exception:  # noqa: BLE001
            pass
    _browser = None
    _tab = None


async def is_logged_in(tab: uc.Tab) -> bool:
    """登录判据：URL 离开 /login，且页面顶部无"登录/注册"。"""
    try:
        txt = await tab.evaluate("(document.body && document.body.innerText || '')")
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(txt, str):
        return False
    url = str(getattr(tab, "url", "") or "")
    return "/login" not in url and "登录/注册" not in txt[:1000]


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


async def click_chat_and_send(tab: uc.Tab, greeting: str) -> str:
    """点详情页"聊一聊"，在 IM 输入框里发招呼语。

    返回 "sent" / "captcha"（触发风控，应立即停止） / "failed: 原因" / "already"。
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

    return "sent"
