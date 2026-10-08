"""多平台适配器模块。"""

from boss_zhipin.platforms.base import BasePlatform, PlatformInfo
from boss_zhipin.platforms.boss import BossPlatform
from boss_zhipin.platforms.job51 import Job51Platform
from boss_zhipin.platforms.liepin import LiepinPlatform
from boss_zhipin.platforms.manager import PlatformManager, get_platform_manager
from boss_zhipin.platforms.zhaopin import ZhaopinPlatform

__all__ = [
    "BasePlatform",
    "PlatformInfo",
    "BossPlatform",
    "LiepinPlatform",
    "Job51Platform",
    "ZhaopinPlatform",
    "PlatformManager",
    "get_platform_manager",
]
