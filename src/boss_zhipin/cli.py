"""CLI 入口。

启动流程：
1. 读 ``.env``。
2. 兜底 ``BOSS_USR_NAME`` / ``BOSS_LABEL`` 两个可选配置：
   不设就 prompt 用户输入或用默认值。
3. 进入主循环——岗位筛选、招呼语和发送节奏由 profile/env 控制。

跑法：``uv run main.py`` / ``uv run python -m boss_zhipin`` / ``boss-zhipin``（pyproject script）
三种等价。

设计：用户输入提示用 ``print``，业务流程用 ``logging``。logging 在
``_cli_main`` 里 ``basicConfig`` 统一初始化——**不在 module top**，避免
``import boss_zhipin.cli`` 时改掉 GUI 进程的 logging 配置。

注意：本模块自己不在 import-time 调 ``load_dotenv``，只在真正以 CLI 方式
启动时读取 ``.env``。
"""

from __future__ import annotations

import logging
import json
import os
import sys
from argparse import ArgumentParser, Namespace
from pathlib import Path
from typing import Any

import nodriver as uc
from dotenv import load_dotenv

from boss_zhipin.config.profiles import load_profile
from boss_zhipin.website_oper.write_response import send_job_descriptions_to_chat

log = logging.getLogger(__name__)

# BOSS 推荐 feed 入口。CLI 和 GUI 都从这里进。
RECOMMEND_URL = "https://www.zhipin.com/web/geek/job-recommend?ka=header-job-recommend"

__all__ = [
    "RECOMMEND_URL",
    "apply_profile_to_env",
    "ensure_usr_name",
    "get_start_url",
    "parse_args",
    "run_automation",
]


def parse_args(argv: list[str] | None = None) -> Namespace:
    """解析 CLI 参数。

    这里只放 profile 入口，旧的 env 配置仍保持兼容。
    """
    parser = ArgumentParser(prog="boss-zhipin")
    parser.add_argument(
        "--profile",
        help="从 profiles 目录加载 YAML 配置，例如 backend-intern",
    )
    return parser.parse_args(argv)


def apply_profile_to_env(
    profile_data: dict[str, Any],
    *,
    base_dir: str | Path = ".",
    profile_name: str | None = None,
) -> None:
    """把 profile 配置桥接到旧 env 流程。

    现有浏览器和发送逻辑主要读环境变量；先用这层兼容适配，后续再逐步改成
    显式运行配置对象，避免一次性重写真实发送路径。
    """
    send_config = profile_data.get("send") or {}
    if not isinstance(send_config, dict):
        print("[ERROR] profile.send 必须是 mapping")
        sys.exit(1)

    mode = str(send_config.get("mode") or "auto").strip().lower()
    _clear_profile_mode_env()
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
        os.environ["BOSS_FIXED_GREETING"] = _read_profile_greeting(
            greeting_file, Path(base_dir)
        )

    _set_env_if_present("BOSS_AUTO_SEND_DELAY_MIN", send_config, "delay_min")
    _set_env_if_present("BOSS_AUTO_SEND_DELAY_MAX", send_config, "delay_max")
    _set_env_if_present("BOSS_AUTO_SEND_MAX_SENT", send_config, "max_sent")
    _set_env_if_present("BOSS_AUTO_SEND_DAILY_LIMIT", send_config, "daily_sent_limit")
    _set_env_if_present("BOSS_STOP_ON_CAPTCHA", send_config, "stop_on_captcha")
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
        _set_path_env_if_present(
            "BOSS_SEEN_JOBS_FILE", state_config, "seen_jobs_file", Path(base_dir)
        )
        _set_path_env_if_present(
            "BOSS_SENT_LOG_FILE", state_config, "sent_log_file", Path(base_dir)
        )
        _set_path_env_if_present(
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


def _clear_profile_mode_env() -> None:
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
    ):
        os.environ.pop(name, None)


def _set_env_if_present(env_name: str, config: dict[str, Any], key: str) -> None:
    if key in config and config[key] is not None:
        os.environ[env_name] = str(config[key])


def _set_path_env_if_present(
    env_name: str, config: dict[str, Any], key: str, base_dir: Path
) -> None:
    raw = str(config.get(key) or "").strip()
    if not raw:
        return
    path = Path(raw)
    if not path.is_absolute():
        path = base_dir / path
    os.environ[env_name] = str(path)


def _read_profile_greeting(greeting_file: str, base_dir: Path) -> str:
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
    """BOSS 起始页。可用 BOSS_START_URL 指到手动筛好的城市/岗位搜索页。"""
    return os.getenv("BOSS_START_URL", "").strip() or RECOMMEND_URL


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
    """读一个整数环境变量，坏值 / 越界都降级到 [lo, hi] 内，**永不抛**。

    ``BOSS_MIN_MATCH_SCORE`` 这类是 GUI 配置页能直接填的字段，裸 ``int()`` 遇到
    ``abc`` / 空串 / ``150`` 会把整个 run 崩掉，用户只看到"点开始就崩"。这里把它
    收敛成"坏值回退默认 + 一条 warning"，让跑得起来比跑得精确重要。
    """
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
    """主循环入口，CLI 和 GUI 共用。

    必须在同一个事件循环里 await（nodriver CDP 跨 run_until_complete 会半死，
    见 ``_cli_main`` 的注释）。
    """
    await send_job_descriptions_to_chat(
        usr_name=usr_name,
        url=get_start_url(),
        browser_type="chrome",
        label=label,
        dry_run=dry_run,
        use_current_page=use_current_page,
    )


def _cli_main() -> None:
    """``python -m boss_zhipin`` / 根目录 ``main.py`` shim / pyproject script
    都委托到这个函数。

    把 ``load_dotenv`` 和 ``logging.basicConfig`` 收进来——``basicConfig``
    只有真正"以 CLI 方式跑"才生效，单纯 ``import boss_zhipin.cli`` 不会污染
    logging。（``.env`` 本身仍会在 import-time 经由 ``models.*`` 读入，见
    module docstring；这里的 ``load_dotenv()`` 是给"models 还没 import 就
    需要 env"的将来留的显式入口，幂等。）
    """
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

    # run_automation 是 async 的（整段必须跑在同一个事件循环里，否则 nodriver
    # CDP 会在 run_until_complete 之间进入半死态导致 evaluate hang）。
    # 这里用 ``uc.loop().run_until_complete(...)`` 一次性跑完。
    uc.loop().run_until_complete(run_automation(usr_name, label, dry_run))


if __name__ == "__main__":
    _cli_main()
