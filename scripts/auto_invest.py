"""投递监护（看门狗）：自动重启挂死的投递进程，实现无人值守连投。

背景：nodriver 个别 CDP 调用会不可取消地挂死（页面上下文销毁瞬间发请求），
asyncio.wait_for 都拦不住，进程内恢复不可靠。这里用进程级方案：监控
logs/*.jsonl 的行数增长，停滞超过 STALL_SECONDS 就杀掉子进程（连带它的
Chrome），重启一轮。去重库（seen/sent 日志）保证重启后绝不重复投递。

用法：
    uv run python scripts/auto_invest.py            # 用 .env 里的 BOSS_START_URL
    双击 投AI-Agent专项.bat / 启动投递.bat           # 已预设对应 URL

停止：Ctrl+C，或直接关掉窗口。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGS = ROOT / "logs"
SENT_LOG = LOGS / "sent_jobs.jsonl"
WATCHED_LOGS = [
    LOGS / "sent_jobs.jsonl",
    LOGS / "skipped_jobs.jsonl",
    LOGS / "seen_jobs.jsonl",
]

DAILY_LIMIT = 150      # 用户要求：BOSS 每日 150 份（与 profiles/0my.yml 的 daily_sent_limit 一致）
STALL_SECONDS = 360    # 日志无增长超过这个秒数判定挂死
RESTART_PAUSE = 20     # 杀掉后等多久再重启
MAX_IDLE_ROUNDS = 3    # 连续这么多轮"零新增投递"就退出（下限）；实际阈值见 main() 的 idle_limit
MAX_ROUNDS = 40        # 绝对轮数上限，兜底防止无限重启


def _line_counts() -> tuple[int, ...]:
    counts = []
    for path in WATCHED_LOGS:
        try:
            with path.open("rb") as f:
                counts.append(sum(1 for _ in f))
        except OSError:
            counts.append(0)
    return tuple(counts)


def _sent_today() -> int:
    today = datetime.now().strftime("%Y-%m-%d")
    if not SENT_LOG.exists():
        return 0
    count = 0
    with SENT_LOG.open(encoding="utf-8") as f:
        for line in f:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get("sent") and str(record.get("ts_local") or "").startswith(today):
                count += 1
    return count


def _kill_child(proc: subprocess.Popen) -> None:
    # /T 连带杀掉子进程树（Chrome 是它拉起来的），/F 强杀挂死进程。
    subprocess.run(
        ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
        capture_output=True,
    )
    # 兜底：再清一遍占着 profile 的孤儿 Chrome。
    subprocess.run(
        [
            "powershell", "-NoProfile", "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | "
            "Where-Object {$_.CommandLine -like '*Bosszhipin-job-bot*chrome_profile*'} | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        capture_output=True,
    )


def _stamp() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _start_urls() -> list[str]:
    """本轮要跑的搜索 URL 列表。

    ``BOSS_START_URLS`` 用分号分隔多个搜索词，每轮换一个，
    避免单一关键词（比如 AI Agent）岗位太少、扫完就没活干。
    """
    raw = os.getenv("BOSS_START_URLS", "").strip()
    if raw:
        return [u.strip() for u in re.split(r"[;|]", raw) if u.strip()]
    single = os.getenv("BOSS_START_URL", "").strip()
    return [single] if single else []


def main() -> None:
    print(f"[{_stamp()}] 投递监护启动：停滞 {STALL_SECONDS}s 自动重启，日上限 {DAILY_LIMIT}")
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    urls = _start_urls()
    if urls:
        print(f"[{_stamp()}] 搜索词 {len(urls)} 个，每轮换一个：")
        for i, u in enumerate(urls, 1):
            print(f"    {i}. {u}")
    # 关键：连续零新增的退出阈值必须 >= 关键词数量，否则后面的关键词根本没搜到
    # 就误判"岗位池扫完"（2026-10-07 22 个词只跑了 3 个就退出的教训）。
    idle_limit = max(MAX_IDLE_ROUNDS, len(urls) + 2) if urls else MAX_IDLE_ROUNDS
    print(f"[{_stamp()}] 连续零新增退出阈值：{idle_limit} 轮")
    rounds = 0
    idle_rounds = 0

    while True:
        if rounds >= MAX_ROUNDS:
            print(f"[{_stamp()}] 已达轮数上限 {MAX_ROUNDS}，监护退出。")
            return

        today_count = _sent_today()
        if today_count >= DAILY_LIMIT:
            print(
                f"[{_stamp()}] 今日已投 {today_count}/{DAILY_LIMIT} 条，达到日上限。"
                "监护退出，明天再跑。"
            )
            return

        rounds += 1
        round_start_sent = today_count
        if urls:
            env["BOSS_START_URL"] = urls[(rounds - 1) % len(urls)]
        print(
            f"[{_stamp()}] ===== 第 {rounds} 轮启动（今日已投 {today_count}，"
            f"剩 {DAILY_LIMIT - today_count} 额度）=====\n"
            f"[{_stamp()}] 本轮搜索：{env.get('BOSS_START_URL', '-')}"
        )
        proc = subprocess.Popen(
            ["uv", "run", "main.py", "--profile", "0my"],
            cwd=str(ROOT),
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )

        last_counts = _line_counts()
        last_change = time.monotonic()
        while True:
            time.sleep(15)
            if proc.poll() is not None:
                print(f"[{_stamp()}] 投递进程正常退出（code={proc.returncode}）")
                break
            today_count = _sent_today()
            if today_count >= DAILY_LIMIT:
                print(f"[{_stamp()}] 日限额已满（{today_count}），停止本轮")
                _kill_child(proc)
                print(f"[{_stamp()}] 监护退出，明天再跑。")
                return
            counts = _line_counts()
            if counts != last_counts:
                last_counts = counts
                last_change = time.monotonic()
                continue
            stalled = time.monotonic() - last_change
            if stalled > STALL_SECONDS:
                print(
                    f"[{_stamp()}] 日志 {STALL_SECONDS}s 无增长（疑似挂死），"
                    f"强杀第 {rounds} 轮进程并重启"
                )
                _kill_child(proc)
                break
        else:
            pass

        if proc.poll() is None:
            _kill_child(proc)

        # 本轮是否真的多投出去。岗位池扫完（全是 seen）或被风控拦住时，
        # 每轮都是零新增，必须及时退出，否则会像以前那样空转几百轮。
        gained = _sent_today() - round_start_sent
        if gained > 0:
            idle_rounds = 0
        else:
            idle_rounds += 1
            print(
                f"[{_stamp()}] 第 {rounds} 轮零新增投递"
                f"（连续 {idle_rounds}/{idle_limit} 轮）"
            )
        if idle_rounds >= idle_limit:
            print(
                f"[{_stamp()}] 连续 {idle_limit} 轮零新增："
                "岗位池已扫完或账号被风控拦截，监护退出。"
            )
            return

        time.sleep(RESTART_PAUSE)


if __name__ == "__main__":
    main()
