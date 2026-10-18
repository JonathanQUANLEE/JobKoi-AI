"""Bridge between profile YAML/JSON configs and process environment variables."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


def apply_profile_to_env(
    profile_data: dict[str, Any],
    *,
    base_dir: str | Path = ".",
    profile_name: str | None = None,
) -> None:
    """把 profile 配置桥接到旧 env 流程。"""
    send_config = profile_data.get("send") or {}
    if not isinstance(send_config, dict):
        print("[ERROR] profile.send 必须是 mapping")
        sys.exit(1)

    mode = str(send_config.get("mode") or "auto").strip().lower()
    clear_profile_mode_env()
    if mode == "auto":
        os.environ["BOSS_AUTO_SEND_FIXED_GREETING"] = "1"
    elif mode == "review":
        os.environ["BOSS_REVIEW_BEFORE_SEND"] = "1"
    elif mode == "scan":
        os.environ["BOSS_SCAN_ONLY"] = "1"
    else:
        print(f"[ERROR] profile.send.mode 不支持：{mode}")
        sys.exit(1)

    greeting_file = str(send_config.get("greeting_file") or "").strip()
    if greeting_file:
        os.environ["BOSS_FIXED_GREETING"] = read_profile_greeting(
            greeting_file, Path(base_dir)
        )

    set_env_if_present("BOSS_AUTO_SEND_DELAY_MIN", send_config, "delay_min")
    set_env_if_present("BOSS_AUTO_SEND_DELAY_MAX", send_config, "delay_max")
    set_env_if_present("BOSS_AUTO_SEND_MAX_SENT", send_config, "max_sent")
    set_env_if_present("BOSS_AUTO_SEND_DAILY_LIMIT", send_config, "daily_sent_limit")
    # 分平台单轮上限（2026-10-17 用户需求"三个平台都应该能设"）：GUI 弹窗
    # 三平台单轮输入落盘 liepin_run_max / job51_run_max，经此映射到运行时
    # env（runtime.py 手动巡航的 env_run_max 读取；保护模式注入的更小份额
    # 仍由 limits.env_run_max 的 min 逻辑优先）。
    set_env_if_present("LIEPIN_RUN_MAX", send_config, "liepin_run_max")
    set_env_if_present("JOB51_RUN_MAX", send_config, "job51_run_max")
    # 分平台每日投递上限（2026-10-18 三路审查发现的严重缺陷修复）：
    # 「投递安全与防风控保护」弹窗里猎聘/前程的"次/天"输入此前只写
    # localStorage、后端从不读取——用户调低日限想保号实际不生效，仍按
    # limits.py 默认 50/40 投。补齐 profile 字段 → env 映射，与 BOSS 的
    # daily_sent_limit 同款语义；runtime.py / apply.py 已从这两个 env 读取。
    set_env_if_present("LIEPIN_DAILY_LIMIT", send_config, "liepin_daily_limit")
    set_env_if_present("JOB51_DAILY_LIMIT", send_config, "job51_daily_limit")
    set_env_if_present("BOSS_STOP_ON_CAPTCHA", send_config, "stop_on_captcha")
    set_env_if_present(
        "BOSS_SEND_RESUME_AFTER_GREETING", send_config, "send_resume_after_greeting"
    )
    set_env_if_present("BOSS_AUTO_RESUME_ON_REPLY", send_config, "auto_send_resume_on_reply")
    set_env_if_present("BOSS_AI_GREETING", send_config, "ai_greeting")
    # 分平台拟人化节奏（2026-10-13 用户拍板：每平台独立三档）：profile 可为
    # 猎聘/51job 单独设 liepin_delay_min/max、job51_delay_min/max；未单设时
    # 回退到 delay_min/max（与 BOSS 同值）——三个平台全部尊重用户设置，
    # 不再有硬编码 40~80s 无视配置的旧实现。
    set_env_if_present(
        "LIEPIN_DELAY_MIN", send_config, "liepin_delay_min", fallback_key="delay_min"
    )
    set_env_if_present(
        "LIEPIN_DELAY_MAX", send_config, "liepin_delay_max", fallback_key="delay_max"
    )
    set_env_if_present(
        "JOB51_DELAY_MIN", send_config, "job51_delay_min", fallback_key="delay_min"
    )
    set_env_if_present(
        "JOB51_DELAY_MAX", send_config, "job51_delay_max", fallback_key="delay_max"
    )
    if isinstance(profile_data.get("filters"), dict):
        os.environ["BOSS_PROFILE_FILTERS_JSON"] = json.dumps(
            profile_data["filters"],
            ensure_ascii=False,
        )
    if isinstance(profile_data.get("page_filters"), dict):
        os.environ["BOSS_PAGE_FILTERS_JSON"] = json.dumps(
            profile_data["page_filters"],
            ensure_ascii=False,
        )
    if profile_name:
        os.environ["BOSS_PROFILE_NAME"] = profile_name

    state_config = profile_data.get("state") or {}
    if isinstance(state_config, dict):
        set_path_env_if_present(
            "BOSS_SEEN_JOBS_FILE", state_config, "seen_jobs_file", Path(base_dir)
        )
        set_path_env_if_present(
            "BOSS_SENT_LOG_FILE", state_config, "sent_log_file", Path(base_dir)
        )
        set_path_env_if_present(
            "BOSS_SKIPPED_LOG_FILE", state_config, "skipped_log_file", Path(base_dir)
        )

    search_config = profile_data.get("search") or {}
    if isinstance(search_config, dict):
        query = str(search_config.get("query") or "").strip()
        if query:
            os.environ["BOSS_LABEL"] = query
        start_url = str(search_config.get("start_url") or "").strip()
        if start_url:
            os.environ["BOSS_START_URL"] = start_url


def clear_profile_mode_env() -> None:
    """清空上一份 profile 注入的全部 env（切换画像时防状态残留）。

    2026-10-18 三路审查发现：旧列表漏清单轮上限 / 日限 / 延时系列，
    先跑 A 画像再跑 B（B 无这些字段）时，B 会沿用 A 的设置——例如 A
    设了猎聘日限 20，切到没设该字段的 B 后仍按 20 投，而不是回退默认 50。
    """
    for name in (
        "BOSS_AUTO_SEND_FIXED_GREETING",
        "BOSS_REVIEW_BEFORE_SEND",
        "BOSS_SCAN_ONLY",
        "BOSS_FIXED_GREETING",
        "BOSS_PROFILE_FILTERS_JSON",
        "BOSS_PAGE_FILTERS_JSON",
        "BOSS_PROFILE_NAME",
        "BOSS_SEEN_JOBS_FILE",
        "BOSS_SENT_LOG_FILE",
        "BOSS_SKIPPED_LOG_FILE",
        "BOSS_AUTO_SEND_DAILY_LIMIT",
        "BOSS_STOP_ON_CAPTCHA",
        "BOSS_SEND_RESUME_AFTER_GREETING",
        "BOSS_AUTO_RESUME_ON_REPLY",
        "BOSS_AI_GREETING",
        # 2026-10-18 补齐（审查发现的残留缺陷）
        "BOSS_AUTO_SEND_MAX_SENT",
        "BOSS_AUTO_SEND_DELAY_MIN",
        "BOSS_AUTO_SEND_DELAY_MAX",
        "LIEPIN_RUN_MAX",
        "JOB51_RUN_MAX",
        "LIEPIN_DAILY_LIMIT",
        "JOB51_DAILY_LIMIT",
        "LIEPIN_DELAY_MIN",
        "LIEPIN_DELAY_MAX",
        "JOB51_DELAY_MIN",
        "JOB51_DELAY_MAX",
        # 搜索目标（2026-10-18 质检补充：先跑 A 画像（带搜索词）再切 B
        # （无 query）时沿用 A 的搜索词，目标错乱——与上面限额系列同款残留）
        "BOSS_LABEL",
        "BOSS_START_URL",
    ):
        os.environ.pop(name, None)


def set_env_if_present(
    env_name: str,
    config: dict[str, Any],
    key: str,
    fallback_key: str | None = None,
) -> None:
    """config[key] 有值则写入 env；否则尝试 fallback_key（分平台字段缺省时
    回退到通用字段，如 liepin_delay_min → delay_min）。"""
    if key in config and config[key] is not None:
        os.environ[env_name] = str(config[key])
    elif fallback_key and fallback_key in config and config[fallback_key] is not None:
        os.environ[env_name] = str(config[fallback_key])


def set_path_env_if_present(
    env_name: str, config: dict[str, Any], key: str, base_dir: Path
) -> None:
    raw = str(config.get(key) or "").strip()
    if not raw:
        return
    path = Path(raw)
    if not path.is_absolute():
        path = base_dir / path
    os.environ[env_name] = str(path)


def read_profile_greeting(greeting_file: str, base_dir: Path) -> str:
    path = Path(greeting_file)
    if not path.is_absolute():
        path = base_dir / path
    if not path.is_file():
        print(f"[ERROR] 找不到招呼语文件：{path}")
        sys.exit(1)
    return path.read_text(encoding="utf-8").strip()


def print_profile_summary(profile_name: str, profile_data: dict[str, Any]) -> None:
    """打印 profile 合并后的关键配置，避免用户误跑错模式。"""
    send_config = (
        profile_data.get("send") if isinstance(profile_data.get("send"), dict) else {}
    )
    search_config = (
        profile_data.get("search")
        if isinstance(profile_data.get("search"), dict)
        else {}
    )
    page_filters = (
        profile_data.get("page_filters")
        if isinstance(profile_data.get("page_filters"), dict)
        else {}
    )
    filters = (
        profile_data.get("filters")
        if isinstance(profile_data.get("filters"), dict)
        else {}
    )
    mode = str(send_config.get("mode") or "auto")
    query = str(search_config.get("query") or "")
    max_sent = send_config.get("max_sent", "")
    delay_min = send_config.get("delay_min", "")
    delay_max = send_config.get("delay_max", "")
    enabled_page_filters = [
        name
        for name, cfg in page_filters.items()
        if name != "strict" and isinstance(cfg, dict) and bool(cfg.get("enabled", True))
    ]
    print(
        "[PROFILE] "
        f"Profile: {profile_name} | mode={mode} | query={query or '-'} | "
        f"max_sent={max_sent or '-'} | delay={delay_min or '-'}/{delay_max or '-'} | "
        f"page_filters={','.join(enabled_page_filters) or '-'} | "
        f"filter_groups={','.join(filters.keys()) or '-'}"
    )
