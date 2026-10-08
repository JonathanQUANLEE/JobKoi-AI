"""猎聘一条龙：登录（如需要）+ 接管投递看门狗。

对应 BOSS 的 ensure_login.py。登录态已在 liepin_profile 时直接接管投递；
未登录则拉二维码等扫码，登录成功后自动开投。
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))

import liepin_login  # noqa: E402 — 复用登录逻辑


def main() -> int:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    # 1. 登录（已登录会秒回，未登录拉二维码等扫码）
    print("[liepin] 检查登录态...", flush=True)
    rc = liepin_login.uc.loop().run_until_complete(liepin_login.main())
    if rc != 0:
        print("[liepin] 登录没搞定，跳过猎聘投递。", flush=True)
        return rc

    # 2. 接管投递看门狗
    print("[liepin] 登录就绪，启动投递看门狗...", flush=True)
    env["LIEPIN_DAILY_LIMIT"] = os.environ.get("LIEPIN_DAILY_LIMIT", "100")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "liepin_invest.py")],
        cwd=str(ROOT),
        env=env,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
