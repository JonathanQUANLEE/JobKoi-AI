"""standalone（src-tauri/）和 wheel（src/boss_zhipin/tauri/）两套配置的同步守卫。

这些文件分属不同工具链（Rust / Python），没法共享单一来源，靠测试兜底：
- capabilities：``default.toml``（wheel dev）和 ``default.json``（standalone）
  必须语义一致，否则两种模式下前端 ``pyInvoke`` 的 ACL 行为分叉。
- 版本号：pyproject / Tauri.toml / tauri.conf.json / Cargo.toml 四处手工
  维护，发版时漏改任何一处都会让 .app 的版本展示对不上。
"""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
WHEEL_TAURI_DIR = REPO_ROOT / "src" / "boss_zhipin" / "tauri"
SRC_TAURI_DIR = REPO_ROOT / "src-tauri"


def test_capabilities_in_sync():
    toml_cap = tomllib.loads(
        (WHEEL_TAURI_DIR / "capabilities" / "default.toml").read_text(encoding="utf-8")
    )
    json_cap = json.loads(
        (SRC_TAURI_DIR / "capabilities" / "default.json").read_text(encoding="utf-8")
    )
    assert toml_cap["identifier"] == json_cap["identifier"]
    assert toml_cap["windows"] == json_cap["windows"]
    # 权限列表语义一致（顺序无关）；pytauri:default 必须在（见 project memory）
    assert set(toml_cap["permissions"]) == set(json_cap["permissions"])
    assert "pytauri:default" in toml_cap["permissions"]


def test_versions_in_sync():
    pyproject = tomllib.loads(
        (REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    )
    wheel_tauri = tomllib.loads(
        (WHEEL_TAURI_DIR / "Tauri.toml").read_text(encoding="utf-8")
    )
    tauri_conf = json.loads(
        (SRC_TAURI_DIR / "tauri.conf.json").read_text(encoding="utf-8")
    )
    cargo = tomllib.loads((SRC_TAURI_DIR / "Cargo.toml").read_text(encoding="utf-8"))

    version = pyproject["project"]["version"]
    assert wheel_tauri["version"] == version, "Tauri.toml 版本号没跟 pyproject 同步"
    assert tauri_conf["version"] == version, "tauri.conf.json 版本号没跟 pyproject 同步"
    assert cargo["package"]["version"] == version, (
        "Cargo.toml 版本号没跟 pyproject 同步"
    )


def test_identifiers_in_sync():
    tauri_conf = json.loads(
        (SRC_TAURI_DIR / "tauri.conf.json").read_text(encoding="utf-8")
    )
    wheel_tauri = tomllib.loads(
        (WHEEL_TAURI_DIR / "Tauri.toml").read_text(encoding="utf-8")
    )
    from boss_zhipin.paths import APP_IDENTIFIER

    assert tauri_conf["identifier"] == APP_IDENTIFIER
    assert wheel_tauri["identifier"] == APP_IDENTIFIER


def test_product_name_in_sync():
    tauri_conf = json.loads(
        (SRC_TAURI_DIR / "tauri.conf.json").read_text(encoding="utf-8")
    )
    wheel_tauri = tomllib.loads(
        (WHEEL_TAURI_DIR / "Tauri.toml").read_text(encoding="utf-8")
    )
    assert tauri_conf["productName"] == wheel_tauri["productName"]


def test_updater_config_in_sync():
    """plugins.updater（2026-10-19 自动更新）双模式一致性守卫。

    pubkey / endpoints / windows.installMode 三项任一分叉都会导致 wheel dev
    模式与 standalone 安装包的更新行为不一致（如 dev 能查更新而安装包报
    "无 endpoints"）。
    """
    tauri_conf = json.loads(
        (SRC_TAURI_DIR / "tauri.conf.json").read_text(encoding="utf-8")
    )
    wheel_tauri = tomllib.loads(
        (WHEEL_TAURI_DIR / "Tauri.toml").read_text(encoding="utf-8")
    )
    conf_updater = tauri_conf["plugins"]["updater"]
    toml_updater = wheel_tauri["plugins"]["updater"]
    assert conf_updater["pubkey"] == toml_updater["pubkey"], "updater pubkey 双模式不一致"
    assert conf_updater["endpoints"] == toml_updater["endpoints"], (
        "updater endpoints 双模式不一致"
    )
    assert (
        conf_updater["windows"]["installMode"]
        == toml_updater["windows"]["installMode"]
    ), "updater installMode 双模式不一致"
    # 端点必须是 https（release 构建拒绝 http，除非显式开危险开关）
    for endpoint in conf_updater["endpoints"]:
        assert endpoint.startswith("https://"), f"updater 端点必须 https：{endpoint}"
