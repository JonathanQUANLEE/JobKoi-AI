"""只做一件事：把 BOSS 登录态搞定，并把登录二维码截图落盘。

为什么单独拆一个脚本：
    主流程 `main.py --profile 0my` 里 log_in() 只等 300 秒且不截图，扫码窗口
    经常在后台悄悄过期，人还没看到就没了。这里改成：
      1. 先探测登录态，已登录就直接退出（秒回，不打扰）；
      2. 未登录 → 点开微信扫码入口；
      3. 把二维码**截图**到 logs/qrcode.png，同时尝试直接抠出 <img> 的地址
         写到 logs/qrcode_src.txt（图片比截图清晰，方便发给手机扫）；
      4. 轮询最长 15 分钟，二维码刷新时自动重截；
      5. 登录成功立刻退出，cookie 落进 chrome_profile，之后主流程免扫码。

登录成功后如果 ``BOSS_AUTO_INVEST=1``（默认开），会**直接接管**启动投递看门狗
`scripts/auto_invest.py`，实现"扫一次码 → 全自动投完"，不用人在旁边守着。

用法：
    uv run python scripts/ensure_login.py                # 默认等 900 秒
    BOSS_LOGIN_WAIT=7200 uv run python scripts/ensure_login.py   # 等 2 小时

退出码：0=已登录（或本次扫码成功），1=超时仍未登录。
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

LOGS = ROOT / "logs"
QR_PNG = LOGS / "qrcode.png"
QR_SRC = LOGS / "qrcode_src.txt"
WAIT_SECONDS = int(os.getenv("BOSS_LOGIN_WAIT", "900"))
HOME_URL = "https://www.zhipin.com/web/geek/jobs?query=AI%20Agent&city=100010000"
# 直接跳独立登录页：页面左侧天生就是微信二维码，不用在列表页上猜按钮。
LOGIN_URL = "https://www.zhipin.com/web/user/?ka=header-login"

# 登录后自动投递用的搜索词（都限定 jobType=1902 实习）。
# 用 quote 现编 URL，避免手抄 URL 编码出错。
# 关键词越多，岗位池越大。2026-10-04 实测：只用前 8 个投到 167 条就把池子扫完了
# （已联系 619 家公司，老关键词基本都是 seen），所以扩到 16 个。
# 全部都会被拼上 jobType=1902（实习）+ degree=203，方向不会跑偏。
DEFAULT_KEYWORDS = [
    # —— Agent / 智能体主线 ——
    "AI Agent",
    "Agent开发",
    "智能体",
    "智能体开发",
    "AI应用开发",
    # —— 大模型 / LLM ——
    "大模型",
    "大模型应用",
    "LLM",
    "多模态",
    # —— 技术点 ——
    "RAG",
    "提示词",
    "AIGC",
    "AI工程师",
    # —— 泛 AI 技术岗 ——
    "人工智能",
    "机器学习",
    "算法实习",
    # —— 2026-10-06 二扩：投过 784 家公司后老词全扫空了，补泛 AI/算法方向 ——
    # 仍是计算机/AI 技术岗，没有往纯后端/前端/销售方向跑偏。
    "深度学习",
    "NLP",
    "计算机视觉",
    "大模型推理",
    "AI Infra",
    "算法工程师",
]


def _build_start_urls() -> list[str]:
    words = [w.strip() for w in os.getenv("BOSS_KEYWORDS", "").split(";") if w.strip()]
    if not words:
        words = DEFAULT_KEYWORDS
    # degree=203（限本科）会滤掉大量"学历不限"的岗位，2026-10-06 去掉了它，
    # 只保留 jobType=1902（实习）—— 本科生本来也能投不限学历的岗，池子大很多。
    tmpl = (
        "https://www.zhipin.com/web/geek/jobs"
        "?query={q}&city=100010000&jobType=1902"
    )
    return [tmpl.format(q=quote(w)) for w in words]


async def _release_browser(fj) -> None:
    """交出 profile：关掉自己开的 Chrome 并清 Singleton 锁。

    不这么做的话，ensure_login 自己的 Chrome 会一直占着 chrome_profile，
    接下来 auto_invest 起的 main.py 连不上浏览器（"Failed to connect to browser"），
    第一轮直接白跑。
    """
    try:
        await fj.shutdown()
    except Exception as e:  # noqa: BLE001
        _log(f"[login] 关闭浏览器失败（不致命）：{e}")
    try:
        fj._clear_singleton_locks(fj.CHROME_PROFILE_DIR)
    except Exception as e:  # noqa: BLE001
        _log(f"[login] 清 Singleton 锁失败（不致命）：{e}")
    await asyncio.sleep(3)


def _launch_auto_invest() -> None:
    """登录成功后接管：启动投递看门狗（click-only + 多关键词轮换）。"""
    if os.getenv("BOSS_AUTO_INVEST", "1").strip().lower() in ("0", "false", "no"):
        _log("[login] BOSS_AUTO_INVEST=0，跳过自动投递")
        return
    urls = _build_start_urls()
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["BOSS_CLICK_ONLY"] = "1"          # 硬保险：只点"立即沟通"，绝不发消息
    env["BOSS_START_URLS"] = ";".join(urls)
    _log(f"[login] 登录已就绪，接管启动投递看门狗（{len(urls)} 个关键词轮换）")
    for u in urls:
        _log(f"        · {u}")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "auto_invest.py")],
        cwd=str(ROOT),
        env=env,
    )


def _log(msg: str) -> None:
    print(msg, flush=True)


async def _grab_qr(tab) -> None:
    """截图二维码到 logs/qrcode.png，并尝试抠出 <img src>。"""
    LOGS.mkdir(parents=True, exist_ok=True)
    try:
        await tab.save_screenshot(str(QR_PNG))
        _log(f"[qr] 已截图 → {QR_PNG}")
    except Exception as e:  # noqa: BLE001
        _log(f"[qr] 截图失败：{e}")

    try:
        srcs = await tab.evaluate(
            """
            (() => {
              const out = [];
              document.querySelectorAll('img').forEach(img => {
                const s = img.getAttribute('src') || '';
                const w = img.naturalWidth || img.clientWidth || 0;
                if (w < 80) return;
                if (/qr|qrcode|scan/i.test(s) || w >= 120) {
                  out.push(s + '  (' + w + 'x' + (img.naturalHeight || img.clientHeight || 0) + ')');
                }
              });
              return out;
            })()
            """
        )
        if srcs:
            lines = [str(s) for s in srcs]
            QR_SRC.write_text("\n".join(lines), encoding="utf-8")
            _log(f"[qr] 抠到 {len(lines)} 个候选图片地址 → {QR_SRC}")
        else:
            _log("[qr] 没抠到二维码 img，以截图为准")
    except Exception as e:  # noqa: BLE001
        _log(f"[qr] 抠 img 失败：{e}")


async def _go_login_page(tab) -> None:
    """跳到独立登录页并确认二维码出现。"""
    _log(f"[login] 直接跳登录页 {LOGIN_URL}")
    await tab.get(LOGIN_URL)
    await asyncio.sleep(5)
    _log(f"[login] 登录页 URL: {getattr(tab, 'url', '')}")
    # 登录页有时默认是"手机验证码"标签，二维码在"微信登录"标签下；
    # 能找到微信登录入口就点一下，找不到就默认截图（多数情况默认就是二维码）。
    try:
        wechat = await tab.find("微信登录", best_match=True, timeout=6)
        if wechat:
            await wechat.click()
            _log("[login] 已点'微信登录'标签")
            await asyncio.sleep(3)
    except Exception as e:  # noqa: BLE001
        _log(f"[login] 没找到'微信登录'标签（{e}），按当前页面截图")


async def main() -> int:
    from boss_zhipin.website_oper import finding_jobs as fj

    await fj.open_browser_with_options(HOME_URL, "chrome")
    _log(f"[login] 当前 URL: {fj.get_current_url()}")

    if await fj._is_logged_in():
        _log("[login] ALREADY_LOGGED_IN：已登录，无需扫码")
        await _release_browser(fj)
        _launch_auto_invest()
        return 0

    _log("[login] 未登录，跳转登录页拿二维码...")
    await _go_login_page(fj._tab)

    await _grab_qr(fj._tab)
    _log(f"[login] 等待扫码登录...（最多 {WAIT_SECONDS} 秒）")

    deadline = asyncio.get_event_loop().time() + WAIT_SECONDS
    last_shot = 0.0
    while asyncio.get_event_loop().time() < deadline:
        if await fj._is_logged_in():
            _log("[login] LOGIN_OK：登录成功，cookie 已写入 chrome_profile")
            try:
                QR_PNG.unlink(missing_ok=True)
            except OSError:
                pass
            await _release_browser(fj)
            _launch_auto_invest()
            return 0
        # 二维码会过期刷新，每 60 秒重截一次
        now = asyncio.get_event_loop().time()
        if now - last_shot > 60:
            await _grab_qr(fj._tab)
            last_shot = now
        await asyncio.sleep(3)

    _log("[login] LOGIN_TIMEOUT：超时仍未登录")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
