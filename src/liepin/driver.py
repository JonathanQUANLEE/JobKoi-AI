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
import random
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


async def open_browser(url: str, headless: bool = False) -> uc.Tab:
    global _browser, _tab
    os.makedirs(PROFILE_DIR, exist_ok=True)
    cleanup_profile()
    cfg = Config()
    cfg.user_data_dir = PROFILE_DIR
    cfg.headless = headless
    cfg.sandbox = False  # Chrome 154 + nodriver 0.50.x 下更稳
    # 无 Chrome 电脑自愈：自动降级 Edge（Chromium 兼容内核）
    apply_browser_fallback(cfg)
    _browser = await uc.start(config=cfg)
    # 直接在 Chrome 启动自带的初始窗口里导航（不开新窗口）——与 BOSS 同款
    # 修法：new_window=True 会留下 Chrome 原生空白窗口，用户看到两个窗口
    # （2026-10-13 用户实测反馈）。
    _tab = await _browser.get(url)
    if not headless:
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
      不打扰；打开是读未读的唯一途径——猎聘没有免浏览器的未读接口；无头模式运行绝不弹窗）；
    - 浏览器已开（巡航中/登录后）：从当前受控页直接读，**绝不导航**——
      巡航中的搜索/详情页不能被未读检查打断。

    Returns::

        {"status": "ok", "unread": 19, "chat_url": "https://c.liepin.com/"}
        {"status": "error", "code": "no_tab"|"no_widget", "message": str}
    """
    global _browser, _tab
    opened_here = _browser is None
    if opened_here:
        tab = await open_browser("https://c.liepin.com/", headless=True)
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


class LiepinBannedError(RuntimeError):
    """猎聘账号被临时封禁（「账号行为异常」页，2026-10-15 用户实测约 2 小时自动解锁）。"""


# 封禁页正文特征（截图中的人话原文，任一命中即判）
_BAN_PAGE_KEYWORDS = ("账号行为异常", "异常访问行为", "暂时禁止访问")


async def _check_ban_page(tab: uc.Tab) -> bool:
    """检测「账号行为异常」封禁页（2026-10-15 封号复盘）。

    该页会顶掉搜索/详情内容——不识别的话整轮巡航静默空转（每词 0 岗位），
    用户还以为没岗位了。
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


async def human_pause(low: float, high: float) -> None:
    """拟人化停顿：高斯钟形分布（截断进 [low, high]），替代均匀 random.uniform。

    2026-10-15 网络调研（JobPilot「Human Actor」技术文）：平台风控不止看
    间隔长短，还看间隔的**分布形状**——真人的动作间隔服从钟形（高斯）
    分布，均匀分布的"随机"延迟同样是机器签名。取区间中点为均值、
    1/4 区间宽为标准差，越界截断回区间（不影响"只慢不快"红线）。
    """
    mid = (low + high) / 2.0
    sigma = max((high - low) / 4.0, 0.05)
    value = random.gauss(mid, sigma)
    await asyncio.sleep(min(high, max(low, value)))


async def goto_search(tab: uc.Tab, keyword: str) -> list[dict]:
    from urllib.parse import quote

    await tab.get(SEARCH_TMPL.format(kw=quote(keyword)))
    # 封禁页检测：第一时间识别并叫停（抛 LiepinBannedError 由 apply 层
    # 转成用户可见事件 + 安全停止），不再静默空转整轮。
    if await _check_ban_page(tab):
        raise LiepinBannedError("猎聘「账号行为异常」临时封禁页（通常约 2 小时自动解锁）")
    # 拟人化浏览（2026-10-15 调研：人类的搜索页行为是 加载→扫一眼→滚动
    # 看几条→再行动；机器是加载完立即批量抽 DOM，Session Behavior 是
    # 六大检测维度之一）。固定 sleep(6) 是机器签名，改高斯停顿；滚动
    # 顺带触发懒加载，能多抓首屏以下的卡片。
    await human_pause(3.5, 7.0)
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


def _greeting_text() -> str:
    p = ROOT / "greetings" / "liepin-greeting.txt"
    if p.exists():
        t = p.read_text(encoding="utf-8").strip()
        if t:
            return t
    return "对这个职位很感兴趣，希望可以详聊"


def pick_greeting(fallback: str = "") -> str:
    """每个岗位随机挑一条招呼语（2026-10-15 封号复盘用户拍板）。

    模板池 ``greetings/liepin-greetings-pool.txt`` 优先（一行一条，可由
    用户自行编辑替换）：同一句固定招呼语连发几百次是最明显的内容指纹。
    池不存在/为空时退回 fallback（调用方传入的默认招呼语，行为同旧）。
    """
    pool = ROOT / "greetings" / "liepin-greetings-pool.txt"
    try:
        lines = [
            ln.strip()
            for ln in pool.read_text(encoding="utf-8").splitlines()
            if ln.strip()
        ]
    except OSError:
        lines = []
    if lines:
        return random.choice(lines)
    return fallback


async def open_detail(tab: uc.Tab, href: str) -> None:
    await tab.get(href)
    # 拟人化"阅读"停顿（2026-10-15 调研：JobPilot——人类在新页面上行动前
    # 有 reading pause；ApplyGoat——人扫一个岗 30s、细读 3min）。旧固定
    # sleep(5) 秒开秒关详情页，是"高频访问"画像的直接来源（本次封禁
    # 正是"异常**访问**行为"而非打招呼超限）。
    await human_pause(8.0, 20.0)


async def detail_company(tab: uc.Tab) -> str:
    """从详情页抓公司名（去重用）。

    2026-10-18 审查加固：旧版只靠两 fragile 正则（依赖"已认证·X"特定格式），
    失败则 company=""，公司维度去重静默失效 → 同公司多岗重复投递。
    现在 DOM 结构化提取优先（猎聘详情页公司名常见于 .company-name /
    [class*=company] 等节点），innerText 正则做兜底，最后 document.title
    （页面标题通常含公司名）做最终兜底——三层保证尽量拿到公司名。
    """
    # ① DOM 结构化提取（最稳）
    try:
        raw = await asyncio.wait_for(
            tab.evaluate(
                "(() => {"
                " const el = document.querySelector("
                "   '.company-name, [class*=company-name], [class*=companyName]',"
                " );"
                " if (el) return (el.textContent || '').trim().slice(0, 60);"
                " return '';"
                "})()"
            ),
            timeout=5,
        )
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    except Exception:  # noqa: BLE001
        pass
    # ② innerText 正则（旧逻辑兜底）
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


def _message_sending_disabled() -> bool:
    """只点"聊一聊"，禁止再手动发消息（2026-10-15 用户实测拍板，默认开）。

    用户在页面上实测发现：点击"聊一聊"后**猎聘已自动给 HR 发了一段
    默认招呼**——再手打一条属于双重消息，既多余又极易被风控识别。
    与 BOSS 的 BOSS_CLICK_ONLY 同款机制；LIEPIN_CLICK_ONLY=0 可恢复
    手发（不建议，仅为紧急回退保留）。
    """
    return os.getenv("LIEPIN_CLICK_ONLY", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


async def _type_human(box, text: str) -> None:
    """逐字符拟人输入：60~150ms/字符，标点/空格处长停顿。

    2026-10-15 调研（JobPilot）：人类打字 100-200ms/字符且节奏有起伏；
    整串 send_keys 是"粘贴级"速度，IM 输入框的 typing 事件上报后指纹
    明显。逐字符失败时兜底回整串输入——拟人化绝不能以发送失败为代价
    （异常向上抛由 click_chat 捕获，岗位安全跳过、不发错话）。
    仅在 LIEPIN_CLICK_ONLY=0 的手发模式下使用。
    """
    try:
        for ch in text:
            await box.send_keys(ch)
            if ch in "，。！？；、,.!?; ":
                await asyncio.sleep(random.uniform(0.25, 0.6))
            else:
                await asyncio.sleep(random.uniform(0.06, 0.15))
    except Exception as e:  # noqa: BLE001
        log.warning("逐字符输入失败，回退整串输入：%s", e)
        await box.send_keys(text)


async def click_chat(tab: uc.Tab, greeting: str = "") -> str:
    """点详情页"聊一聊"建立对话（平台会自动给 HR 发默认招呼）。

    2026-10-15 用户实测拍板：点击"聊一聊"后猎聘已自动发一段招呼给 HR，
    再手打一条属于双重消息、极易被检测封号——默认**只点击不手发**
    （_message_sending_disabled，与 BOSS_CLICK_ONLY 同款）。

    返回 "sent"（对话已建立，平台默认招呼已发出）/ "limit"（平台今日
    上限）/ "captcha" / "banned"（封禁页）/ "failed: 原因"。
    """
    # 0. 先查是不是封禁页/风控验证页（找不到按钮多半是因为被它们顶掉了）
    if await _check_ban_page(tab):
        return "banned"
    if await _check_captcha(tab):
        return "captcha"

    # 1. 点"聊一聊"主按钮（这一下就完成打招呼——平台自动发默认话术）
    try:
        btn = await tab.find("聊一聊", best_match=True, timeout=10)
        if not btn:
            return "captcha" if await _check_captcha(tab) else "failed: 找不到聊一聊按钮"
        await btn.click()
        await human_pause(2.0, 4.0)
    except Exception as e:  # noqa: BLE001
        return f"failed: 点聊一聊异常 {e}"

    # 1.5 点击后检查平台限额提示（动作点检测）
    if await _check_limit_alert(tab):
        return "limit"

    # 2. 默认路径：只点击（平台已自动发默认招呼），等对话稳定即完成
    if _message_sending_disabled():
        await human_pause(1.0, 2.0)
        return "sent"

    # 3.（紧急回退：LIEPIN_CLICK_ONLY=0）手发模式——找输入框逐字符输入
    try:
        box = await tab.find("请输入文字", best_match=True, timeout=10)
        if not box:
            # 退而求其次用 textarea 选择器
            box = await tab.select("textarea.im-ui-textarea", timeout=8)
        if not box:
            return "captcha" if await _check_captcha(tab) else "failed: 找不到聊天输入框"
        await box.click()
        await human_pause(0.4, 1.0)
        await _type_human(box, greeting)
        await human_pause(0.5, 1.2)
    except Exception as e:  # noqa: BLE001
        return f"failed: 输入招呼语异常 {e}"

    # 4.（手发模式）点"发送"按钮
    try:
        send = await tab.find("发送", best_match=True, timeout=8)
        if not send:
            send = await tab.select("button.im-ui-basic-send-btn", timeout=6)
        if not send:
            return "failed: 找不到发送按钮"
        await send.click()
        await human_pause(1.5, 3.0)
    except Exception as e:  # noqa: BLE001
        return f"failed: 点发送异常 {e}"

    # 4.5（手发模式）发送后二次检查平台限额提示（防止点击发送后才弹限额气泡）
    if await _check_limit_alert(tab):
        return "limit"

    return "sent"
