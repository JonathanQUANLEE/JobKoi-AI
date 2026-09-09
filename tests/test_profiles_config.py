from __future__ import annotations

import pytest

from boss_zhipin.config.profiles import ProfileCycleError, load_profile, merge_profile


def test_merge_profile_recurses_dicts_and_replaces_lists():
    parent = {
        "send": {"mode": "auto", "delay_min": 10, "delay_max": 60},
        "filters": {
            "title": {
                "any": {"enabled": True, "keywords": ["后端开发", "ai"]},
                "exclude": {"enabled": True, "keywords": ["销售"]},
            }
        },
    }
    child = {
        "send": {"delay_min": 30},
        "filters": {
            "title": {
                "any": {"keywords": ["Go"]},
            }
        },
    }

    merged = merge_profile(parent, child)

    assert merged["send"] == {"mode": "auto", "delay_min": 30, "delay_max": 60}
    assert merged["filters"]["title"]["any"]["enabled"] is True
    assert merged["filters"]["title"]["any"]["keywords"] == ["Go"]
    assert merged["filters"]["title"]["exclude"]["keywords"] == ["销售"]


def test_load_profile_resolves_extends_relative_to_profiles_dir(tmp_path):
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()
    (profiles_dir / "base.yml").write_text(
        """
send:
  mode: auto
  delay_min: 10
  delay_max: 60
filters:
  title:
    any:
      enabled: true
      keywords: [后端开发, ai]
""",
        encoding="utf-8",
    )
    (profiles_dir / "backend.yml").write_text(
        """
extends: base.yml
send:
  delay_min: 20
filters:
  title:
    any:
      keywords: [Go]
""",
        encoding="utf-8",
    )

    profile = load_profile("backend", profiles_dir=profiles_dir)

    assert profile.name == "backend"
    assert profile.path == profiles_dir / "backend.yml"
    assert profile.data["send"] == {"mode": "auto", "delay_min": 20, "delay_max": 60}
    assert profile.data["filters"]["title"]["any"]["enabled"] is True
    assert profile.data["filters"]["title"]["any"]["keywords"] == ["Go"]


def test_load_profile_accepts_yml_filename(tmp_path):
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()
    (profiles_dir / "ai.yml").write_text("send:\n  mode: auto\n", encoding="utf-8")

    profile = load_profile("ai.yml", profiles_dir=profiles_dir)

    assert profile.name == "ai"
    assert profile.data["send"]["mode"] == "auto"


def test_load_profile_rejects_cycle(tmp_path):
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()
    (profiles_dir / "a.yml").write_text("extends: b.yml\n", encoding="utf-8")
    (profiles_dir / "b.yml").write_text("extends: a.yml\n", encoding="utf-8")

    with pytest.raises(ProfileCycleError, match="循环继承"):
        load_profile("a", profiles_dir=profiles_dir)
