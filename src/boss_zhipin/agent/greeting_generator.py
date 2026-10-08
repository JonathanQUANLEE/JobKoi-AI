"""按 JD 生成招呼语（F5，opt-in 默认关）。

放在 agent 包：纯 LLM 调用 + 校验，无任何投递动作（隔离红线不受影响，
``boss_zhipin.audit`` 不在 test_agent_isolation 的禁入清单里）。

安全设计（已拍板：固定为主 + AI 可选）：
- 只有 review 模式（逐条人工确认）才用 AI 招呼语；auto 模式保持固定招呼语；
- 输出必须过 ``audit.validate_letter``（长度/中文/黑名单）才算成功；
- 任何失败（未配置/超时/校验不过）→ 调用方降级固定招呼语，review 流程
  永不因 AI 挂掉而中断。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from boss_zhipin.agent.config_io import read_config
from boss_zhipin.agent.llm_client import (
    LLMClientError,
    chat_completion_with_retry,
    extract_content,
)
from boss_zhipin.audit import validate_letter

log = logging.getLogger(__name__)

GREETING_SYSTEM_PROMPT = """你帮求职者写发给招聘者的中文招呼语（BOSS 直聘开场白）。

要求：
- 50~250 字，自然、真诚、不卑不亢；
- 开头点明应聘的岗位方向，中间结合职位描述里 1~2 个关键要求说明自己的匹配点；
- 只使用「参考招呼语」里已有的个人信息，绝不编造经历、数字、技能；
- 结尾礼貌表达希望进一步沟通；
- 直接输出招呼语正文，不要任何解释、引号、markdown。

职位描述：
{job_description}

参考招呼语（个人信息与语气基准，不要照抄）：
{base_greeting}"""


async def generate_greeting(job_description: str, base_greeting: str) -> dict[str, Any]:
    """按 JD 生成一条招呼语。

    Returns::

        {"status": "ok", "greeting": "…"}          # 已过 validate_letter
        {"status": "error", "code": str, "message": str}
    """
    config = read_config()
    if not config.is_configured():
        return _error("not_configured", "尚未配置模型（模型设置里填写并保存）")

    prompt = GREETING_SYSTEM_PROMPT.format(
        job_description=(job_description or "").strip()[:2000],
        base_greeting=(base_greeting or "").strip()[:800],
    )
    messages = [{"role": "user", "content": prompt}]
    try:
        data = await asyncio.to_thread(
            chat_completion_with_retry,
            messages,
            base_url=config.base_url,
            api_key=config.api_key,
            model=config.model,
        )
        content = extract_content(data)
    except LLMClientError as e:
        log.warning("AI 招呼语生成失败 [%s]: %s", e.code, e.message[:200])
        return _error("llm_error", f"模型调用失败 [{e.code}]：{e.message[:200]}")

    greeting = content.strip().strip('"').strip("“”").strip()
    validation = validate_letter(greeting)
    if not validation.ok:
        log.warning("AI 招呼语未通过校验: %s", validation.reasons)
        return _error(
            "validation_failed",
            "生成内容不合格（" + "、".join(validation.reasons) + "）",
        )
    return {"status": "ok", "greeting": greeting}


def _error(code: str, message: str) -> dict[str, Any]:
    return {"status": "error", "code": code, "message": message}
