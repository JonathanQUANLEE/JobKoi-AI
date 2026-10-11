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
        """True=有未过期 cookie / False=无 cookie 或全过期 / None=读不出。

        性能红线：本函数在平台列表的展示路径上（list_platforms 秒回），
        **绝不等待数据库锁**——Chrome 运行时会独占锁定 Cookies 库，
        timeout=0 让锁冲突立即失败返回 None（前端显示「待验证」），
        而不是阻塞接口把平台卡片拖成空白（2026-10-11 实测教训）。
        """
        profile_dir = self._get_profile_dir()
        if not profile_dir.is_dir():
            return False
        now_micros = int(time.time() * 1_000_000) + _CHROME_EPOCH_OFFSET_MICROS
        candidates = [
            profile_dir / "Default" / "Network" / "Cookies",
            profile_dir / "Default" / "Cookies",
        ]
        found = False
        for db_path in candidates:
            if not db_path.is_file():
                continue
            found = True
            try:
                conn = sqlite3.connect(
                    f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=0
                )
                rows = conn.execute(
                    "SELECT expires_utc, is_persistent FROM cookies "
                    "WHERE host_key LIKE '%zhipin.com'"
                ).fetchall()
                conn.close()
            except sqlite3.Error as e:
                # 最常见：Chrome 正在运行锁库（database is locked）——立即跳过，
                # 状态显示「待验证」，等浏览器关闭后自然恢复准确判定。
                log.debug("读 %s 失败（多被 Chrome 锁定）: %s", db_path.name, e)
                continue
            if not rows:
                return False
            # expires_utc=0 表示会话 cookie；持久 cookie 需未过期
            alive = any(
                not persistent or expires == 0 or expires > now_micros
                for expires, persistent in rows
            )
            return alive
        if not found:
            # 连 Cookies 文件都没有：从没起过浏览器 → 确定未登录
            return False
        # 文件都在但全部锁定：Chrome 在跑 → 拿不到证据，判「待验证」
        return None

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