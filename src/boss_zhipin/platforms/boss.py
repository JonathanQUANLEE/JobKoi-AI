"""BOSS 直聘平台适配器实现。

登录态判定（2026-10-11 修复"假就绪"）：
- 不再用「Cookies 文件存在」当已登录——文件永远存在，cookie 却会过期。
- 读取 Chrome Cookies SQLite 里 zhipin.com 域 cookie 的 expires_utc
  （Chrome 时间基准 1601-01-01，微秒），存在未过期的持久 cookie 才判「已就绪」；
- 全部过期/无 cookie → 「未登录 (需扫码)」；数据库读不出（被 Chrome 锁定等）
  → 「待验证」，绝不冒充已就绪。
- 浏览器已打开时，`detect_login_state()` 再用 DOM + URL 双重探测覆盖
  （`login_detector._is_logged_in`），静态快照进化为真实校验。
"""

from __future__ import annotations

import logging
import sqlite3
import time
from pathlib import Path
from typing import Any

from boss_zhipin.platforms.base import BasePlatform, PlatformInfo

log = logging.getLogger(__name__)

# Unix epoch 与 Chrome cookie 时间基准（1601-01-01T00:00:00Z）的微秒差
_CHROME_EPOCH_OFFSET_MICROS = 11644473600000000


class BossPlatform(BasePlatform):
    @property
    def platform_id(self) -> str:
        return "boss"

    def _get_profile_dir(self) -> Path:
        return self.root_dir / "chrome_profile"

    def _cookie_login_state(self) -> bool | None:
        """True=有未过期 cookie / False=无 cookie 或全过期 / None=读不出。"""
        profile_dir = self._get_profile_dir()
        if not profile_dir.is_dir():
            return False
        now_micros = int(time.time() * 1_000_000) + _CHROME_EPOCH_OFFSET_MICROS
        candidates = [
            profile_dir / "Default" / "Network" / "Cookies",
            profile_dir / "Default" / "Cookies",
        ]
        checked = False
        for db_path in candidates:
            if not db_path.is_file():
                continue
            checked = True
            try:
                conn = sqlite3.connect(
                    f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=3
                )
                rows = conn.execute(
                    "SELECT expires_utc, is_persistent FROM cookies "
                    "WHERE host_key LIKE '%zhipin.com'"
                ).fetchall()
                conn.close()
            except sqlite3.Error as e:
                log.debug("读 %s 失败（可能被 Chrome 锁定）: %s", db_path.name, e)
                continue
            if not rows:
                return False
            # expires_utc=0 表示会话 cookie；持久 cookie 需未过期
            alive = any(
                not persistent or expires == 0 or expires > now_micros
                for expires, persistent in rows
            )
            return alive
        if not checked:
            return None
        return False

    def check_login(self) -> bool:
        """同步登录态（cookie 证据），契约用。运行时建议用 detect_login_state。"""
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

    async def detect_login_state(self) -> dict[str, Any]:
        """真实登录态：浏览器已打开时用 DOM+URL 双重探测，否则回退 cookie 证据。"""
        from boss_zhipin.website_oper import finding_jobs
        from boss_zhipin.website_oper.core.login_detector import _is_logged_in

        tab = finding_jobs.get_tab()
        if tab is not None and "zhipin.com" in str(getattr(tab, "url", "") or ""):
            try:
                live = await _is_logged_in()
                return {"verified": True, "logged_in": live}
            except Exception as e:  # noqa: BLE001
                log.debug("DOM 登录探测失败: %s", e)
        cookie_state = self._cookie_login_state()
        return {"verified": False, "logged_in": cookie_state is True}

    async def open_login_browser(self) -> dict[str, Any]:
        """打开 BOSS 登录页（直接导航到登录 URL），等待用户扫码完成后返回结果。"""
        import asyncio

        from boss_zhipin.website_oper import finding_jobs
        from boss_zhipin.website_oper.core.login_detector import (
            BOSS_LOGIN_URL,
            _is_logged_in,
            _wait_url_stable,
        )

        tab = finding_jobs.get_tab()
        if tab is None:
            await finding_jobs.open_browser_with_options(BOSS_LOGIN_URL, "chrome")
            tab = finding_jobs.get_tab()
        else:
            await tab.get(BOSS_LOGIN_URL)
        try:
            await tab.activate()
            await tab.bring_to_front()
        except Exception:  # noqa: BLE001
            pass
        await _wait_url_stable(stable_for=2.0, timeout=15)

        deadline = asyncio.get_event_loop().time() + 300
        while asyncio.get_event_loop().time() < deadline:
            if await _is_logged_in():
                # 登录成功：cookie 已写入持久化 profile（重新开浏览器自动免登）。
                # 立即关闭登录用的受控浏览器，回应用户"扫完码就关掉"的预期。
                await finding_jobs.shutdown()
                return {"status": "ok", "logged_in": True, "url": BOSS_LOGIN_URL}
            await asyncio.sleep(2)
        return {"status": "opened", "logged_in": False, "url": BOSS_LOGIN_URL}