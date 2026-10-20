"""LLM 预设（presets.py）单测：内置公共 Key 与品牌文案契约。

2026-10-20 OpenRouter 预设升级：内置公共体验 Key（base64 形态，防
GitHub Secret Scanning 撤销）+ 品牌文案去「免费档」化（用户拍板：
不向用户强调免费，避免模型从免费转收费时的预期落差）。
"""
from __future__ import annotations

from boss_zhipin.agent import presets


def test_all_five_presets_present_with_required_fields():
    ids = [p["id"] for p in presets.LLM_PRESETS]
    assert ids == ["zhipu", "deepseek", "siliconflow", "openrouter", "custom"]
    for p in presets.LLM_PRESETS:
        assert p["label"].strip()
        assert "base_url" in p and "default_model" in p and "default_api_key" in p
        assert p["signup_hint"].strip()


def test_openrouter_preset_has_builtin_public_key():
    """OpenRouter 预置内置公共 Key（开箱即用），sk-or-v1- 前缀形态正确。"""
    or_preset = next(p for p in presets.LLM_PRESETS if p["id"] == "openrouter")
    key = or_preset["default_api_key"]
    assert key.startswith("sk-or-v1-")
    assert len(key) >= 60


def test_openrouter_public_key_env_override(monkeypatch):
    """环境变量 OPENROUTER_PUBLIC_API_KEY 可覆盖内置值（被滥用/失效时替换）。"""
    monkeypatch.setenv("OPENROUTER_PUBLIC_API_KEY", "sk-or-v1-test-override")
    assert presets.get_openrouter_public_api_key() == "sk-or-v1-test-override"
    monkeypatch.delenv("OPENROUTER_PUBLIC_API_KEY")
    assert presets.get_openrouter_public_api_key().startswith("sk-or-v1-")


def test_openrouter_label_no_longer_says_free_tier():
    """品牌文案契约：不再以「免费档」命名（用户 2026-10-20 拍板）。"""
    or_preset = next(p for p in presets.LLM_PRESETS if p["id"] == "openrouter")
    assert "免费档" not in or_preset["label"]
    assert or_preset["label"] == "OpenRouter 国际模型"


def test_zhipu_public_key_still_intact():
    """智谱内置 Key 契约不回归（2026-10-16 事故教训：不得退化为空串）。"""
    assert presets.ZHIPU_PUBLIC_API_KEY
    assert "." in presets.ZHIPU_PUBLIC_API_KEY
    zhipu_preset = next(p for p in presets.LLM_PRESETS if p["id"] == "zhipu")
    assert zhipu_preset["default_api_key"] == presets.ZHIPU_PUBLIC_API_KEY
