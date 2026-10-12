"""三平台公共的浏览器 profile 会话清理（单一真相）。

杀掉占着本 profile 的孤儿 Chrome 进程 + 清掉 Chrome 的 Singleton 锁文件。
历史上 BOSS（core/process_cleanup.py）/ 猎聘 / 51job（各自 driver.py）各一份：
- 猎聘/51job 版是简化版：仅支持 Windows、命令行模糊匹配、无超时；
- BOSS 版更健壮：user-data-dir 精确正则匹配、10s 超时、pwsh 回退、pkill 跨平台。
P2（2026-10）统一采用 BOSS 版语义——对猎聘/51job 是纯升级：清得更准，不误杀不漏杀。

测试兼容：本模块用 ``import subprocess`` / ``import shutil``（模块引用而非
from-import），tests/test_finding_jobs_text.py 对 finding_jobs.subprocess.run
的全局 monkeypatch 依然生效（三者拿到的是同一个模块对象）。
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys

log = logging.getLogger(__name__)


def clear_singleton_locks(profile_dir: str) -> None:
    """删掉 profile 里残留的 Singleton 锁文件。"""
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            os.remove(os.path.join(profile_dir, name))
        except FileNotFoundError:
            pass
        except Exception as e:  # noqa: BLE001
            log.debug("清 Singleton 锁 %s 跳过：%s", name, e)


def kill_profile_chrome_windows(profile_dir: str) -> None:
    """Windows 下按命令行里的 user-data-dir 回收工具专用 Chrome。"""
    powershell = shutil.which("powershell") or shutil.which("pwsh")
    if not powershell:
        log.debug("找不到 PowerShell，跳过 Windows Chrome 回收")
        return
    script = r"""
param([string]$targetDir)
if (-not $targetDir) { return }
$profile = [System.IO.Path]::GetFullPath($targetDir)
$escaped = [Regex]::Escape($profile)
$processes = @()
try {
  $processes = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    $_.CommandLine -and $_.Name -like 'chrome*' -and (
      $_.CommandLine.Contains($profile) -or
      $_.CommandLine.Contains($targetDir) -or
      $_.CommandLine -match "--user-data-dir=`"?$escaped`"?" -or
      $_.CommandLine -match "--user-data-dir=$escaped"
    )
  }
} catch {
  try {
    $processes = Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object {
      $_.CommandLine -and $_.Name -like 'chrome*' -and (
        $_.CommandLine.Contains($profile) -or
        $_.CommandLine.Contains($targetDir) -or
        $_.CommandLine -match "--user-data-dir=`"?$escaped`"?" -or
        $_.CommandLine -match "--user-data-dir=$escaped"
      )
    }
  } catch {}
}
foreach ($p in $processes) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
}
"""
    try:
        subprocess.run(
            [powershell, "-NoProfile", "-Command", f"& {{ {script} }}", profile_dir],
            capture_output=True,
            timeout=10,
        )
    except Exception as e:  # noqa: BLE001
        log.debug("Windows 回收工具专用 Chrome 跳过：%s", e)


def kill_profile_chrome(profile_dir: str) -> None:
    """杀掉占着本 profile 的残留 Chrome（Windows 精确匹配 / 其他平台 pkill）。"""
    profile_abs = os.path.abspath(profile_dir)
    if sys.platform == "win32":
        kill_profile_chrome_windows(profile_abs)
        return
    try:
        subprocess.run(
            ["pkill", "-f", profile_abs],
            capture_output=True,
            timeout=5,
        )
    except Exception as e:  # noqa: BLE001
        log.debug("pkill 残留 Chrome 跳过：%s", e)


def reap_profile_chrome(profile_dir: str) -> None:
    """起浏览器前的自清理：先收掉占 profile 的孤儿 Chrome，再清 Singleton 锁。"""
    kill_profile_chrome(profile_dir)
    clear_singleton_locks(profile_dir)
