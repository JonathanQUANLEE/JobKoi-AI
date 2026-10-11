"""智能助手域：对话入口、LLM 配置、简历诊断、工具执行白名单、回复检测。

设计要点见 boss_zhipin.agent.profile_generator 的模块 docstring：
agent 只产出「表单可回填的 profile」，永不直接触发投递（隔离由
tests/test_agent_isolation.py 固化）。入参走 _CamelModel（camelCase），
返回值保持 snake_case 原样透传——前端 hydrateFromProfile 读的就是
snake_case 键，套别名转换会把回填全弄坏。

工具执行层（F4）隔离红线：agent 包只产出 action 意图；真正动手（读日志/
读页面）在这里，保证「LLM 永不直接触发投递」——prepare_run 也不在此执行，
只由前端渲染确认按钮走现有 start_run。
"""
from __future__ import annotations

from typing import Any

from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands


class _AgentChatBody(_CamelModel):
    message: str
    history: list[dict[str, Any]] = []
    current_form: dict[str, Any] = {}


class _SaveLLMConfigBody(_CamelModel):
    base_url: str = ""
    api_key: str = ""
    model: str = ""


@commands.command()
async def agent_chat(body: _AgentChatBody) -> dict:
    """智能助手一轮对话：LLM 把自然语言翻译成 profile（结构化错误走返回值）。"""
    from boss_zhipin.agent import profile_generator

    if not body.message.strip():
        raise ValueError("消息不能为空")
    return await profile_generator.generate(
        body.message, history=body.history, current_form=body.current_form
    )


@commands.command()
async def get_llm_config() -> dict:
    """读 LLM 端点配置（api_key 脱敏）+ 免费模型预置列表。"""
    from boss_zhipin.agent.config_io import mask_key, read_config
    from boss_zhipin.agent.presets import LLM_PRESETS

    config = read_config()
    return {
        "base_url": config.base_url,
        "api_key": mask_key(config.api_key),
        "model": config.model,
        "configured": config.is_configured(),
        "presets": LLM_PRESETS,
    }


@commands.command()
async def save_llm_config(body: _SaveLLMConfigBody) -> dict:
    """保存 LLM 端点配置。api_key 提交空串/掩码 = 保留旧值。"""
    from boss_zhipin.agent.config_io import (
        AgentConfig,
        mask_key,
        merge_saved_key,
        read_config,
        write_config,
    )

    existing = read_config()
    config = AgentConfig(
        base_url=body.base_url.strip(),
        api_key=merge_saved_key(body.api_key, existing.api_key),
        model=body.model.strip(),
    )
    write_config(config)
    return {
        "status": "saved",
        "api_key": mask_key(config.api_key),
        "configured": config.is_configured(),
    }


class _DiagnoseResumeBody(_CamelModel):
    resume_text: str
    target_role: str = ""
    active_skills: list[str] | None = None
    user_prompt: str = ""


@commands.command()
async def diagnose_resume(body: _DiagnoseResumeBody) -> dict:
    """Agent 2：针对简历文本进行启发式算法评分与 LLM 深度精修建议。"""
    from boss_zhipin.agent import resume_polisher

    return await resume_polisher.diagnose_and_polish(
        resume_text=body.resume_text,
        target_role=body.target_role,
        active_skills=body.active_skills,
        user_prompt=body.user_prompt,
    )


class _CalculateATSScoreBody(_CamelModel):
    resume_text: str


@commands.command()
async def calculate_ats_score(body: _CalculateATSScoreBody) -> dict:
    """纯本地快速计算 ATS 启发式算法评分指标。"""
    from boss_zhipin.algorithms.ats_scorer import ATSScorer

    res = ATSScorer.score(body.resume_text)
    return res.to_dict()


class _AgentExecuteActionBody(_CamelModel):
    type: str
    params: dict[str, Any] = {}


@commands.command()
async def agent_execute_action(body: _AgentExecuteActionBody) -> dict:
    """执行智能助手声明的工具（白名单：get_stats / preview_jobs）。"""
    if body.type == "get_stats":
        from boss_zhipin.gui.stats_io import format_stats, query_stats

        stats = query_stats()
        return {
            "status": "ok",
            "type": "get_stats",
            "text": format_stats(stats),
            "data": stats,
        }
    if body.type == "preview_jobs":
        from boss_zhipin.gui.preview import preview_jobs

        n = body.params.get("n", 5)
        try:
            count = int(n)
        except (TypeError, ValueError):
            count = 5
        return await preview_jobs(count)
    raise ValueError(f"未知或不支持自动执行的动作: {body.type}")


@commands.command()
async def check_boss_replies() -> dict:
    """读当前页面导航的未读消息数（前端 60s 轮询，仅空闲时）。"""
    from boss_zhipin.website_oper import message_check

    return await message_check.check_new_replies()
