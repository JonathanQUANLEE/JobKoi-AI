"""Chrome profile Cookies 数据库只读探测（平台登录态判定的通用工具）。

2026-10-11 事故实锤的两条铁律：
1. 「Cookies 文件存在」≠ 已登录——文件永远存在（开过一次浏览器就有）。
2. 「域内任意 cookie 未过期」≠ 已登录——游客也有 ``__zp_stoken__`` 等
   持久 cookie。登录态必须认**登录凭证 cookie**（BOSS = ``bst``），
   其余统计/防爬/城市记忆类 cookie 一概不算数。

性能红线：本工具在平台列表展示路径上（list_platforms 秒回），
``timeout=0`` 绝不等锁——Chrome 运行锁库时立即失败返回 None（待验证）。
"""

from __future__ import annotations

import logging
import sqlite3
import time
from pathlib import Path

log = logging.getLogger(__name__)

# Unix epoch 与 Chrome cookie 时间基准（1601-01-01T00:00:00Z）的微秒差
_CHROME_EPOCH_OFFSET_MICROS = 11644473600000000


def read_cookie_state(
    profile_dir: Path,
    host_pattern: str,
    required_names: tuple[str, ...] | None = None,
) -> bool | None:
    """读取 Chrome Cookies 库，判断登录态证据。

    Args:
        profile_dir: 浏览器 profile 根目录（内含 Default/Network/Cookies）。
        host_pattern: cookie 域名匹配模式（如 ``%zhipin.com``）。
        required_names: 登录凭证 cookie 名单（如 BOSS 的 ``("bst",)``）。
            指定时：必须存在名单内**持久且未过期**的 cookie 才判已登录
            （游客 cookie / 会话 cookie 一概不算）。
            为 None 时退而求其次：域内存在**持久且未过期**cookie 即算。

    Returns:
        True=有登录证据 / False=明确无登录（库可读但无凭证）
        / None=读不出（Chrome 锁库或无库文件）→ 前端显示「待验证」。
    """
    if not profile_dir.is_dir():
        return False
    now_micros = int(time.time() * 1_000_000) + _CHROME_EPOCH_OFFSET_MICROS
    candidates = [
        profile_dir / "Default" / "Network" / "Cookies",
        profile_dir / "Default" / "Cookies",
    ]
    found_any_db = False
    for db_path in candidates:
        if not db_path.is_file():
            continue
        found_any_db = True
        try:
            # 允许等待短暂锁释放（0.8s），避免 Chrome 刚关闭退出时因微秒级文件锁竞争直接判 None
            conn = sqlite3.connect(
                f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=0.8
            )
            cols = [c[1] for c in conn.execute("PRAGMA table_info(cookies)").fetchall()]
            # 真实 Chrome 库同时有 value / encrypted_value 两列：HttpOnly 与
            # 加密 cookie 的明文 value 恒为空串，真实值在 encrypted_value
            # （DPAPI 加密）。行统一归一为 (name, expires, persistent, 明文值,
            # 加密值长度) 五元组；缺列的旧/简化 schema 走保守占位。
            if "value" in cols and "encrypted_value" in cols:
                rows = [
                    (r[0], r[1], r[2], r[3] or "", r[4] or 0)
                    for r in conn.execute(
                        "SELECT name, expires_utc, is_persistent, value, "
                        "length(encrypted_value) FROM cookies "
                        "WHERE host_key LIKE ?",
                        (host_pattern,),
                    ).fetchall()
                ]
            elif "value" in cols:
                rows = [
                    (r[0], r[1], r[2], r[3] or "", 0)
                    for r in conn.execute(
                        "SELECT name, expires_utc, is_persistent, value FROM cookies "
                        "WHERE host_key LIKE ?",
                        (host_pattern,),
                    ).fetchall()
                ]
            else:
                raw_rows = conn.execute(
                    "SELECT name, expires_utc, is_persistent FROM cookies "
                    "WHERE host_key LIKE ?",
                    (host_pattern,),
                ).fetchall()
                rows = [(r[0], r[1], r[2], "valid", 1) for r in raw_rows]
            conn.close()
        except sqlite3.Error as e:
            # 最常见：Chrome 正在运行锁库（database is locked）——立即跳过，
            # 状态显示「待验证」，浏览器关闭后自然恢复准确判定。
            log.debug("读 %s 失败（多被 Chrome 锁定）: %s", db_path.name, e)
            continue

        def _alive(
            name: str, expires_utc: int, persistent: int, val: Any, enc_len: int
        ) -> bool:
            # 明文 value 与 encrypted_value **都**为空才是空壳 cookie（不算数）。
            # 铁律（2026-10-19 真实库实证）：BOSS bst / 猎聘 lt_auth 是 HttpOnly
            # 凭证——value 长度 0、encrypted_value 长度 130/307。只看 value 空串
            # 拒收会把已登录用户误杀成"明确未登录"（2026-10-11 事故复活的根因）。
            if (val is None or not str(val).strip()) and not enc_len:
                return False
            # 有登录凭证名单时（BOSS 的 bst 等）：名字命中即强证据——
            # 会话 cookie 也算（用户 bst 是会话 cookie、浏览器重启自动恢复登录）。
            if required_names and name in required_names:
                if not persistent:
                    return True
                return expires_utc == 0 or expires_utc > now_micros
            # 其余（含无名单的退化路径）：会话 cookie 一概不算——游客的
            # 统计/防爬会话 cookie 太多，必须用持久+未过期过滤。
            if not persistent:
                return False
            return expires_utc == 0 or expires_utc > now_micros

        if required_names:
            required_rows = [r for r in rows if r[0] in required_names]
            if not required_rows:
                return False
            return any(_alive(*r) for r in required_rows)
        # 无具体名单：退化为「域内有持久且未过期的 cookie」
        return any(_alive(*r) for r in rows)

    if not found_any_db:
        # 连 Cookies 文件都没有：从未起过浏览器 → 确定未登录
        return False
    # 文件都在但全部锁定：拿不到证据，不下结论
    return None