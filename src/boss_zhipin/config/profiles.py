"""Profile YAML 配置加载。

该模块只负责把多 profile 配置合并成最终 dict，不关心 BOSS 页面和发送逻辑。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


class ProfileError(RuntimeError):
    """Profile 配置错误。"""


class ProfileCycleError(ProfileError):
    """Profile 继承链存在循环。"""


@dataclass(frozen=True)
class LoadedProfile:
    name: str
    path: Path
    data: dict[str, Any]


def merge_profile(parent: dict[str, Any], child: dict[str, Any]) -> dict[str, Any]:
    """合并 profile。

    dict 递归合并；list 和标量直接由子 profile 覆盖父 profile。列表不做追加，
    避免父级关键词在子 profile 中隐式生效，导致用户以为自己已覆盖但实际仍命中旧规则。
    """
    merged = dict(parent)
    for key, child_value in child.items():
        if key == "extends":
            continue
        parent_value = merged.get(key)
        if isinstance(parent_value, dict) and isinstance(child_value, dict):
            merged[key] = merge_profile(parent_value, child_value)
        else:
            merged[key] = child_value
    return merged


def load_profile(name: str, *, profiles_dir: str | Path = "profiles") -> LoadedProfile:
    profiles_path = Path(profiles_dir)
    path = _resolve_profile_path(name, profiles_path)
    data = _load_profile_data(path, profiles_path, stack=[])
    return LoadedProfile(name=path.stem, path=path, data=data)


def _load_profile_data(path: Path, profiles_dir: Path, stack: list[Path]) -> dict[str, Any]:
    path = path.resolve()
    if path in stack:
        chain = " -> ".join(item.name for item in [*stack, path])
        raise ProfileCycleError(f"Profile 循环继承: {chain}")

    raw = _read_yaml_mapping(path)
    parent_name = raw.get("extends")
    if not parent_name:
        return {key: value for key, value in raw.items() if key != "extends"}

    # extends 始终相对 profiles 目录解析，避免当前工作目录变化影响继承链。
    parent_path = _resolve_profile_path(str(parent_name), profiles_dir)
    parent_data = _load_profile_data(parent_path, profiles_dir, [*stack, path])
    return merge_profile(parent_data, raw)


def _resolve_profile_path(name: str, profiles_dir: Path) -> Path:
    candidate = Path(name)
    if candidate.suffix not in {".yml", ".yaml"}:
        candidate = candidate.with_suffix(".yml")
    if not candidate.is_absolute():
        candidate = profiles_dir / candidate
    return candidate


def _read_yaml_mapping(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ProfileError(f"Profile 不存在: {path}")
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        raise ProfileError(f"Profile 顶层必须是 mapping: {path}")
    return data
