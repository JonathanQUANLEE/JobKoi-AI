"""求职画像与招呼语域：profiles/*.yml 的增查改 + 固定招呼语文件。"""
from __future__ import annotations

from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands


class _ProfileNameBody(_CamelModel):
    name: str


class _SaveProfileBody(_CamelModel):
    name: str
    data: dict


class _GreetingPathBody(_CamelModel):
    path: str = ""


class _SaveGreetingBody(_CamelModel):
    text: str
    path: str = ""


@commands.command()
async def list_profiles() -> dict[str, list[dict[str, str]]]:
    """列出 ``profiles/*.yml``，供 GUI 下拉选择。"""
    from boss_zhipin.gui.profile_io import list_profiles as _list_profiles

    return {"profiles": _list_profiles()}


@commands.command()
async def get_profile(body: _ProfileNameBody) -> dict:
    """读取合并后的 profile，用于 GUI 表单回填。"""
    from boss_zhipin.gui.profile_io import get_profile as _get_profile

    return _get_profile(body.name)


@commands.command()
async def save_profile(body: _SaveProfileBody) -> dict[str, str]:
    """保存 GUI 表单生成的 profile YAML。"""
    from boss_zhipin.gui.profile_io import save_profile as _save_profile

    return _save_profile(body.name, body.data)


@commands.command()
async def get_greeting(body: _GreetingPathBody | None = None) -> dict[str, str]:
    """读取固定招呼语文件。"""
    from boss_zhipin.gui.profile_io import get_greeting as _get_greeting

    path = body.path if body and body.path else None
    return _get_greeting(path=path) if path else _get_greeting()


@commands.command()
async def save_greeting(body: _SaveGreetingBody) -> dict[str, str]:
    """保存固定招呼语文件。"""
    from boss_zhipin.gui.profile_io import save_greeting as _save_greeting

    return (
        _save_greeting(body.text, path=body.path)
        if body.path
        else _save_greeting(body.text)
    )
