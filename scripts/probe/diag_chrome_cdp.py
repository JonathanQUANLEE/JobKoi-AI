"""诊断 Chrome CDP 端口：捕获 Chrome stderr，用绝对路径 + 新参数。"""

import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = ROOT / "job51_profile_test4"
ERRLOG = ROOT / "logs" / "chrome_diag_err.txt"
PORT = 9799

PROFILE.mkdir(parents=True, exist_ok=True)

args = [
    CHROME,
    f"--remote-debugging-port={PORT}",
    f"--user-data-dir={PROFILE}",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
    "https://example.com",
]
print("CMD:", " ".join(args), flush=True)

with open(ERRLOG, "w", encoding="utf-8", errors="replace") as errf:
    p = subprocess.Popen(args, stdout=errf, stderr=errf)

ok = False
for i in range(15):
    time.sleep(1)
    try:
        r = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=2)
        print("CDP_OK:", r.read()[:150], flush=True)
        ok = True
        break
    except Exception as e:
        if i in (4, 9, 14):
            print(f"  wait {i+1}s: {type(e).__name__}", flush=True)

print("RESULT:", "CDP_CONNECTED" if ok else "CDP_FAILED", flush=True)
print("process_alive:", p.poll() is None, flush=True)

# 读 Chrome stderr 前 20 行
time.sleep(1)
try:
    err = ERRLOG.read_text(encoding="utf-8", errors="replace").strip()
    print("--- chrome stderr ---", flush=True)
    for line in err.splitlines()[:20]:
        print("  ", line, flush=True)
except Exception as e:  # noqa: BLE001
    print("err read fail:", e, flush=True)

p.terminate()
