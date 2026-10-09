"""简历文件的本地管理（``resume/`` 目录）。

用户把简历（PDF / Word / 图片）放进仓库根的 ``resume/`` 目录，本模块负责
列出文件和维护「默认简历」标记（存 ``resume/default.txt``，纯文本一行文件名）。

设计要点：
- 只认白名单扩展名，不递归子目录——简历目录是用户手动放文件的扁平目录；
- ``set_default_resume`` 校验文件名是**纯文件名**（拒绝 ``../`` 路径穿越）；
- 目录里个人简历已被 ``.gitignore`` 覆盖（/resume/*.pdf / *.docx / *.png），
  ``default.txt`` 一行文件名也算个人信息，一并 ignore（见 .gitignore）。
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)

# repo root（resume_io.py → gui → boss_zhipin → src → repo）
ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_RESUME_DIR = ROOT / "resume"

RESUME_EXTENSIONS = frozenset({".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp"})
DEFAULT_MARKER_FILENAME = "default.txt"


def list_resumes(resume_dir: Path | None = None) -> list[dict]:
    """列出简历文件（按修改时间倒序）。目录不存在返回空列表。"""
    base = _ensure_dir(resume_dir)
    if not base.exists():
        return []
    items: list[dict] = []
    default_name = get_default_resume_name(base)
    for path in base.iterdir():
        if not path.is_file() or path.suffix.lower() not in RESUME_EXTENSIONS:
            continue
        stat = path.stat()
        items.append(
            {
                "name": path.name,
                "size": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).strftime(
                    "%Y-%m-%d %H:%M"
                ),
                "is_default": path.name == default_name,
            }
        )
    items.sort(key=lambda item: item["mtime"], reverse=True)
    return items


def set_default_resume(name: str, resume_dir: Path | None = None) -> dict:
    """把某个简历设为默认。校验纯文件名 + 文件存在，然后写标记文件。"""
    base = _ensure_dir(resume_dir)
    clean = _validate_resume_name(name)
    target = base / clean
    if not target.is_file():
        raise ValueError(f"简历文件不存在: {clean}")
    marker = base / DEFAULT_MARKER_FILENAME
    marker.write_text(clean, encoding="utf-8")
    return {"name": clean, "status": "saved"}


def get_default_resume(resume_dir: Path | None = None) -> dict | None:
    """返回默认简历条目；未设置或文件已删返回 None。"""
    base = _ensure_dir(resume_dir)
    name = get_default_resume_name(base)
    if not name:
        return None
    target = base / name
    if not target.is_file():
        return None
    stat = target.stat()
    return {
        "name": name,
        "size": stat.st_size,
        "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
        "is_default": True,
    }


def get_default_resume_name(resume_dir: Path) -> str:
    """读标记文件里的默认简历名；损坏/未设置返回空串。"""
    marker = resume_dir / DEFAULT_MARKER_FILENAME
    if not marker.is_file():
        return ""
    try:
        return marker.read_text(encoding="utf-8").strip()
    except OSError as e:
        log.warning("读默认简历标记失败: %s", e)
        return ""


def save_resume_file(name: str, content_b64: str, resume_dir: Path | None = None) -> dict:
    """保存或上传简历文件（接收 Base64 编码数据）。"""
    import base64

    base = _ensure_dir(resume_dir)
    clean = _validate_resume_name(name)
    target = base / clean

    # 去除可能包含的 data URI 前缀 (如 data:application/pdf;base64,xxxx)
    raw_b64 = content_b64.split(",", 1)[1] if "," in content_b64 else content_b64
    raw_bytes = base64.b64decode(raw_b64)
    target.write_bytes(raw_bytes)
    stat = target.stat()

    # 如果当前没有默认简历，自动将首份上传的简历设为默认
    current_default = get_default_resume_name(base)
    if not current_default or not (base / current_default).is_file():
        set_default_resume(clean, base)

    return {
        "status": "saved",
        "name": clean,
        "size": stat.st_size,
        "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
        "is_default": get_default_resume_name(base) == clean,
    }


def delete_resume_file(name: str, resume_dir: Path | None = None) -> dict:
    """删除指定的简历文件。若为默认简历，同步清理默认标记。"""
    base = _ensure_dir(resume_dir)
    clean = _validate_resume_name(name)
    target = base / clean
    if target.is_file():
        target.unlink()

    default_name = get_default_resume_name(base)
    if default_name == clean:
        marker = base / DEFAULT_MARKER_FILENAME
        if marker.is_file():
            marker.unlink()

    return {"status": "deleted", "name": clean}


def open_resume_native(name: str, resume_dir: Path | None = None) -> dict:
    """使用 Windows 默认关联软件（WPS / Word / PDF 查阅器 / 照片）直接打开本地原版文件。"""
    import os

    base = _ensure_dir(resume_dir)
    clean = _validate_resume_name(name)
    target = base / clean
    if not target.is_file():
        raise ValueError(f"简历文件不存在: {clean}")

    try:
        os.startfile(str(target.resolve()))
        return {"status": "ok", "name": clean, "path": str(target.resolve())}
    except Exception as e:
        log.warning("调起原生软件打开失败: %s", e)
        raise RuntimeError(f"无法用系统默认程序打开: {e}")


def get_resume_content(name: str, resume_dir: Path | None = None) -> dict:
    """读取指定简历文件内容，返回 Base64 Data URL 及提取文本（针对 Word 等格式）。"""
    import base64

    base = _ensure_dir(resume_dir)
    clean = _validate_resume_name(name)
    target = base / clean
    if not target.is_file():
        raise ValueError(f"简历文件不存在: {clean}")

    raw = target.read_bytes()
    suffix = target.suffix.lower()

    mime_map = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
    }
    mime = mime_map.get(suffix, "application/octet-stream")
    b64 = base64.b64encode(raw).decode("ascii")

    text = ""
    if suffix in (".docx", ".doc"):
        text = _extract_word_text(target)

    return {
        "status": "ok",
        "name": clean,
        "ext": suffix,
        "mime": mime,
        "size": len(raw),
        "data_url": f"data:{mime};base64,{b64}",
        "text": text,
    }


def _extract_word_text(path: Path) -> str:
    """从 docx 或 doc 提取正文纯文本。零第三方外部依赖。"""
    suffix = path.suffix.lower()
    if suffix == ".docx":
        import zipfile
        import xml.etree.ElementTree as ET

        try:
            with zipfile.ZipFile(path) as z:
                xml_content = z.read("word/document.xml")
                tree = ET.fromstring(xml_content)
                ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                paragraphs = []
                for p in tree.iterfind(".//w:p", ns):
                    texts = [node.text for node in p.iterfind(".//w:t", ns) if node.text]
                    if texts:
                        paragraphs.append("".join(texts))
                return "\n\n".join(paragraphs)
        except Exception as e:
            log.warning("提取 docx 失败: %s", e)
            return ""
    elif suffix == ".doc":
        # 兼容传统二进制 .doc 格式文本提取（扫描 UTF-16LE / GBK / UTF-8 可打印文本块）
        try:
            raw = path.read_bytes()
            chunks: list[str] = []
            for encoding in ("utf-16le", "gbk", "utf-8"):
                try:
                    decoded = raw.decode(encoding, errors="ignore")
                    lines = [
                        line.strip()
                        for line in decoded.splitlines()
                        if len(line.strip()) > 3 and any(c.isalnum() for c in line)
                    ]
                    if len(lines) > len(chunks):
                        chunks = lines
                except Exception:
                    continue
            return "\n\n".join(chunks)
        except Exception as e:
            log.warning("提取 doc 失败: %s", e)
            return ""
    return ""


def _ensure_dir(resume_dir: Path | None) -> Path:
    base = resume_dir or DEFAULT_RESUME_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base


def _validate_resume_name(name: str) -> str:
    """只接受纯文件名：非空、无路径分隔符、无 ``..``、扩展名在白名单。"""
    clean = (name or "").strip()
    if not clean:
        raise ValueError("简历文件名不能为空")
    if "/" in clean or "\\" in clean or ".." in clean:
        raise ValueError("简历文件名不合法（不允许路径）")
    path = Path(clean)
    if path.suffix.lower() not in RESUME_EXTENSIONS:
        raise ValueError(f"不支持的简历类型: {path.suffix or '(无扩展名)'}")
    return clean

