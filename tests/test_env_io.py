"""旧 env 表单 helper 已删除。"""

from pathlib import Path


def test_legacy_env_io_module_is_removed():
    assert not (Path(__file__).parent.parent / "src" / "boss_zhipin" / "gui" / "env_io.py").exists()
