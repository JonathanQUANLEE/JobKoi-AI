"""CLI 入口。

启动流程：
1. 读 ``.env``。
2. 兜底 ``BOSS_USR_NAME`` / ``BOSS_LABEL`` 两个可选配置。
3. 进入主循环——岗位筛选、招呼语和发送节奏由 profile/env 控制。
"""
from __future__ import annotations

import logging
import os
import sys
from argparse import ArgumentParser, Namespace
from typing import Any

import nodriver as uc
from dotenv import load_dotenv

from boss_zhipin.config.profile_env_bridge import (
    apply_profile_to_env,
    clear_profile_mode_env as _clear_profile_mode_env,
    print_profile_summary,
    read_profile_greeting as _read_profile_greeting,
    set_env_if_present as _set_env_if_present,
    set_path_env_if_present as _set_path_env_if_present,
)
from boss_zhipin.config.profiles import load_profile
from boss_zhipin.website_oper.write_response import send_job_descriptions_to_chat

log = logging.getLogger(__name__)

# BOSS 推荐 feed 入口。CLI 和 GUI 都从这里进。
RECOMMEND_URL = "https://www.zhipin.com/web/geek/job-recommend?ka=header-job-recommend"

__all__ = [
    "RECOMMEND_URL",
    "apply_profile_to_env",
    "auto_send_fixed_greeting_enabled",
    "ensure_usr_name",
    "get_label",
    "get_start_url",
    "os",
    "parse_args",
    "print_profile_summary",
    "review_before_send_enabled",
    "run_automation",
    "scan_only_enabled",
]


def parse_args(argv: list[str] | None = None) -> Namespace:
    """解析 CLI 参数。"""
    parser = ArgumentParser(prog="boss-zhipin")
    parser.add_argument(
        "--profile",
        help="从 profiles 目录加载 YAML 配置，例如 gui-default",
    )
    return parser.parse_args(argv)


def ensure_usr_name() -> str:
    name = os.getenv("BOSS_USR_NAME", "").strip()
    if name:
        return name
    while True:
        name = input("请输入你的名字（用于打招呼语结尾的署名）: ").strip()
        if name:
            return name
        print("不能为空")


def get_label() -> str:
    """求职 tag 是可选的——为空就让 BOSS 给默认推荐 feed。"""
    return os.getenv("BOSS_LABEL", "").strip()


def get_start_url() -> str:
    """BOSS 起始页。

    优先级（2026-10-11 语义升级）：
    1. ``BOSS_START_URL`` 显式指定（旧 CLI/bat 流程）；
    2. **画像搜索词构造搜索页 URL**（``BOSS_LABEL`` 存在时）——GUI 巡航
       的关键：启动后直接导航到 ``/web/geek/jobs?query=<搜索词>``，
       搜出来的岗位与画像强相关；否则会落在推荐页，搜出什么全凭账号
       记忆（实测出现过「郑州爬虫工程师」这种与画像完全无关的 feed）；
    3. 都没有 → 默认推荐 feed。
    """
    explicit = os.getenv("BOSS_START_URL", "").strip()
    if explicit:
        return explicit
    label = os.getenv("BOSS_LABEL", "").strip()
    if label:
        from urllib.parse import quote

        return f"https://www.zhipin.com/web/geek/jobs?query={quote(label)}"
    return RECOMMEND_URL


def scan_only_enabled() -> bool:
    return os.getenv("BOSS_SCAN_ONLY", "").lower() in ("1", "true", "yes")


def review_before_send_enabled() -> bool:
    return os.getenv("BOSS_REVIEW_BEFORE_SEND", "").lower() in ("1", "true", "yes")


def auto_send_fixed_greeting_enabled() -> bool:
    return os.getenv("BOSS_AUTO_SEND_FIXED_GREETING", "").lower() in (
        "1",
        "true",
        "yes",
    )


def _int_env(name: str, default: int, lo: int, hi: int) -> int:
    """读一个整数环境变量，坏值 / 越界都降级到 [lo, hi] 内，永不抛。"""
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        val = int(raw)
    except ValueError:
        log.warning("%s=%r 不是整数，回退默认 %d", name, raw, default)
        return default
    if val < lo or val > hi:
        clamped = max(lo, min(hi, val))
        log.warning("%s=%d 超出 [%d, %d]，收敛到 %d", name, val, lo, hi, clamped)
        return clamped
    return val


async def run_automation(
    usr_name: str,
    label: str,
    dry_run: bool,
    use_current_page: bool = False,
) -> None:
    """主循环入口，CLI 和 GUI 共用。"""
    await send_job_descriptions_to_chat(
        usr_name=usr_name,
        url=get_start_url(),
        browser_type="chrome",
        label=label,
        dry_run=dry_run,
        use_current_page=use_current_page,
    )


def _cli_main() -> None:
    args = parse_args()
    load_dotenv()
    if args.profile:
        loaded_profile = load_profile(args.profile)
        apply_profile_to_env(
            loaded_profile.data,
            base_dir=loaded_profile.path.parent.parent,
            profile_name=loaded_profile.name,
        )
        print_profile_summary(loaded_profile.name, loaded_profile.data)

    logging.basicConfig(
        level=os.getenv("LOGLEVEL", "INFO").upper(),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    dry_run = os.getenv("DRY_RUN", "").lower() in ("1", "true", "yes")
    if dry_run:
        print("[DRY-RUN] DRY_RUN=1 — 招呼语只会生成 + 写日志，不会真的发到 BOSS")

    scan_only = scan_only_enabled()
    review_before_send = review_before_send_enabled()
    auto_send_fixed_greeting = auto_send_fixed_greeting_enabled()
    if scan_only:
        print("BOSS_SCAN_ONLY=1 — 只扫描岗位，不生成招呼语、不发送")
    elif auto_send_fixed_greeting:
        print("BOSS_AUTO_SEND_FIXED_GREETING=1 — 命中条件后自动发送固定招呼语")
    elif review_before_send:
        print(
            "BOSS_REVIEW_BEFORE_SEND=1 — 每个匹配岗位会先展示详情，输入 y 才发送固定招呼语"
        )
    usr_name = ensure_usr_name()
    label = get_label()
    print(f"BOSS 起始页：{get_start_url()}")
    if label:
        print(f"求职 tag：{label}")
    else:
        print("没设 BOSS_LABEL，用 BOSS 默认推荐 feed")

    uc.loop().run_until_complete(run_automation(usr_name, label, dry_run))


if __name__ == "__main__":
    _cli_main()
