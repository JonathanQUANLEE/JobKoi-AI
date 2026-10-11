"""诊断：检查 job51_profile 残留 chrome 进程和 Singleton 锁。"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / "job51_profile"

r = subprocess.run(
    ["powershell", "-NoProfile", "-Command",
     "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | "
     "Where-Object { $_.CommandLine -like '*job51_profile*' } | "
     "Select-Object -ExpandProperty ProcessId"],
    capture_output=True, text=True,
)
pids = [x.strip() for x in r.stdout.splitlines() if x.strip().isdigit()]
print("job51_chrome_pids =", pids)

locks = [f.name for f in PROFILE.glob("Singleton*")] if PROFILE.exists() else []
print("locks =", locks)

if pids or locks:
    print("NEED_CLEANUP")
else:
    print("CLEAN")
