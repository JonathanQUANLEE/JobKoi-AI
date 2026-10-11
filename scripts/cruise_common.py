"""三平台并行巡航的公共调度层。

auto_apply.py（手动入口）与 scheduled_cruise.py（Windows 计划任务入口）
历史上各复制一份 _env / _run_boss / _run_liepin / _run_job51 / 线程编排
（90% 相同），P2（2026-10）合并于此。两者唯一实质差异是 BOSS 链是否绑定
GUI 求职画像：
- 手动入口：不设 BOSS_PROFILE（沿用账号默认 / 启动 URL）；
- 计划任务入口：BOSS_PROFILE 默认 gui-default（跟随用户在软件里配的画像）。
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from boss_zhipin.platforms.limits import DEFAULT_DAILY_LIMITS  # noqa: E402


def _env(**extra: str) -> dict:
    e = os.environ.copy()
    e["PYTHONIOENCODING"] = "utf-8"
    e.update(extra)
    return e


def run_boss(profile: str | None = None) -> None:
    label = f"（登录 → 自动巡航投递 → 画像 {profile}）" if profile else "（登录 → 自动巡航投递）"
    print(f"[boss] 启动 BOSS 链{label}", flush=True)
    extra = {"BOSS_CLICK_ONLY": "1", "BOSS_AUTO_INVEST": "1"}
    if profile:
        extra["BOSS_PROFILE"] = profile
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ensure_login.py")],
        cwd=str(ROOT),
        env=_env(**extra),
    )
    print("[boss] BOSS 链结束", flush=True)


def run_liepin() -> None:
    print("[liepin] 启动猎聘链（聊一聊 + 固定招呼语）", flush=True)
    env = _env(
        LIEPIN_DAILY_LIMIT=os.environ.get(
            "LIEPIN_DAILY_LIMIT", str(DEFAULT_DAILY_LIMITS["liepin"])
        )
    )
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "liepin_auto.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[liepin] 猎聘链结束", flush=True)


def run_job51() -> None:
    print("[job51] 启动前程无忧链（投简历）", flush=True)
    env = _env(
        JOB51_DAILY_LIMIT=os.environ.get(
            "JOB51_DAILY_LIMIT", str(DEFAULT_DAILY_LIMITS["job51"])
        )
    )
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "job51_auto.py")],
        cwd=str(ROOT),
        env=env,
    )
    print("[job51] 前程无忧链结束", flush=True)


def run_cruise_parallel(boss_profile: str | None = None) -> None:
    """三平台并行巡航：各自登录态/去重/限额独立，阻塞直到全部结束。"""
    threads = [
        threading.Thread(target=run_boss, name="boss", kwargs={"profile": boss_profile}),
        threading.Thread(target=run_liepin, name="liepin"),
        threading.Thread(target=run_job51, name="job51"),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
