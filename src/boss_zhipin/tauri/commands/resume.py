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


class _ParseResumeToProfileBody(_CamelModel):
    name: str = ""


@commands.command()
async def parse_resume_to_profile(body: _ParseResumeToProfileBody) -> dict:
    """简历反向驱动求职画像（2026-10-17 P2）：读简历文本 → LLM 提炼结构化画像。

    不走对话链路的一键直连版：简历中心点一下 → 后端读文本 → 复用
    profile_generator 的 LLM 管线（同一 SYSTEM_PROMPT schema / 重试 / 净化）
    → 返回与 agent_chat 同构的 {status, reply, profile}。前端确认后
    hydrateFromProfile 一键回填表单，用户不再需要手敲学历/岗位/技能。
    """
    from boss_zhipin.gui.resume_io import get_resume_content

    try:
        result = get_resume_content(body.name)
    except ValueError as e:
        # 简历文件不存在/不可读（2026-10-17 实测：资料库列表可能挂着已被
        # 手动删除的文件条目）：优雅返回错误而非让 IPC 抛异常栈。
        return {
            "status": "error",
            "code": "resume_not_found",
            "message": f"简历文件不可读：{e}",
            "reply": "",
            "profile": None,
            "action": None,
        }
    text = str(result.get("text") or "").strip()
    if result.get("status") != "ok" or not text:
        return {
            "status": "error",
            "code": "no_resume_text",
            "message": f"简历「{body.name}」未能解析出文本内容（图片类简历请先用简历精修的 OCR），无法提炼画像。",
            "reply": "",
            "profile": None,
            "action": None,
        }

    from boss_zhipin.agent import profile_generator

    message = (
        f"【简历全文：{body.name}】\n{text[:4000]}\n\n"
        "请严格根据以上简历内容提炼求职画像：\n"
        "① search.query 填 1~3 个最匹配的目标岗位（按匹配度排序，用中文逗号分隔）；\n"
        "② page_filters.city 按简历里的城市经历/期望推断意向城市；\n"
        "③ filters.title 的 any 关键词填简历核心技能栈（3~6 个）；\n"
        "④ exclude 排除与简历背景明显不相关的方向；\n"
        "⑤ mode 保持 scan（用户没说要自动投递，安全默认）。\n"
        "在 reply 里用两三句话说明提炼依据（来自简历的哪些经历/技能）。"
    )
    return await profile_generator.generate(message)
