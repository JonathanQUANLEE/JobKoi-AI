"""profile_generator 单测：净化 / 解析 / generate 全链路（mock LLM，不发真请求）。"""
from __future__ import annotations

import asyncio
import json

import pytest

from boss_zhipin.agent import profile_generator as pg
from boss_zhipin.agent.config_io import AgentConfig
from boss_zhipin.agent.llm_client import LLMClientError
from boss_zhipin.agent.profile_generator import (
    ProfileParseError,
    ProfileSanitizeError,
    parse_llm_json,
    sanitize_profile,
)


def _valid_profile() -> dict:
    return {
        "search": {"query": "AI Agent实习", "start_url": ""},
        "page_filters": {
            "strict": False,
            "city": {"enabled": True, "values": ["深圳"]},
            "education": {"enabled": False, "values": []},
            "boss_active": {"enabled": False, "values": []},
        },
        "filters": {
            "title": {
                "required": {"enabled": False, "keywords": []},
                "any": {"enabled": True, "keywords": ["AI Agent", "大模型"]},
                "exclude": {"enabled": True, "keywords": ["销售", "客服"]},
            }
        },
        "send": {
            "mode": "scan",
            "greeting_file": "./greetings/default.txt",
            "delay_min": 10,
            "delay_max": 60,
            "max_sent": 30,
            "daily_sent_limit": 50,
            "stop_on_captcha": True,
        },
    }


# ---------- sanitize_profile ----------


def test_sanitize_happy_path_keeps_snake_case_and_forces_paths():
    out = sanitize_profile(_valid_profile())
    assert out["search"]["query"] == "AI Agent实习"
    assert out["page_filters"]["city"]["values"] == ["深圳"]
    assert out["filters"]["title"]["any"]["keywords"] == ["AI Agent", "大模型"]
    assert out["send"]["mode"] == "scan"
    # 路径类字段强制默认（防注入）
    assert out["send"]["greeting_file"] == "./greetings/default.txt"
    assert out["state"] == pg.DEFAULT_STATE


def test_sanitize_path_injection_is_neutralized():
    raw = _valid_profile()
    raw["send"]["greeting_file"] = "../../evil.txt"
    raw["state"] = {"sent_log_file": "C:/Windows/evil.jsonl"}
    out = sanitize_profile(raw)
    assert out["send"]["greeting_file"] == "./greetings/default.txt"
    assert out["state"] == pg.DEFAULT_STATE


def test_sanitize_clamps_numbers():
    raw = _valid_profile()
    raw["send"]["max_sent"] = 10000
    raw["send"]["delay_min"] = 5000
    raw["send"]["delay_max"] = 9999
    out = sanitize_profile(raw)
    assert out["send"]["max_sent"] == 150
    assert out["send"]["delay_min"] == 600
    assert out["send"]["delay_max"] == 1800


def test_sanitize_swaps_inverted_delay_range():
    raw = _valid_profile()
    raw["send"]["delay_min"] = 100
    raw["send"]["delay_max"] = 5
    out = sanitize_profile(raw)
    assert out["send"]["delay_min"] == 5
    assert out["send"]["delay_max"] == 100


def test_sanitize_rejects_bad_mode_enum():
    raw = _valid_profile()
    raw["send"]["mode"] = "send_everything"
    with pytest.raises(ProfileSanitizeError) as exc_info:
        sanitize_profile(raw)
    assert "mode" in str(exc_info.value)


def test_sanitize_rejects_non_numeric_max_sent():
    raw = _valid_profile()
    raw["send"]["max_sent"] = "很多"
    with pytest.raises(ProfileSanitizeError):
        sanitize_profile(raw)


def test_sanitize_drops_non_zhipin_start_url():
    raw = _valid_profile()
    raw["search"]["start_url"] = "https://evil.example.com/web/geek/jobs"
    out = sanitize_profile(raw)
    assert out["search"]["start_url"] == ""

    raw["search"]["start_url"] = "https://www.zhipin.com/web/geek/jobs?query=AI"
    assert sanitize_profile(raw)["search"]["start_url"].startswith(
        "https://www.zhipin.com/"
    )


def test_sanitize_rejects_bad_regex_keyword():
    raw = _valid_profile()
    raw["filters"]["title"]["any"]["match"] = "regex"
    raw["filters"]["title"]["any"]["keywords"] = ["(unclosed"]
    with pytest.raises(ProfileSanitizeError) as exc_info:
        sanitize_profile(raw)
    assert "正则" in str(exc_info.value)


def test_sanitize_cleans_keyword_lists():
    raw = _valid_profile()
    raw["filters"]["title"]["any"]["keywords"] = [
        "AI",
        " AI ",
        "",  # 空
        "x" * 100,  # 超长
        "AI",  # 重复
        *[f"kw{i}" for i in range(40)],  # 超过 30 条
    ]
    out = sanitize_profile(raw)
    keywords = out["filters"]["title"]["any"]["keywords"]
    assert "AI" in keywords
    assert "" not in keywords
    assert "x" * 100 not in keywords
    assert len(keywords) <= pg.MAX_KEYWORDS


def test_sanitize_ignores_unknown_keys():
    raw = _valid_profile()
    raw["hack"] = {"system": "rm -rf /"}
    raw["send"]["extra_evil"] = 1
    out = sanitize_profile(raw)
    assert "hack" not in out
    assert "extra_evil" not in out["send"]


def test_sanitize_fills_defaults_for_partial_profile():
    out = sanitize_profile({"send": {"mode": "scan"}})
    assert out["filters"]["title"]["required"]["enabled"] is False
    assert out["send"]["delay_min"] == 10
    assert out["send"]["stop_on_captcha"] is True
    assert out["state"] == pg.DEFAULT_STATE


# ---------- parse_llm_json ----------


def test_parse_llm_json_direct():
    data = parse_llm_json('{"reply": "ok", "profile": null}')
    assert data["reply"] == "ok"


def test_parse_llm_json_strips_code_fence():
    content = "```json\n{\"reply\": \"ok\", \"profile\": null}\n```"
    assert parse_llm_json(content)["reply"] == "ok"


def test_parse_llm_json_strips_surrounding_prose():
    content = "好的，这是我的建议：\n{\"reply\": \"ok\"}\n希望对你有帮助！"
    assert parse_llm_json(content)["reply"] == "ok"


def test_parse_llm_json_garbage_raises():
    with pytest.raises(ProfileParseError):
        parse_llm_json("模型完全跑偏了，没有 JSON")


# ---------- generate（mock LLM） ----------


def _configured_agent(monkeypatch) -> None:
    monkeypatch.setattr(
        pg,
        "read_config",
        lambda: AgentConfig(
            base_url="https://example.test/v1",
            api_key="sk-test",
            model="m1",
        ),
    )


def _mock_llm(monkeypatch, content: str) -> dict:
    calls = {"messages": None}

    def fake_completion(messages, **kwargs):
        calls["messages"] = messages
        return {"choices": [{"message": {"role": "assistant", "content": content}}]}

    monkeypatch.setattr(pg, "chat_completion_with_retry", fake_completion)
    return calls


def test_generate_returns_sanitized_profile(monkeypatch):
    _configured_agent(monkeypatch)
    llm_payload = json.dumps(
        {"reply": "已生成深圳 AI Agent 配置", "profile": _valid_profile()},
        ensure_ascii=False,
    )
    calls = _mock_llm(monkeypatch, llm_payload)

    result = asyncio.run(
        pg.generate(
            "帮我投深圳的AI Agent实习，最多30个",
            [],
            {"search": {"query": "后端开发实习"}, "send": {"mode": "scan"}},
        )
    )

    assert result["status"] == "ok"
    assert result["reply"] == "已生成深圳 AI Agent 配置"
    assert result["profile"]["page_filters"]["city"]["values"] == ["深圳"]
    assert result["profile"]["state"] == pg.DEFAULT_STATE
    # 消息结构：system + user（带当前配置上下文）
    assert calls["messages"][0]["role"] == "system"
    assert calls["messages"][-1]["role"] == "user"
    assert "当前投递配置" in calls["messages"][-1]["content"]


def test_generate_chat_only_returns_null_profile(monkeypatch):
    _configured_agent(monkeypatch)
    _mock_llm(monkeypatch, json.dumps({"reply": "别焦虑，慢慢来", "profile": None}, ensure_ascii=False))

    result = asyncio.run(pg.generate("我今天好焦虑", [], None))
    assert result == {
        "status": "ok",
        "reply": "别焦虑，慢慢来",
        "profile": None,
        "action": None,
    }


def test_generate_not_configured(monkeypatch):
    monkeypatch.setattr(pg, "read_config", lambda: AgentConfig())
    result = asyncio.run(pg.generate("hi", [], None))
    assert result["status"] == "error"
    assert result["code"] == "not_configured"
    assert "模型设置" in result["message"]


def test_generate_llm_error(monkeypatch):
    _configured_agent(monkeypatch)

    def fake_completion(messages, **kwargs):
        raise LLMClientError(401, "bad key")

    monkeypatch.setattr(pg, "chat_completion_with_retry", fake_completion)
    result = asyncio.run(pg.generate("hi", [], None))
    assert result["status"] == "error"
    assert result["code"] == "llm_error"
    assert "401" in result["message"]


def test_generate_bad_model_output(monkeypatch):
    _configured_agent(monkeypatch)
    _mock_llm(monkeypatch, "这不是 JSON")
    result = asyncio.run(pg.generate("hi", [], None))
    assert result["status"] == "error"
    assert result["code"] == "bad_model_output"


def test_generate_sanitize_failure(monkeypatch):
    _configured_agent(monkeypatch)
    bad_profile = _valid_profile()
    bad_profile["send"]["mode"] = "yolo"
    _mock_llm(
        monkeypatch,
        json.dumps({"reply": "搞定", "profile": bad_profile}, ensure_ascii=False),
    )
    result = asyncio.run(pg.generate("投简历", [], None))
    assert result["status"] == "error"
    assert result["code"] == "sanitize_failed"


def test_generate_passes_history_and_caps_it(monkeypatch):
    _configured_agent(monkeypatch)
    llm_payload = json.dumps({"reply": "嗯", "profile": None}, ensure_ascii=False)
    calls = _mock_llm(monkeypatch, llm_payload)
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(30)]

    asyncio.run(pg.generate("继续", history, None))

    # system + 最近 10 条历史 + 本轮 user = 12
    assert len(calls["messages"]) == 1 + 10 + 1
    assert calls["messages"][1]["content"] == "m20"


# ---------- 工具协议（F4：action）+ 新开关字段 ----------


def test_generate_returns_valid_action(monkeypatch):
    _configured_agent(monkeypatch)
    _mock_llm(
        monkeypatch,
        json.dumps(
            {"reply": "我查一下统计", "profile": None, "action": {"type": "get_stats"}},
            ensure_ascii=False,
        ),
    )
    result = asyncio.run(pg.generate("今天投了多少", [], None))
    assert result["status"] == "ok"
    assert result["action"] == {"type": "get_stats", "params": {"n": 5}}


def test_generate_clamps_preview_jobs_n(monkeypatch):
    _configured_agent(monkeypatch)
    _mock_llm(
        monkeypatch,
        json.dumps(
            {
                "reply": "给你预览",
                "profile": None,
                "action": {"type": "preview_jobs", "params": {"n": 99}},
            },
            ensure_ascii=False,
        ),
    )
    result = asyncio.run(pg.generate("看看岗位", [], None))
    assert result["action"]["type"] == "preview_jobs"
    assert result["action"]["params"]["n"] == 10


def test_generate_invalid_action_dropped_reply_kept(monkeypatch):
    """工具幻觉：非法 type → action 丢弃，对话不炸。"""
    _configured_agent(monkeypatch)
    _mock_llm(
        monkeypatch,
        json.dumps(
            {
                "reply": "好的",
                "profile": None,
                "action": {"type": "delete_everything", "params": {}},
            },
            ensure_ascii=False,
        ),
    )
    result = asyncio.run(pg.generate("帮我把东西删了", [], None))
    assert result["status"] == "ok"
    assert result["reply"] == "好的"
    assert result["action"] is None


def test_generate_action_not_dict_dropped(monkeypatch):
    _configured_agent(monkeypatch)
    _mock_llm(
        monkeypatch,
        json.dumps({"reply": "嗯", "profile": None, "action": "get_stats"}, ensure_ascii=False),
    )
    result = asyncio.run(pg.generate("统计", [], None))
    assert result["action"] is None


def test_sanitize_new_send_switches_default_off():
    out = sanitize_profile({"send": {"mode": "scan"}})
    assert out["send"]["send_resume_after_greeting"] is False
    assert out["send"]["auto_send_resume_on_reply"] is False
    assert out["send"]["ai_greeting"] is False

    out = sanitize_profile(
        {"send": {"mode": "scan", "send_resume_after_greeting": True, "ai_greeting": True}}
    )
    assert out["send"]["send_resume_after_greeting"] is True
    assert out["send"]["ai_greeting"] is True
    assert out["send"]["auto_send_resume_on_reply"] is False
