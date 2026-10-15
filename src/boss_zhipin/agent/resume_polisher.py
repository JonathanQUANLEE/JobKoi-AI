"""简历精修与深度诊断 Agent 核心驱动器 (Resume Polisher Agent).

结合：
1. 本地启发式 ATSScorer 算法评估；
2. SemanticMatcher 技能缺口分析算法；
3. Google X-Y-Z 与 STAR 法则等专业 Skills 提示词引擎；
4. 大语言模型（OpenRouter / OpenAI 兼容）深度针对性改写建议。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from boss_zhipin.agent.config_io import effective_config
from boss_zhipin.agent.llm_client import (
    LLMClientError,
    chat_completion_with_retry,
    extract_content,
)
from boss_zhipin.algorithms.ats_scorer import ATSScorer
from boss_zhipin.algorithms.semantic_matcher import SemanticMatcher

log = logging.getLogger(__name__)

# 内置权威简历改写 Skills 规则定义
SKILL_DEFINITIONS = {
    "star": {
        "id": "star",
        "name": "STAR 闭环改写",
        "description": "严格遵循情境 (S)、任务 (T)、行动 (A)、结果 (R) 四段式逻辑，消除空洞叙述。",
        "prompt_instruction": (
            "【Skill: STAR 法则规范】请将经历重构为清晰的四部曲："
            "S(遇到的业务痛点/瓶颈) -> T(明确量化的攻坚目标) -> A(采用的具体技术架构与关键实现) -> R(最终带来的量化价值与性能突破)。"
        ),
    },
    "xyz": {
        "id": "xyz",
        "name": "Google X-Y-Z 量化标准",
        "description": "通过行动 [Z]，达成成果 [X]，并用数据 [Y] 进行精准度量。",
        "prompt_instruction": (
            "【Skill: Google X-Y-Z 业绩公式】每一项主要成果必须满足："
            "\"通过采用[具体工具/算法/方案 Z]，实现[业务目标 X]，并将[核心指标 Y]从原始值提升/降低至目标值\"。"
        ),
    },
    "ats": {
        "id": "ats",
        "name": "ATS 关键词穿透",
        "description": "分析主流招聘平台机筛偏好，提升专业技能词密度与行业术语契合度。",
        "prompt_instruction": (
            "【Skill: ATS 关键词对齐】突出主流招聘系统重点抓取的硬核技术名词，消除容易被机筛解析错误的生僻符号或嵌套格式。"
        ),
    },
    "verbs": {
        "id": "verbs",
        "name": "强动词精炼升级",
        "description": "将「负责、参与、协助」等被动弱动词替换为「主导、重构、攻坚、架构」等领导力动词。",
        "prompt_instruction": (
            "【Skill: 强动词驱动】严禁出现「负责、参与、跟进」等平淡被动动词，必须使用「主导、重构、攻坚、设计、封装、调优、推进」等高冲击力词汇起笔。"
        ),
    },
}


async def diagnose_and_polish(
    resume_text: str,
    target_role: str = "",
    active_skills: list[str] | None = None,
    user_prompt: str = "",
) -> dict[str, Any]:
    """对简历进行全方位算法评分 + LLM 深度精修建议。"""
    cleaned_text = resume_text.strip()
    if not cleaned_text:
        return {"status": "error", "message": "简历内容不能为空"}

    # 1. 运行本地启发式 ATS 打分算法 (毫秒级)
    ats_result = ATSScorer.score(cleaned_text)

    # 2. 如果指定了意向岗位，运行语义相似度算法与技术栈缺口分析
    semantic_result = None
    if target_role.strip():
        semantic_result = SemanticMatcher.calculate_similarity(cleaned_text, target_role.strip())

    # 3. 组织激活的 Skills 提示词
    selected_skills = active_skills or ["star", "xyz", "ats", "verbs"]
    skill_instructions = "\n".join(
        SKILL_DEFINITIONS[s]["prompt_instruction"]
        for s in selected_skills
        if s in SKILL_DEFINITIONS
    )

    # 4. 组装 LLM 深度诊断与改写 Prompt
    system_prompt = (
        "你是一名顶级技术猎头兼大厂架构师级别的简历诊断专家。\n"
        "你的任务是为候选人提供专业、犀利且具备立竿见影效果的简历诊断与 STAR / Google X-Y-Z 改写。\n"
        "【输出原则】文字精炼高信噪比，直击要害，字数控制在 600~800 字内快速输出，杜绝冗长车轱辘话。\n"
        "请结合以下已启用的技能包规范（Skills）进行精修：\n\n"
        f"{skill_instructions}\n"
    )

    user_content = (
        f"【候选人简历内容】\n{cleaned_text[:2200]}\n\n"
        + (f"【期望目标岗位】\n{target_role}\n\n" if target_role else "")
        + (f"【修改期望】\n{user_prompt}\n\n" if user_prompt else "")
        + f"【本地 ATS 算法指标】综合分: {ats_result.overall_score}/100, 量化点: {ats_result.metrics_count} 处, 强动词: {ats_result.strong_verbs_count} 个, 弱动词: {ats_result.weak_verbs_count} 个\n\n"
        "请直接按以下清晰结构输出精修报告（Markdown 格式）：\n"
        "### 🎯 核心硬伤与关键突破点（2-3条短评，指出缺口）\n"
        "### ✨ STAR + Google X-Y-Z 对比改写示范\n"
        "**【改写前】**：<指出原句弱动词与缺乏量化之处>\n"
        "**【改写后】**：<应用 STAR 闭环与 X-Y-Z 量化，提供震撼力强的高阶 Bullet Points>\n"
        "### 💡 面试官核心关注点与应对策略（2点建议）\n"
        "### 📋 一键复制精修 Bullet Points\n"
        "> 提供 2~3 条可直接粘进简历的完美经历描述（动词加粗，数据醒目）。"
    )

    # V0.4：未配置时回落开箱默认（智谱+公共 Key），新用户开箱即用
    config = effective_config()
    if not config.is_configured():
        # 未配置 API 时给出离线专业诊断总结
        fallback_advice = (
            "### 📋 离线启发式体检报告（未绑定 API Key 时的快速算法体检）\n\n"
            f"**当前 ATS 算法得分：{ats_result.overall_score} / 100 分**\n\n"
            "#### 🌟 检测到的优势亮点：\n"
            + "\n".join(f"- {h}" for h in ats_result.highlights)
            + "\n\n#### ⚠️ 算法指出的关键短板：\n"
            + "\n".join(f"- {i}" for i in ats_result.issues)
            + "\n\n> 💡 **提示**：检测到您尚未在【设置 → AI 模型】中绑定 API Key。绑定后可体验包含 STAR 逐句对比改写与针对性量化润色在内的完整 AI 诊断服务！"
        )
        return {
            "status": "ok",
            "ats_score": ats_result.to_dict(),
            "semantic_match": semantic_result.to_dict() if semantic_result else None,
            "polish_advice": fallback_advice,
            "active_skills": selected_skills,
            "is_offline_fallback": True,
        }

    # 5. 调用大语言模型（OpenRouter / OpenAI 兼容端点）
    try:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        resp = await asyncio.to_thread(
            chat_completion_with_retry,
            messages,
            base_url=config.base_url,
            api_key=config.api_key,
            model=config.model,
            timeout=35.0,
            temperature=0.3,
        )
        content = extract_content(resp)
        return {
            "status": "ok",
            "ats_score": ats_result.to_dict(),
            "semantic_match": semantic_result.to_dict() if semantic_result else None,
            "polish_advice": content,
            "active_skills": selected_skills,
            "is_offline_fallback": False,
        }
    except LLMClientError as e:
        log.warning("简历精修调用异常: %s", e)
        # 即使云端异常或排队超时，也绝不卡死用户，无缝呈现基于本地 ATS 算法的高质量体检
        fallback_advice = (
            "### 📋 智能诊断报告（云端模型排队超时，已自动无缝切换本地启发式算法体检）\n\n"
            f"**当前 ATS 算法评分：{ats_result.overall_score} / 100 分**\n\n"
            "#### 🌟 本地算法检测到的核心优势：\n"
            + "\n".join(f"- {h}" for h in ats_result.highlights)
            + "\n\n#### ⚠️ 需重点优化的关键短板：\n"
            + "\n".join(f"- {i}" for i in ats_result.issues)
            + "\n\n#### 💡 针对当前段落的改写建议：\n"
            + f"- **动词升级**：检测到平庸弱动词，建议替换为「主导、重构、攻坚、架构、推进」等高冲击力词汇。\n"
            + f"- **X-Y-Z 量化**：建议补充量化指标（如 DAU 峰值、吞吐量提升%、延迟降低毫秒数）。\n\n"
            + f"> 💡 **网络提示**：云端免费模型接口当前响应较慢或排队（{e.message}），您可以随时点击重新发起。"
        )
        return {
            "status": "ok",
            "ats_score": ats_result.to_dict(),
            "semantic_match": semantic_result.to_dict() if semantic_result else None,
            "polish_advice": fallback_advice,
            "active_skills": selected_skills,
            "is_offline_fallback": True,
        }
