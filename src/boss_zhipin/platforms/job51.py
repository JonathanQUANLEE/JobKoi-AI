"""前程无忧 (51job) 平台适配器实现。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from boss_zhipin.platforms.base import BasePlatform, PlatformInfo

log = logging.getLogger(__name__)


class Job51Platform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "job51"

    def _get_profile_dir(self) -> Path:
        return self.root_dir / "job51_profile"

    def check_login(self) -> bool:
        profile_dir = self._get_profile_dir()
        if not profile_dir.is_dir():
            return False
        cookie_candidates = [
            profile_dir / "Default" / "Network" / "Cookies",
            profile_dir / "Default" / "Cookies",
        ]
        return any(c.is_file() and c.stat().st_size > 0 for c in cookie_candidates)

    def get_info(self) -> PlatformInfo:
        is_logged = self.check_login()
        return PlatformInfo(
            id=self.platform_id,
            name="前程无忧 51job",
            tagline="传统名企与外企制造 · 每日限额 40 · 直接投递简历",
            daily_limit=40,
            theme_color="#ff5000",
            is_supported=True,
            is_logged_in=is_logged,
            status_text="已就绪 (免密免登)" if is_logged else "未登录 (需扫码)",
        )

    async def open_login_browser(self) -> dict[str, Any]:
        import nodriver as uc
        from nodriver import Config

        # 换号语义：先回收本 profile 的孤儿 Chrome + Singleton 锁，再全新启动
        from job51.driver import cleanup_profile

        cleanup_profile()
        cfg = Config()
        cfg.user_data_dir = str(self._get_profile_dir())
        cfg.headless = False
        browser = await uc.start(config=cfg)
        tab = await browser.get("https://login.51job.com/login.php?lang=c", new_window=True)
        try:
            await tab.activate()
            await tab.bring_to_front()
        except Exception:
            pass
        return {"status": "opened", "platform": "job51", "url": "https://login.51job.com/login.php?lang=c"}
