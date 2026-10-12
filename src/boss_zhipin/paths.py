"""落盘路径的统一解析——解决 standalone .app 的 CWD 问题。

项目里所有默认落盘路径（``./chrome_profile`` / ``./logs`` / ``.env``）
都是 **CWD 相对**的：

- **repo / CLI 模式**（默认）：CWD 就是 repo root，历史行为，一切不变。
  CLAUDE.md 红线：不改现有用户 ``chrome_profile`` 的默认位置。
- **standalone 模式**（Phase D 的 .app，``BOSS_TAURI_STANDALONE=1``）：
  双击启动时 CWD 是 ``/``，相对路径全废。解法不是逐个改业务代码里的
  路径，而是入口处 ``ensure_app_data_cwd()`` 一次性把 CWD 切到平台
  应用数据目录（macOS: ``~/Library/Application Support/<identifier>``），
  让所有相对默认值原样生效。

env var 覆盖（``BOSS_CHROME_PROFILE`` / ``LETTER_LOG_PATH`` 等）依旧优先，
绝对路径不受 chdir 影响。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# 跟 src-tauri/tauri.conf.json 的 identifier 保持一致
APP_IDENTIFIER = "com.longsizhuo.boss-zhipin"


def is_standalone() -> bool:
    """是否运行在 Phase D standalone .app 里（Rust 主进程 set 的 env var）。"""
    return os.environ.get("BOSS_TAURI_STANDALONE") == "1"


def app_data_dir() -> Path:
    """平台应用数据目录。``BOSS_APP_DATA_DIR`` env 可覆盖（也方便测试）。"""
    override = os.environ.get("BOSS_APP_DATA_DIR", "").strip()
    if override:
        return Path(override)
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    return base / APP_IDENTIFIER


def ensure_app_data_cwd() -> Path:
    """standalone 入口调：建好数据目录并 chdir 进去，返回该目录。

    之后所有 CWD 相对的默认路径（logs/ chrome_profile/ .env）都自动落在
    数据目录下。非 standalone 模式**不要**调它。
    """
    data_dir = app_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    os.chdir(data_dir)
    return data_dir


def get_platform_profile_dir(platform_id: str, *, dev_root: Path | None = None) -> Path:
    """统一解析平台 Chrome Profile 存储目录（2026-10-13 打包加固）。

    优先级（三平台单一真相，浏览器实际使用与 cookie 登录探测必须同源）：

    1. **env 覆盖**：``BOSS_CHROME_PROFILE`` / ``LIEPIN_CHROME_PROFILE`` /
       ``JOB51_CHROME_PROFILE``——历史约定，绝对优先；
    2. **standalone 打包模式**：``%APPDATA%/<identifier>/profiles/<platform>``
       ——安装包可能释放到 ``C:\\Program Files\\`` 或任意盘的任意目录，
       Windows UAC 对安装目录只读，Chrome 写 cookie 会 Access Denied。
       用户数据区与安装位置解耦，装哪个盘都有 100% 写权限；
    3. **开发/CLI 模式**：仓库根下的历史目录（chrome_profile /
       liepin_profile / job51_profile）——用户已登录的 cookie 一分不动。

    ``dev_root`` 供测试注入临时根目录（tests/test_platforms.py 的
    ``LiepinPlatform(root_dir=tmp_path)`` 用法保持兼容）。
    """
    env_map = {
        "boss": "BOSS_CHROME_PROFILE",
        "liepin": "LIEPIN_CHROME_PROFILE",
        "job51": "JOB51_CHROME_PROFILE",
    }
    env_key = env_map.get(platform_id)
    if env_key and os.environ.get(env_key, "").strip():
        return Path(os.environ[env_key]).resolve()

    if is_standalone():
        target = app_data_dir() / "profiles" / platform_id
        target.mkdir(parents=True, exist_ok=True)
        return target

    root = dev_root or Path(__file__).resolve().parent.parent.parent
    dirname = "chrome_profile" if platform_id == "boss" else f"{platform_id}_profile"
    return (root / dirname).resolve()
