"""读猎聘 profile 的 Cookies SQLite，看有没有登录态 cookie（只读 host_key/name，不解密值）。"""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
p = ROOT / "liepin_profile" / "Default" / "Network" / "Cookies"

con = sqlite3.connect(str(p))
cur = con.cursor()
total = cur.execute("SELECT COUNT(*) FROM cookies").fetchone()[0]
print("TOTAL_COOKIES =", total)
hosts = cur.execute("SELECT DISTINCT host_key FROM cookies ORDER BY host_key").fetchall()
print("HOSTS:")
for h in hosts[:40]:
    print("  ", h[0])
try:
    rows = cur.execute(
        "SELECT host_key, name, length(encrypted_value), expires_utc FROM cookies "
        "WHERE host_key LIKE '%liepin%' ORDER BY host_key, name"
    ).fetchall()
except sqlite3.OperationalError as e:
    print("ERR", e)
    rows = []

for hk, n, l, exp in rows:
    print(f"{hk} | {n} | enc_len={l} | expires={exp}")
print("LIEPIN_ROWS =", len(rows))
con.close()
