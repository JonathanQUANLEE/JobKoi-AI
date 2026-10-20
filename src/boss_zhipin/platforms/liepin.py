"""猎聘平台适配器实现。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from boss_zhipin.paths import get_platform_profile_dir
from boss_zhipin.platforms.base import BasePlatform, PlatformInfo
from boss_zhipin.platforms.browser_lookup import apply_browser_fallback
from boss_zhipin.platforms.cookies_probe import read_cookie_state

log = logging.getLogger(__name__)


# 猎聘网页登录凭证 cookie：登录成功才写入、游客绝无
# 严禁加入 liepin_login_valid（游客会被下发 false）或 UniqueKey 等访客 cookie
LIEPIN_LOGIN_COOKIE_NAMES = ("lt_auth",)


class LiepinPlatform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "liepin"

    def _get_profile_dir(self) -> Path:
        # 打包加固（2026-10-13）：standalone 下安装目录 UAC 只读，profile
        # 一律去 %APPDATA%；dev 模式仍是仓库根 liepin_profile（与
        # src/liepin/driver.py 的 PROFILE_DIR 同一真相源）。
        return get_platform_profile_dir("liepin", dev_root=self.root_dir)

    def _cookie_login_state(self) -> bool | None:
        """True=有登录凭证 / False=明确未登录 / None=读不出（Chrome 锁库待验证）。"""
        return read_cookie_state(
            self._get_profile_dir(), "%liepin.com", LIEPIN_LOGIN_COOKIE_NAMES
        )

    def check_login(self) -> bool:
        """同步登录态（lt_auth 等凭证证据），给平台中心展示用。"""
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
            name="猎聘 Liepin",
            tagline="中高端与海归名企岗 · 每日限额 100 · 必须发招呼语",
            daily_limit=100,
            theme_color="#ff7033",
            is_supported=True,
            is_logged_in=is_logged,
            status_text=status_text,
        )

    async def open_login_browser(self) -> dict[str, Any]:
        import asyncio
        import liepin.driver as driver
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

        # 打开猎聘求职端个人主页供用户扫码或查看状态。
        # 规范：打开登录浏览器旨在引导用户进行扫码，初始一律返回 logged_in=False，
        # 绝不抢跑关闭窗口；后续由前端 4s 轮询 check_login_status 侦测真实扫码结果。
        tab = await browser.get("https://c.liepin.com/")
        driver._tab = tab
        try:
            await tab.activate()
            await tab.bring_to_front()
        except Exception:
            pass

        return {
            "status": "opened",
            "logged_in": False,
            "platform": "liepin",
            "url": str(getattr(tab, "url", "https://c.liepin.com/")),
        }
