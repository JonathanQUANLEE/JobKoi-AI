"""BOSS 直聘平台适配器实现。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from boss_zhipin.platforms.base import BasePlatform, PlatformInfo

log = logging.getLogger(__name__)


class BossPlatform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "boss"

    def _get_profile_dir(self) -> Path:
        return self.root_dir / "chrome_profile"

    def check_login(self) -> bool:
        profile_dir = self._get_profile_dir()
        if not profile_dir.is_dir():
            return False
        # 只要存在默认网络 Cookie 数据库且非空，通常已有持久化登录态
        cookie_candidates = [
            profile_dir / "Default" / "Network" / "Cookies",
            profile_dir / "Default" / "Cookies",
        ]
        return any(c.is_file() and c.stat().st_size > 0 for c in cookie_candidates)

    def get_info(self) -> PlatformInfo:
        is_logged = self.check_login()
        return PlatformInfo(
            id=self.platform_id,
            name="BOSS 直聘",
            tagline="互联网与高薪岗主力 · 每日限额 150 · 点立即沟通",
            daily_limit=150,
            theme_color="#00bebd",
            is_supported=True,
            is_logged_in=is_logged,
            status_text="已就绪 (免密免登)" if is_logged else "未登录 (需扫码)",
        )

    async def open_login_browser(self) -> dict[str, Any]:
        from boss_zhipin.website_oper import finding_jobs

        return await finding_jobs.prepare_manual_boss_page()
