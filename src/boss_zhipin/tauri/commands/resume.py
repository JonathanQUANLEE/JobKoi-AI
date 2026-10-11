"""简历库管理域：resume/ 目录的列表/默认/读取/上传/删除/原样打开。"""
from __future__ import annotations

from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands


class _SetDefaultResumeBody(_CamelModel):
    name: str = ""


@commands.command()
async def list_resumes() -> dict:
    """列出 resume/ 目录里的简历文件（pdf/doc/docx/png/jpg）。"""
    from boss_zhipin.gui.resume_io import list_resumes as _list_resumes

    return {"resumes": _list_resumes()}


@commands.command()
async def set_default_resume(body: _SetDefaultResumeBody) -> dict:
    """把某个简历设为默认（写 resume/default.txt 标记），传空则取消默认。"""
    from boss_zhipin.gui.resume_io import (
        set_default_resume as _set_default,
        unset_default_resume as _unset_default,
    )

    if not body.name or body.name.strip() in ("", "__none__"):
        return _unset_default()
    return _set_default(body.name)


class _GetResumeContentBody(_CamelModel):
    name: str


@commands.command()
async def get_resume_content(body: _GetResumeContentBody) -> dict:
    """读取指定简历文件内容（返回 base64 及提取文本供前端即时预览）。"""
    from boss_zhipin.gui.resume_io import get_resume_content as _get_content

    return _get_content(body.name)


class _SaveResumeFileBody(_CamelModel):
    name: str
    content_b64: str


@commands.command()
async def save_resume_file(body: _SaveResumeFileBody) -> dict:
    """保存/上传简历文件到 resume/ 目录。"""
    from boss_zhipin.gui.resume_io import save_resume_file as _save_file

    return _save_file(body.name, body.content_b64)


class _DeleteResumeFileBody(_CamelModel):
    name: str


@commands.command()
async def delete_resume_file(body: _DeleteResumeFileBody) -> dict:
    """删除指定的简历文件。"""
    from boss_zhipin.gui.resume_io import delete_resume_file as _delete_file

    return _delete_file(body.name)


class _OpenResumeNativeBody(_CamelModel):
    name: str


@commands.command()
async def open_resume_native(body: _OpenResumeNativeBody) -> dict:
    """使用系统原生应用直接打开简历源文件（如 WPS、Word、PDF 查阅器等）。"""
    from boss_zhipin.gui.resume_io import open_resume_native as _open_native

    return _open_native(body.name)
