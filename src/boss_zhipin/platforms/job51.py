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


# 51job 网页登录凭证 cookie：accountid（个人账号专属 ID，登录成功后才写入、游客绝无）
# 严禁加入 51job 访客追踪 cookie 或 partner_session，否则打开过登录页的访客会被误判已就绪
JOB51_LOGIN_COOKIE_NAMES = ("accountid",)


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
        if state is True or self.is_recently_verified():
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

        # 导航至 51job 官方登录页供扫码。
        # 规范：打开登录浏览器旨在引导用户进行扫码，初始一律返回 logged_in=False，
        # 绝不抢跑关闭窗口；后续由前端 4s 轮询 check_login_status 侦测真实扫码结果。
        tab = await browser.get("https://login.51job.com/login.php?lang=c")
        driver._tab = tab
        try:
            await tab.activate()
            await tab.bring_to_front()
        except Exception:
            pass

        return {
            "status": "opened",
            "logged_in": False,
            "platform": "job51",
            "url": str(getattr(tab, "url", "https://login.51job.com/login.php?lang=c")),
        }
