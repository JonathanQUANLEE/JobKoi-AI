"""GUI profile 和固定招呼语读写。

该模块只处理本地文件，不依赖 PyTauri，便于单元测试和 CLI/GUI 共用。
"""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any

import yaml

from boss_zhipin.audit import validate_letter
from boss_zhipin.config.profiles import load_profile

_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
DEFAULT_PROFILES_DIR = Path("profiles")
DEFAULT_GREETING_PATH = Path("greetings") / "default.txt"


def list_profiles(
    *, profiles_dir: str | Path = DEFAULT_PROFILES_DIR
) -> list[dict[str, str]]:
    """列出可由 GUI 选择的 profile YAML 文件。"""
    root = Path(profiles_dir)
    if not root.exists():
        return []
    items: list[dict[str, str]] = []
    for path in sorted(root.iterdir(), key=lambda item: item.stem.lower()):
        if path.name.startswith(".") or path.suffix not in {".yml", ".yaml"}:
            continue
        items.append({"name": path.stem, "path": str(path.resolve())})
    return items


def get_profile(
    name: str, *, profiles_dir: str | Path = DEFAULT_PROFILES_DIR
) -> dict[str, Any]:
    """读取合并后的 profile 数据，供 GUI 表单回填。"""
    _validate_profile_name(name)
    loaded = load_profile(name, profiles_dir=profiles_dir)
    return {
        "name": loaded.name,
        "path": str(loaded.path.resolve()),
        "data": loaded.data,
    }


def save_profile(
    name: str,
    data: dict[str, Any],
    *,
    profiles_dir: str | Path = DEFAULT_PROFILES_DIR,
) -> dict[str, str]:
    """保存 GUI 表单生成的 profile YAML。"""
    _validate_profile_name(name)
    root = Path(profiles_dir)
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{name}.yml"
    with path.open("w", encoding="utf-8", newline="\n") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
    return {"name": name, "path": str(path.resolve()), "status": "saved"}


def get_greeting(*, path: str | Path = DEFAULT_GREETING_PATH) -> dict[str, str]:
    """读取固定招呼语；文件不存在时返回空文本。"""
    greeting_path = Path(path)
    text = (
        greeting_path.read_text(encoding="utf-8").strip()
        if greeting_path.exists()
        else ""
    )
    return {"path": str(greeting_path.resolve()), "text": text}


def save_greeting(
    text: str, *, path: str | Path = DEFAULT_GREETING_PATH
) -> dict[str, str]:
    """保存固定招呼语，并先执行发送前同款基础校验。"""
    greeting = text.strip()
    if not greeting:
        raise ValueError("招呼语不能为空")
    validation = validate_letter(greeting)
    if not validation.ok:
        raise ValueError("招呼语不符合发送校验: " + ", ".join(validation.reasons))
    greeting_path = Path(path)
    greeting_path.parent.mkdir(parents=True, exist_ok=True)
    greeting_path.write_text(greeting, encoding="utf-8", newline="\n")
    return {"path": str(greeting_path.resolve()), "status": "saved"}


def _validate_profile_name(name: str) -> None:
    if not _PROFILE_NAME_RE.fullmatch(name.strip()):
        raise ValueError("profile 名称只能包含字母、数字、下划线和短横线")
