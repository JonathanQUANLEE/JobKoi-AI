"""检查猎聘 cookie 的持久性：登录 cookie 是 session cookie（无 expires）还是持久 cookie。"""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
p = ROOT / "liepin_profile" / "Default" / "Network" / "Cookies"

con = sqlite3.connect(str(p))
cur = con.cursor()
rows = cur.execute(
    "SELECT host_key, name, length(encrypted_value), expires_utc, is_persistent "
    "FROM cookies WHERE host_key LIKE '%liepin%' "
    "ORDER BY host_key, name"
).fetchall()
print(f"总 {len(rows)} 条 liepin cookie：")
for hk, n, l, exp, persist in rows:
    flag = "持久" if persist else "会话"
    print(f"  {hk:28s} {n:32s} len={l} expires={exp} {flag}")
con.close()
