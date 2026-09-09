from __future__ import annotations

import pytest

from boss_zhipin.config.profiles import load_profile
from boss_zhipin.gui.profile_io import (
    get_greeting,
    get_profile,
    list_profiles,
    save_greeting,
    save_profile,
)


def test_list_profiles_returns_visible_yaml_files_sorted(tmp_path):
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()
    (profiles_dir / "backend.yml").write_text("send:\n  mode: auto\n", encoding="utf-8")
    (profiles_dir / "ai.yaml").write_text("send:\n  mode: scan\n", encoding="utf-8")
    (profiles_dir / ".hidden.yml").write_text("send:\n  mode: auto\n", encoding="utf-8")
    (profiles_dir / "note.txt").write_text("ignore", encoding="utf-8")

    assert list_profiles(profiles_dir=profiles_dir) == [
        {"name": "ai", "path": str((profiles_dir / "ai.yaml").resolve())},
        {"name": "backend", "path": str((profiles_dir / "backend.yml").resolve())},
    ]


def test_save_profile_writes_yaml_that_loader_can_read(tmp_path):
    profiles_dir = tmp_path / "profiles"
    profile_data = {
        "search": {"query": "后端开发实习"},
        "filters": {
            "title": {
                "required": {
                    "enabled": True,
                    "scope": "title",
                    "match": "contains",
                    "case_sensitive": False,
                    "keywords": ["实习"],
                }
            }
        },
        "send": {"mode": "auto", "greeting_file": "./greetings/default.txt"},
    }

    result = save_profile("gui-default", profile_data, profiles_dir=profiles_dir)

    assert result["name"] == "gui-default"
    assert (profiles_dir / "gui-default.yml").is_file()
    loaded = load_profile("gui-default", profiles_dir=profiles_dir)
    assert loaded.data == profile_data
    assert get_profile("gui-default", profiles_dir=profiles_dir)["data"] == profile_data


@pytest.mark.parametrize("name", ["../evil", "evil/profile", "bad.yml", "", ".hidden"])
def test_save_profile_rejects_unsafe_names(tmp_path, name):
    with pytest.raises(ValueError, match="profile 名称"):
        save_profile(
            name, {"send": {"mode": "scan"}}, profiles_dir=tmp_path / "profiles"
        )


def test_greeting_round_trip(tmp_path):
    greeting_path = tmp_path / "greetings" / "default.txt"
    text = "您好，我想投递后端开发实习岗位。我熟悉 Go、C++ 和 Vue，能参与后端接口、缓存和工程化验证。"

    save_greeting(text, path=greeting_path)

    assert get_greeting(path=greeting_path) == {
        "path": str(greeting_path.resolve()),
        "text": text,
    }


def test_save_greeting_rejects_empty_text(tmp_path):
    with pytest.raises(ValueError, match="招呼语不能为空"):
        save_greeting("  \n", path=tmp_path / "greetings" / "default.txt")
