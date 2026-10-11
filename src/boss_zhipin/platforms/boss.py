"""BOSS 直聘平台适配器实现。

登录态判定（2026-10-11 假就绪事故后的最终版）：
- 只认**登录凭证 cookie ``bst``**（BOSS Session Token，登录后才有、游客绝无）
  且必须持久未过期——游客的统计/防爬 cookie（__zp_stoken__ 等）一概不算；
- 实测教训：扫完 7 条游客 cookie 也曾被误判"已就绪"，根因是判据太宽。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from boss_zhipin.platforms.base import BasePlatform, PlatformInfo
from boss_zhipin.platforms.cookies_probe import read_cookie_state

log = logging.getLogger(__name__)

# BOSS 网页登录的唯一凭证 cookie：登录成功才写入、游客绝无
BOSS_LOGIN_COOKIE_NAMES = ("bst",)


class BossPlatform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "boss"

    def _get_profile_dir(self) -> Path:
        return self.root_dir / "chrome_profile"

    def _cookie_login_state(self) -> bool | None:
        """True=有 bst 登录凭证 / False=明确未登录 / None=读不出（待验证）。

        性能红线：在平台列表展示路径上（list_platforms 秒回），
        timeout=0 绝不等 Chrome 的数据库锁。
        """
        return read_cookie_state(
            self._get_profile_dir(), "%zhipin.com", BOSS_LOGIN_COOKIE_NAMES
        )

    def check_login(self) -> bool:
        """同步登录态（bst cookie 证据），给平台中心展示用。"""
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
            name="BOSS 直聘",
            tagline="互联网与高薪岗主力 · 每日限额 150 · 点立即沟通",
            daily_limit=150,
            theme_color="#00bebd",
            is_supported=True,
            is_logged_in=is_logged,
            status_text=status_text,
        )

    async def open_login_browser(self) -> dict[str, Any]:
        """换号/登录：**无条件关掉旧会话，开一个全新的登录窗口**（立即返回不等扫码）。

        2026-10-11 报错实锤的两种死法，本实现从根上消灭：
        ① 用户手误关掉浏览器后 ``_tab`` 仍是死引用 → 旧代码 ``tab.get()``
           直接抛 ConnectionRefusedError（"远程计算机拒绝网络连接"）；
        ② 旧应用遗留的孤儿 Chrome 占着 profile → 新启动连不上调试端口。
        现在换号 = shutdown 清引用关旧浏览器 → open_browser_with_options
        内部 reap 孤儿 Chrome + 清 Singleton 锁 → 全新窗口直达登录页。
        用户每次点「换号」都得到响应本次点击的新登录页。
        """
        from boss_zhipin.website_oper import finding_jobs
        from boss_zhipin.website_oper.core.login_detector import (
            BOSS_LOGIN_URL,
            _is_logged_in,
            _wait_url_stable,
        )

        # 1) 无条件回收旧会话（活着的旧浏览器关掉；已死的清引用）
        await finding_jobs.shutdown()

        # 2) 全新启动（内部先 reap 占 profile 的孤儿 Chrome，再起浏览器）
        await finding_jobs.open_browser_with_options(BOSS_LOGIN_URL, "chrome")
        tab = finding_jobs.get_tab()
        try:
            await tab.activate()
            await tab.bring_to_front()
        except Exception:  # noqa: BLE001
            pass
        await _wait_url_stable(stable_for=2.0, timeout=15)

        logged_in = False
        try:
            logged_in = await _is_logged_in()
        except Exception:  # noqa: BLE001
            logged_in = False
        return {"status": "opened", "logged_in": logged_in, "url": BOSS_LOGIN_URL}