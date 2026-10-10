"""平台注册与调度中枢（Platform Manager）。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from boss_zhipin.platforms.base import BasePlatform
from boss_zhipin.platforms.boss import BossPlatform
from boss_zhipin.platforms.job51 import Job51Platform
from boss_zhipin.platforms.liepin import LiepinPlatform
from boss_zhipin.platforms.zhaopin import ZhaopinPlatform


class PlatformManager:
    """集中管理所有多平台适配器实例。"""

    def __init__(self, root_dir: Path | None = None) -> None:
        self.root_dir = root_dir
        self._platforms: dict[str, BasePlatform] = {
            "boss": BossPlatform(root_dir=self.root_dir),
            "liepin": LiepinPlatform(root_dir=self.root_dir),
            "job51": Job51Platform(root_dir=self.root_dir),
            "zhaopin": ZhaopinPlatform(root_dir=self.root_dir),
        }

    def get_platform(self, platform_id: str) -> BasePlatform | None:
        return self._platforms.get(platform_id)

    def list_platforms(self) -> list[dict[str, Any]]:
        """列出所有支持的平台及其当前登录态与今日投递统计。"""
        from boss_zhipin.gui.stats_io import query_stats

        logs_dir = self.root_dir / "logs" if self.root_dir else None
        try:
            stats = query_stats(logs_dir)
        except Exception:
            stats = {}

        result: list[dict[str, Any]] = []
        for p in self._platforms.values():
            info = p.get_info().to_dict()
            p_stat = stats.get(p.platform_id, {})
            info["today_sent"] = int(p_stat.get("today", 0))
            info["total_sent"] = int(p_stat.get("total", 0))
            info["remaining"] = int(p_stat.get("remaining", info.get("daily_limit", 150)))
            result.append(info)
        return result

    async def open_login(self, platform_id: str) -> dict[str, Any]:
        """打开指定平台的扫码登录/手动筛选窗口。"""
        platform = self.get_platform(platform_id)
        if not platform:
            return {"status": "error", "message": f"未知的招聘平台: {platform_id}"}
        return await platform.open_login_browser()


# 默认单例
_default_manager: PlatformManager | None = None


def get_platform_manager() -> PlatformManager:
    global _default_manager
    if _default_manager is None:
        _default_manager = PlatformManager()
    return _default_manager
