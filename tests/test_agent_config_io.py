"""config_io 单测：脱敏 / 掩码保留旧 key / 坏文件容错。"""
from __future__ import annotations

import json

from boss_zhipin.agent.config_io import (
    AgentConfig,
    is_masked,
    mask_key,
    merge_saved_key,
    read_config,
    write_config,
)


def test_read_missing_file_returns_default(tmp_path):
    cfg = read_config(tmp_path / "nope.json")
    assert cfg == AgentConfig()
    assert not cfg.is_configured()


def test_write_then_read_roundtrip(tmp_path):
    path = tmp_path / "agent_config.json"
    write_config(
        AgentConfig(
            base_url="https://openrouter.ai/api/v1",
            api_key="sk-or-v1-abcdef123456",
            model="qwen/qwen3.8-27b:free",
        ),
        path,
    )
    cfg = read_config(path)
    assert cfg.base_url == "https://openrouter.ai/api/v1"
    assert cfg.api_key == "sk-or-v1-abcdef123456"
    assert cfg.model == "qwen/qwen3.8-27b:free"
    assert cfg.is_configured()


def test_read_corrupt_json_returns_default(tmp_path):
    path = tmp_path / "agent_config.json"
    path.write_text("{ not json", encoding="utf-8")
    assert read_config(path) == AgentConfig()


def test_read_non_mapping_returns_default(tmp_path):
    path = tmp_path / "agent_config.json"
    path.write_text(json.dumps(["a", "b"]), encoding="utf-8")
    assert read_config(path) == AgentConfig()


def test_partial_config_is_not_configured(tmp_path):
    path = tmp_path / "agent_config.json"
    write_config(AgentConfig(base_url="https://x.test/v1", api_key="k", model=""), path)
    assert not read_config(path).is_configured()


def test_mask_key_formats():
    assert mask_key("") == ""
    assert mask_key("short") == "****"
    assert mask_key("sk-or-v1-abcdef123456") == "sk-o****3456"


def test_is_masked_and_merge_saved_key():
    assert is_masked("sk-o****3456") is True
    assert is_masked("sk-or-v1-real-key") is False

    # 掩码 / 空串 = 保留旧值
    assert merge_saved_key("sk-o****3456", "sk-or-v1-old") == "sk-or-v1-old"
    assert merge_saved_key("", "sk-or-v1-old") == "sk-or-v1-old"
    assert merge_saved_key("   ", "sk-or-v1-old") == "sk-or-v1-old"
    # 新值 = 采用新值
    assert merge_saved_key("sk-or-v1-new", "sk-or-v1-old") == "sk-or-v1-new"
