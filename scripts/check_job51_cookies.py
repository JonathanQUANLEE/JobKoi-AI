"""检查 51job profile 的 cookie：登录态是否还在、登录 cookie 是否持久。"""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
p = ROOT / "job51_profile" / "Default" / "Network" / "Cookies"

if not p.exists():
    print("无 Cookies 文件")
    raise SystemExit(0)

con = sqlite3.connect(str(p))
cur = con.cursor()
total = cur.execute("SELECT COUNT(*) FROM cookies").fetchone()[0]
print(f"总 {total} 条 cookie")
rows = cur.execute(
    "SELECT host_key, name, length(encrypted_value), expires_utc, is_persistent "
    "FROM cookies WHERE host_key LIKE '%51job%' ORDER BY host_key, name"
).fetchall()
for hk, n, l, exp, persist in rows:
    flag = "持久" if persist else "会话"
    print(f"  {hk:26s} {n:28s} len={l} expires={exp} {flag}")
print("51JOB_ROWS =", len(rows))
con.close()
