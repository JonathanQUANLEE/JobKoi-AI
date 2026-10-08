"""智联招聘平台扩展桩（证明六边形架构的开放封闭原则 OCP）。

未来接入智联招聘时，只需补齐该模块的真实自动化逻辑，无需改动任何核心框架或 UI。
"""

from __future__ import annotations

from typing import Any

from boss_zhipin.platforms.base import BasePlatform, PlatformInfo


class ZhaopinPlatform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "zhaopin"

    def check_login(self) -> bool:
        return False

    def get_info(self) -> PlatformInfo:
        return PlatformInfo(
            id=self.platform_id,
            name="智联招聘 (筹备中)",
            tagline="国企央企与校园秋招平台 · 即将开放接入",
            daily_limit=50,
            theme_color="#1976d2",
            is_supported=False,
            is_logged_in=False,
            status_text="筹备中",
        )

    async def open_login_browser(self) -> dict[str, Any]:
        return {
            "status": "unsupported",
            "platform": "zhaopin",
            "message": "智联招聘平台正在适配中，敬请期待！",
        }
