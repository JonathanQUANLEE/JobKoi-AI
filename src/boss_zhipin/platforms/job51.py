"""前程无忧 (51job) 平台适配器实现。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from boss_zhipin.paths import get_platform_profile_dir
from boss_zhipin.platforms.base import BasePlatform, PlatformInfo
from boss_zhipin.platforms.browser_lookup import apply_browser_fallback
from boss_zhipin.platforms.cookies_probe import read_cookie_state

log = logging.getLogger(__name__)


# 51job 网页登录凭证 cookie：51job（内含 cuid）、accountid、partner_session
JOB51_LOGIN_COOKIE_NAMES = ("51job", "accountid", "partner_session")


class Job51Platform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "job51"

    def _get_profile_dir(self) -> Path:
        # 打包加固（2026-10-13）：standalone 下安装目录 UAC 只读，profile
        # 一律去 %APPDATA%；dev 模式仍是仓库根 job51_profile（与
        # src/job51/driver.py 的 PROFILE_DIR 同一真相源）。
        return get_platform_profile_dir("job51", dev_root=self.root_dir)

    def _cookie_login_state(self) -> bool | None:
        """True=有登录凭证 / False=明确未登录 / None=读不出（Chrome 锁库待验证）。"""
        return read_cookie_state(
            self._get_profile_dir(), "%51job.com", JOB51_LOGIN_COOKIE_NAMES
        )

    def check_login(self) -> bool:
        """同步登录态（accountid 等凭证证据），给平台中心展示用。"""
        return self._cookie_login_state() is True

    def get_info(self) -> PlatformInfo:
        state = self._cookie_login_state()
        if state is True:
            is_logged, status_text = True, "已就绪 (免密免登)"
        elif state is False:
            is_logged, status_text = False, "未登录 (需扫码)"
        else:
            is_logged, status_text = False, "待验证 (点「换号」确认登录)"
        return PlatformInfo(
            id=self.platform_id,
            name="前程无忧 51job",
            tagline="传统名企与外企制造 · 每日限额 40 · 直接投递简历",
            daily_limit=40,
            theme_color="#ff5000",
            is_supported=True,
            is_logged_in=is_logged,
            status_text=status_text,
        )

    async def open_login_browser(self) -> dict[str, Any]:
        import asyncio
        import job51.driver as driver
        import nodriver as uc
        from nodriver import Config

        # 换号语义：先优雅关闭旧实例 + 回收本 profile 孤儿 Chrome
        await driver.shutdown()
        driver.cleanup_profile()

        cfg = Config()
        cfg.user_data_dir = str(self._get_profile_dir())
        cfg.headless = False
        cfg.sandbox = False
        # 无 Chrome 电脑自愈：自动降级 Edge（Chromium 兼容内核）
        apply_browser_fallback(cfg)
        browser = await uc.start(config=cfg)
        driver._browser = browser

        # 核心设计（与 BOSS 对齐）：
        # 导航至 51job 官方登录页 https://login.51job.com/login.php?lang=c：
        # 1. 弹出 51job 扫码登录页供用户扫码；
        # 2. 若用户已持久化登录且 51job 自动跳回首页/个人中心，秒级识别 logged_in=True；
        # 3. 若未登录，页面停留在登录页，logged_in=False，由前端展示扫码引导并启动 4s 轮询等待扫码完成。
        tab = await browser.get("https://login.51job.com/login.php?lang=c")
        driver._tab = tab
        try:
            await tab.activate()
            await tab.bring_to_front()
        except Exception:
            pass

        await asyncio.sleep(2.0)
        logged_in = False
        try:
            logged_in = await driver.is_logged_in(tab)
        except Exception:
            logged_in = False

        return {
            "status": "opened",
            "logged_in": logged_in,
            "platform": "job51",
            "url": str(getattr(tab, "url", "https://login.51job.com/login.php?lang=c")),
        }
