"""新号保护模式：单一真相模块（2026-10-15 用户拍板）。

平台风控调研结论：封号风险 = 日总量 × 时间分布 × 内容相似度，日总量是
最强杠杆，「一口气跑满」是典型机器画像。本模块把保护模式的预设数字、
落盘配置与「三时段份额」计算集中在一处：

- 预设（PROTECTION_PRESET）：BOSS 30/日 · 猎聘 15/日 · 51Job 10/日，
  节奏锁定稳健档 30~45s（由前端应用到表单，见 DrawerPolicyTab）；
- 配置持久化：``app_data_dir()/protection_mode.json``——dev 与打包模式
  同源（scheduled_cruise.py 无头运行也要读到同一份），BOSS_APP_DATA_DIR
  env 可覆盖（测试注入用）；
- 份额机制（核心设计）：三个计划任务执行**同一条命令**，脚本启动时读
  本配置、按 ``ceil(日额/时段数)`` 算出各平台「单轮上限」注入 env。
  单轮上限（env 层）× 日累计上限（sent log 跨轮累计）相与，天然实现
  「每时段最多 1/3、全天最多全额」的分配，无需按窗口传参。

为什么放 env 层而非改画像：``apply_profile_to_env`` 会无条件覆盖预注入
的 BOSS_AUTO_SEND_MAX_SENT 等画像 env（profile_env_bridge.py 实证），
独立 env 名 + env_config 钳制是最小侵入解，且「用户没点保存也受保护」。
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

# 保护预设（开启时写入配置快照——后续调预设数字不影响已开启的用户，
# 显式优于魔法）
PROTECTION_PRESET: dict[str, int] = {
    "boss_daily": 30,
    "liepin_daily": 15,
    "job51_daily": 10,
}

# 默认三时段（真人作息：上午/下午/晚间各逛一次；避开深夜机器指纹）
DEFAULT_TIMES: list[str] = ["10:00", "15:00", "20:00"]

_SAFE_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

CONFIG_FILENAME = "protection_mode.json"


def config_path() -> Path:
    """保护配置落盘路径（dev 与打包模式同源，BOSS_APP_DATA_DIR 可覆盖）。"""
    from boss_zhipin.paths import app_data_dir

    return app_data_dir() / CONFIG_FILENAME


def load_protection_config() -> dict[str, Any] | None:
    """读取保护配置；文件不存在/损坏返回 None（视为未开启，永不抛）。"""
    path = config_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def save_protection_config(cfg: dict[str, Any]) -> Path:
    """写入保护配置（建好父目录；写失败向上抛由 IPC 层转错误消息）。"""
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return path


def validate_times(times: list[str]) -> list[str]:
    """校验并规整时段列表：HH:MM 格式、去重保序、1~3 个。

    不合法抛 ValueError（中文消息直达前端）。
    """
    cleaned: list[str] = []
    for raw in times or []:
        t = str(raw or "").strip()
        if not t:
            continue
        if not _SAFE_TIME.match(t):
            raise ValueError(f"时间格式必须是 HH:MM（24 小时制），收到: {t!r}")
        if t not in cleaned:
            cleaned.append(t)
    if not cleaned:
        raise ValueError("至少需要一个时段（HH:MM）")
    if len(cleaned) > 3:
        raise ValueError("最多支持 3 个时段")
    return cleaned


def protection_env(cfg: dict[str, Any]) -> dict[str, str]:
    """把保护配置换算成运行时 env（单轮份额 + 平台日额）。

    - BOSS：JOBHUNTER_WINDOW_MAX_SENT（单轮）+ JOBHUNTER_PROTECTION_DAILY
      （日额）——env_config 里各做一道 min 钳制；
    - 猎聘/51Job：LIEPIN/JOB51_DAILY_LIMIT（日额，沿用现有 env 名）+
      LIEPIN/JOB51_RUN_MAX（单轮，apply.run 新参数）。
    """
    preset = dict(PROTECTION_PRESET)
    # 配置里存的日额优先（快照语义），缺字段回预设
    for key in preset:
        raw = cfg.get(key)
        if isinstance(raw, int) and raw > 0:
            preset[key] = raw

    times = cfg.get("times") or DEFAULT_TIMES
    windows = max(1, len([t for t in times if _SAFE_TIME.match(str(t))] or [1]))

    def share(daily: int) -> int:
        # ceil：宁可整除偏多 1 也不浪费（日累计上限兜底，总不会超）
        return max(1, math.ceil(daily / windows))

    return {
        "JOBHUNTER_WINDOW_MAX_SENT": str(share(preset["boss_daily"])),
        "JOBHUNTER_PROTECTION_DAILY": str(preset["boss_daily"]),
        "LIEPIN_DAILY_LIMIT": str(preset["liepin_daily"]),
        "LIEPIN_RUN_MAX": str(share(preset["liepin_daily"])),
        "JOB51_DAILY_LIMIT": str(preset["job51_daily"]),
        "JOB51_RUN_MAX": str(share(preset["job51_daily"])),
    }


def apply_protection_env(target: dict[str, str] | None = None) -> bool:
    """保护模式开启则把 protection_env 注入目标 dict（默认 os.environ）。

    GUI 巡航 factory 与 scheduled_cruise.py 共用这一句。返回是否注入。
    """
    import os

    cfg = load_protection_config()
    if not cfg or not bool(cfg.get("enabled")):
        return False
    env = target if target is not None else os.environ
    env.update(protection_env(cfg))
    return True


def build_config(*, enabled: bool, times: list[str]) -> dict[str, Any]:
    """构造一份完整配置（预设数字快照 + 校验后的时段）。"""
    return {
        "enabled": bool(enabled),
        "times": validate_times(times),
        **PROTECTION_PRESET,
    }


__all__ = [
    "DEFAULT_TIMES",
    "PROTECTION_PRESET",
    "apply_protection_env",
    "build_config",
    "config_path",
    "load_protection_config",
    "protection_env",
    "save_protection_config",
    "validate_times",
]
