"""Profile 单例锁与孤儿 Chrome 进程清理工具。"""
from __future__ import annotations

import logging
import os
import sys

log = logging.getLogger(__name__)


def _clear_singleton_locks(profile_dir: str) -> None:
    """删掉 profile 里残留的 Singleton 锁文件。"""
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            os.remove(os.path.join(profile_dir, name))
        except FileNotFoundError:
            pass
        except Exception as e:
            log.debug("清 Singleton 锁 %s 跳过：%s", name, e)


def _kill_profile_chrome(profile_dir: str) -> None:
    """杀掉占着本 profile 的残留 Chrome。"""
    from boss_zhipin.website_oper import finding_jobs

    profile_abs = os.path.abspath(profile_dir)
    if sys.platform == "win32":
        finding_jobs._kill_profile_chrome_windows(profile_abs)
        return
    try:
        finding_jobs.subprocess.run(
            ["pkill", "-f", profile_abs],
            capture_output=True,
            timeout=5,
        )
    except Exception as e:
        log.debug("pkill 残留 Chrome 跳过：%s", e)


def _kill_profile_chrome_windows(profile_dir: str) -> None:
    """Windows 下按命令行里的 user-data-dir 回收工具专用 Chrome。"""
    from boss_zhipin.website_oper import finding_jobs

    powershell = finding_jobs.shutil.which("powershell") or finding_jobs.shutil.which("pwsh")
    if not powershell:
        log.debug("找不到 PowerShell，跳过 Windows Chrome 回收")
        return
    script = r"""
$profile = [System.IO.Path]::GetFullPath($args[0])
$escaped = [Regex]::Escape($profile)
$processes = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.Name -like 'chrome*' -and (
    $_.CommandLine -match "--user-data-dir=`"?$escaped`"?" -or
    $_.CommandLine -match "--user-data-dir=$escaped"
  )
}
foreach ($p in $processes) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
}
"""
    try:
        finding_jobs.subprocess.run(
            [powershell, "-NoProfile", "-Command", script, profile_dir],
            capture_output=True,
            timeout=10,
        )
    except Exception as e:
        log.debug("Windows 回收工具专用 Chrome 跳过：%s", e)


def _reap_profile_chrome(profile_dir: str) -> None:
    """起浏览器前的自清理：先收掉占 profile 的孤儿 Chrome，再清 Singleton 锁。"""
    _kill_profile_chrome(profile_dir)
    _clear_singleton_locks(profile_dir)
