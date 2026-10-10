"""智能助手（agent 里程碑 1）冒烟脚本。

两种用法：

1. 结构冒烟（不需要 API key）——验证 IPC 命令层行为：

    uv run python scripts/agent_smoke.py

2. 真模型联调（先在 GUI「模型设置」里保存 OpenRouter key，或直接编辑
   agent_config.json）：

    uv run python scripts/agent_smoke.py "帮我投深圳的 AI Agent 实习，最多 30 个"
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from boss_zhipin.tauri import (  # noqa: E402
    _AgentChatBody,
    _SaveLLMConfigBody,
    agent_chat,
    get_llm_config,
    save_llm_config,
)


def structural_smoke() -> int:
    """不带 key 的行为验证：错误走返回值、配置脱敏、空消息兜底。

    若用户已在 GUI 配好真实模型（agent_config.json 存在），先把它备份挪走、
    跑完再原样恢复——结构冒烟永远走"未配置"路径，既不发真请求、也绝不
    覆盖用户真实 api_key。
    """
    print("== 结构冒烟（无需 API key）==")

    config_path = Path("agent_config.json")
    backup_path = Path("agent_config.json.smoke-backup")
    had_config = config_path.exists()
    if had_config:
        config_path.rename(backup_path)
    try:
        return _structural_smoke_steps()
    finally:
        # 清掉冒烟过程写的临时配置，再恢复用户的真实配置（含 api_key）。
        if config_path.exists():
            config_path.unlink()
        if backup_path.exists():
            backup_path.rename(config_path)


def _structural_smoke_steps() -> int:
    result = asyncio.run(agent_chat(_AgentChatBody(message="帮我投深圳的AI Agent实习")))
    print(f"1) 未配置模型 -> status={result['status']} code={result['code']}")
    assert result["status"] == "error" and result["code"] == "not_configured"

    cfg = asyncio.run(get_llm_config())
    print(
        f"2) get_llm_config -> configured={cfg['configured']} "
        f"presets={len(cfg['presets'])} api_key={cfg['api_key']!r}"
    )
    assert not cfg["configured"] or "****" in cfg["api_key"] or cfg["api_key"] == ""

    try:
        asyncio.run(agent_chat(_AgentChatBody(message="   ")))
    except ValueError as e:
        print(f"3) 空消息 -> ValueError 兜底 OK: {e}")
    else:
        raise AssertionError("空消息应当抛 ValueError")

    saved = asyncio.run(
        save_llm_config(
            _SaveLLMConfigBody(
                base_url="https://openrouter.ai/api/v1",
                api_key="sk-o****abcd",  # 掩码：应保留旧值（这里旧值为空）
                model="qwen/qwen3.8-27b:free",
            )
        )
    )
    print(f"4) 掩码保存 -> api_key={saved['api_key']!r} configured={saved['configured']}")
    assert saved["configured"] is False  # key 是掩码，没存进真值

    print("结构冒烟全部通过 ✅")
    return 0


async def real_llm_smoke(message: str) -> int:
    """带真模型的端到端：generate 全链路（含净化）。"""
    from boss_zhipin.agent.profile_generator import generate

    print(f"== 真模型联调：{message} ==")
    result = await generate(message, history=[], current_form=None)
    print(f"status={result['status']} code={result.get('code', '-')}")
    if result["status"] != "ok":
        print(f"message: {result.get('message', '')}")
        return 1
    print(f"reply: {result['reply']}")
    profile = result.get("profile")
    if profile is None:
        print("profile: null（模型判断这只是闲聊）")
        return 0
    send = profile.get("send") or {}
    city_values = ((profile.get("page_filters") or {}).get("city") or {}).get("values")
    any_keywords = ((profile.get("filters") or {}).get("title") or {}).get("any") or {}
    print(f"profile: mode={send.get('mode')} city={city_values} "
          f"max_sent={send.get('max_sent')} keywords={any_keywords.get('keywords')}")
    print(f"state 强制默认: {profile.get('state')}")
    return 0


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if args:
        return asyncio.run(real_llm_smoke(" ".join(args)))
    return structural_smoke()


if __name__ == "__main__":
    raise SystemExit(main())
