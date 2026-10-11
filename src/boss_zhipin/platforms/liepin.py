"""猎聘平台适配器实现。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from boss_zhipin.platforms.base import BasePlatform, PlatformInfo
from boss_zhipin.platforms.cookies_probe import read_cookie_state

log = logging.getLogger(__name__)


class LiepinPlatform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "liepin"

    def _get_profile_dir(self) -> Path:
        return self.root_dir / "liepin_profile"

    def check_login(self) -> bool:
        """登录态 = 域内存在持久且未过期的 cookie（SQLite 真检查，不再只看文件存在）。"""
        return (
            read_cookie_state(self._get_profile_dir(), "%liepin.com") is True
        )

    def get_info(self) -> PlatformInfo:
        is_logged = self.check_login()
        return PlatformInfo(
            id=self.platform_id,
            name="猎聘 Liepin",
            tagline="中高端与海归名企岗 · 每日限额 100 · 必须发招呼语",
            daily_limit=100,
            theme_color="#ff7033",
            is_supported=True,
            is_logged_in=is_logged,
            status_text="已就绪 (免密免登)" if is_logged else "未登录 (需扫码)",
        )

    async def open_login_browser(self) -> dict[str, Any]:
        import nodriver as uc
        from nodriver import Config

        # 换号语义：先回收本 profile 的孤儿 Chrome + Singleton 锁，再全新启动
        # （与 BOSS 同款防护：防止旧实例占着 profile 导致启动失败）
        from liepin.driver import cleanup_profile

        cleanup_profile()
        cfg = Config()
        cfg.user_data_dir = str(self._get_profile_dir())
        cfg.headless = False
        browser = await uc.start(config=cfg)
        # 在初始窗口导航，避免留下 Chrome 原生空白窗口（单窗口体验）
        tab = await browser.get("https://www.liepin.com/login")
        try:
            await tab.activate()
            await tab.bring_to_front()
        except Exception:
            pass
        return {"status": "opened", "platform": "liepin", "url": "https://www.liepin.com/login"}
