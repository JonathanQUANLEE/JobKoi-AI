from __future__ import annotations

from pathlib import Path

from boss_zhipin import cli
from boss_zhipin.config.profiles import load_profile


ROOT = Path(__file__).resolve().parents[1]


def test_backend_intern_example_profile_loads_and_points_to_greeting(monkeypatch):
    profile = load_profile("backend-intern", profiles_dir=ROOT / "profiles")

    assert profile.data["send"]["mode"] == "auto"
    assert profile.data["send"]["greeting_file"] == "./greetings/default.txt"
    assert profile.data["filters"]["title"]["required"]["enabled"] is False
    assert profile.data["filters"]["title"]["required"]["keywords"] == []
    assert profile.data["filters"]["title"]["any"]["keywords"] == ["后端开发"]

    cli.apply_profile_to_env(profile.data, base_dir=ROOT)

    assert cli.auto_send_fixed_greeting_enabled() is True
    assert "BOSS_FIXED_GREETING" in cli.os.environ


def test_ai_intern_profile_can_replace_backend_keywords(tmp_path):
    (tmp_path / "base.yml").write_text(
        """
filters:
  title:
    required:
      keywords: [实习]
    any:
      keywords: [后端开发]
""",
        encoding="utf-8",
    )
    (tmp_path / "ai-intern.yml").write_text(
        """
extends: base.yml
filters:
  title:
    any:
      match: regex
      keywords: [ai, AI, 大模型, LLM, RAG]
""",
        encoding="utf-8",
    )

    profile = load_profile("ai-intern", profiles_dir=tmp_path)

    assert profile.data["filters"]["title"]["required"]["keywords"] == ["实习"]
    assert profile.data["filters"]["title"]["any"]["match"] == "regex"
    assert profile.data["filters"]["title"]["any"]["keywords"] == ["ai", "AI", "大模型", "LLM", "RAG"]


def test_city_example_profiles_load_with_local_location_fallback():
    guangzhou = load_profile("guangzhou-backend", profiles_dir=ROOT / "profiles")
    shenzhen = load_profile("shenzhen-ai", profiles_dir=ROOT / "profiles")

    assert guangzhou.data["page_filters"]["city"]["values"] == ["广州"]
    assert guangzhou.data["filters"]["location"]["any"]["keywords"] == ["广州"]
    assert shenzhen.data["page_filters"]["city"]["values"] == ["深圳"]
    assert shenzhen.data["filters"]["location"]["any"]["keywords"] == ["深圳"]
