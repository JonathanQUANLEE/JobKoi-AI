"""对比 BOSS 和猎聘 profile 的 cookie 落盘情况。"""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

for label, sub in [("BOSS", "chrome_profile"), ("LIEPIN", "liepin_profile")]:
    p = ROOT / sub / "Default" / "Network" / "Cookies"
    if not p.exists():
        print(f"{label}: 无 Cookies 文件")
        continue
    con = sqlite3.connect(str(p))
    cur = con.cursor()
    total = cur.execute("SELECT COUNT(*) FROM cookies").fetchone()[0]
    hosts = [r[0] for r in cur.execute("SELECT DISTINCT host_key FROM cookies ORDER BY host_key").fetchall()]
    print(f"{label}: 总 cookie {total} 条，域 {len(hosts)} 个")
    for h in hosts[:15]:
        print(f"    {h}")
    con.close()
