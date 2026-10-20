"""多平台适配器基础契约（六边形架构 - 平台端口定义）。

规范化所有招聘平台的生命周期：
1. 元数据信息（ID、名称、标语、品牌色、每日限额、是否已支持）；
2. 登录态校验（检测本地 profile 是否已持久化登录）；
3. 扫码与登录唤起（打开受控浏览器窗口供用户手机扫码）。

后续新增任意平台（如智联招聘、实习僧），只需继承 BasePlatform 并注册，
核心业务与前端无需任何侵入性修改。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from pathlib import Path
from time import time as _time
from typing import Any


@dataclass
class PlatformInfo:
    id: str
    name: str
    tagline: str
    daily_limit: int
    theme_color: str
    is_supported: bool = True
    is_logged_in: bool = False
    status_text: str = "未登录"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class BasePlatform(ABC):
    """所有招聘平台适配器的抽象基类。"""

    def __init__(self, root_dir: Path | None = None) -> None:
        self.root_dir = root_dir or Path(__file__).resolve().parent.parent.parent.parent
        self._last_verified_at: float = 0.0

    def mark_login_verified(self) -> None:
        """标记该平台刚刚在活跃会话中确认登录成功。"""
        self._last_verified_at = _time()

    def is_recently_verified(self, max_age: float = 45.0) -> bool:
        """是否在最近 max_age 秒内刚被活跃探测证实已登录（平滑 SQLite 关进程锁）。"""
        return (_time() - self._last_verified_at) < max_age

    @property
    @abstractmethod
    def platform_id(self) -> str:
        """平台唯一标识，如 'boss', 'liepin', 'job51'。"""

    @abstractmethod
    def get_info(self) -> PlatformInfo:
        """获取当前平台的基础信息与登录状态。"""

    @abstractmethod
    def check_login(self) -> bool:
        """检查本地登录态（Cookie / Session）是否有效且已持久化。"""

    @abstractmethod
    async def open_login_browser(self) -> dict[str, Any]:
        """打开该平台的专属受控浏览器窗口，供用户扫码或手动筛选。"""
