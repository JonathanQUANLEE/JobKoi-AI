"""resume_io 单测：列表 / 设默认 / 路径穿越防护 / 边界。"""
from __future__ import annotations

import pytest

from boss_zhipin.gui.resume_io import (
    get_default_resume,
    list_resumes,
    set_default_resume,
)


def _touch(path, content: bytes = b"x"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def test_list_resumes_empty_dir(tmp_path):
    assert list_resumes(tmp_path) == []


def test_list_resumes_filters_extensions_and_marks_default(tmp_path):
    _touch(tmp_path / "简历A.pdf")
    _touch(tmp_path / "简历B.docx")
    _touch(tmp_path / "notes.txt")  # 非白名单，不列
    _touch(tmp_path / "photo.png")
    set_default_resume("简历B.docx", tmp_path)

    items = list_resumes(tmp_path)
    names = {item["name"] for item in items}
    assert names == {"简历A.pdf", "简历B.docx", "photo.png"}
    by_name = {item["name"]: item for item in items}
    assert by_name["简历B.docx"]["is_default"] is True
    assert by_name["简历A.pdf"]["is_default"] is False
    assert by_name["简历A.pdf"]["size"] == 1


def test_set_default_resume_roundtrip(tmp_path):
    _touch(tmp_path / "简历A.pdf")
    result = set_default_resume("简历A.pdf", tmp_path)
    assert result["status"] == "saved"
    default = get_default_resume(tmp_path)
    assert default is not None
    assert default["name"] == "简历A.pdf"
    assert default["is_default"] is True


def test_set_default_resume_rejects_path_traversal(tmp_path):
    _touch(tmp_path / "ok.pdf")
    with pytest.raises(ValueError):
        set_default_resume("../evil.pdf", tmp_path)
    with pytest.raises(ValueError):
        set_default_resume("a/b.pdf", tmp_path)


def test_set_default_resume_rejects_missing_and_bad_ext(tmp_path):
    with pytest.raises(ValueError):
        set_default_resume("不存在.pdf", tmp_path)
    _touch(tmp_path / "virus.exe")
    with pytest.raises(ValueError):
        set_default_resume("virus.exe", tmp_path)
    with pytest.raises(ValueError):
        set_default_resume("   ", tmp_path)


def test_get_default_resume_returns_none_when_marker_stale(tmp_path):
    _touch(tmp_path / "简历A.pdf")
    set_default_resume("简历A.pdf", tmp_path)
    (tmp_path / "简历A.pdf").unlink()  # 文件被删，标记失效
    assert get_default_resume(tmp_path) is None
