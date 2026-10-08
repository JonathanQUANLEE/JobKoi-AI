"""前程无忧一条龙：登录（如需要）+ 接管投递看门狗。"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))

import job51_login  # noqa: E402


def main() -> int:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    print("[job51] 检查登录态...", flush=True)
    rc = job51_login.uc.loop().run_until_complete(job51_login.main())
    if rc != 0:
        print("[job51] 登录没搞定，跳过前程无忧投递。", flush=True)
        return rc

    print("[job51] 登录就绪，启动投递看门狗...", flush=True)
    env["JOB51_DAILY_LIMIT"] = os.environ.get("JOB51_DAILY_LIMIT", "40")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "job51_invest.py")],
        cwd=str(ROOT),
        env=env,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
