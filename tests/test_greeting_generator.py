"""AI 招呼语（F5）单测：生成 / 校验 / 降级链（mock LLM，不发真请求）。"""
from __future__ import annotations

import asyncio

from boss_zhipin.agent import greeting_generator as gg
from boss_zhipin.agent.config_io import AgentConfig
from boss_zhipin.agent.llm_client import LLMClientError
from boss_zhipin.website_oper import write_response

GOOD_GREETING = (
    "您好，我对贵司的 AI Agent 开发实习岗位非常感兴趣。"
    "我有大模型应用开发的实战经验，熟悉 Agent 工具调用与 RAG 检索增强，"
    "也独立交付过可运行的项目。期待能和您进一步沟通岗位细节，感谢您的时间。"
)


def _configured(monkeypatch) -> None:
    monkeypatch.setattr(
        gg,
        "read_config",
        lambda: AgentConfig(
            base_url="https://example.test/v1", api_key="sk-test", model="m1"
        ),
    )


def _mock_llm(monkeypatch, content: str) -> None:
    def fake_completion(messages, **kwargs):
        return {"choices": [{"message": {"role": "assistant", "content": content}}]}

    monkeypatch.setattr(gg, "chat_completion_with_retry", fake_completion)


def test_generate_greeting_ok(monkeypatch):
    _configured(monkeypatch)
    _mock_llm(monkeypatch, GOOD_GREETING)

    result = asyncio.run(gg.generate_greeting("负责 Agent 开发", "基准招呼语"))

    assert result["status"] == "ok"
    assert result["greeting"] == GOOD_GREETING


def test_generate_greeting_strips_quotes(monkeypatch):
    _configured(monkeypatch)
    _mock_llm(monkeypatch, f"“{GOOD_GREETING}”")

    result = asyncio.run(gg.generate_greeting("JD", "基准"))
    assert result["status"] == "ok"
    assert not result["greeting"].startswith("“")


def test_generate_greeting_not_configured(monkeypatch):
    monkeypatch.setattr(gg, "read_config", lambda: AgentConfig())
    result = asyncio.run(gg.generate_greeting("JD", "基准"))
    assert result["status"] == "error"
    assert result["code"] == "not_configured"


def test_generate_greeting_llm_error(monkeypatch):
    _configured(monkeypatch)

    def fake_completion(messages, **kwargs):
        raise LLMClientError(429, "rate limited")

    monkeypatch.setattr(gg, "chat_completion_with_retry", fake_completion)
    result = asyncio.run(gg.generate_greeting("JD", "基准"))
    assert result["status"] == "error"
    assert result["code"] == "llm_error"


def test_generate_greeting_rejects_short_output(monkeypatch):
    _configured(monkeypatch)
    _mock_llm(monkeypatch, "你好")  # 不过 validate_letter 最小长度

    result = asyncio.run(gg.generate_greeting("JD", "基准"))
    assert result["status"] == "error"
    assert result["code"] == "validation_failed"


# ---------- _compose_greeting 降级链（write_response 侧） ----------


def test_compose_greeting_disabled_returns_fixed(monkeypatch):
    monkeypatch.delenv("BOSS_AI_GREETING", raising=False)
    greeting, source = asyncio.run(write_response._compose_greeting("JD", "固定版"))
    assert (greeting, source) == ("固定版", "fixed")


def _fake_generate(result: dict):
    async def fake(job_description, base_greeting):
        return result

    return fake


def test_compose_greeting_ai_ok(monkeypatch):
    monkeypatch.setenv("BOSS_AI_GREETING", "1")
    monkeypatch.setattr(
        "boss_zhipin.agent.greeting_generator.generate_greeting",
        _fake_generate({"status": "ok", "greeting": "AI 版招呼语内容，长度足够过校验。"}),
    )
    greeting, source = asyncio.run(write_response._compose_greeting("JD", "固定版"))
    assert source == "ai"
    assert greeting.startswith("AI 版")


def test_compose_greeting_ai_failure_falls_back(monkeypatch):
    monkeypatch.setenv("BOSS_AI_GREETING", "1")
    monkeypatch.setattr(
        "boss_zhipin.agent.greeting_generator.generate_greeting",
        _fake_generate({"status": "error", "message": "超时"}),
    )
    greeting, source = asyncio.run(write_response._compose_greeting("JD", "固定版"))
    assert (greeting, source) == ("固定版", "fixed")


def test_compose_greeting_ai_crash_falls_back(monkeypatch):
    """生成器抛异常也降级，review 流程永不因 AI 挂掉而中断。"""

    async def crash(job_description, base_greeting):
        raise RuntimeError("boom")

    monkeypatch.setenv("BOSS_AI_GREETING", "1")
    monkeypatch.setattr(
        "boss_zhipin.agent.greeting_generator.generate_greeting", crash
    )
    greeting, source = asyncio.run(write_response._compose_greeting("JD", "固定版"))
    assert (greeting, source) == ("固定版", "fixed")
