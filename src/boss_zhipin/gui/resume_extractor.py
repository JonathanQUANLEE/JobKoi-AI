"""纯本地零依赖简历文本提取器（支持 docx 与 doc 格式）。"""
from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)


def extract_word_text(path: Path) -> str:
    """从 docx 或 doc 提取正文纯文本。零第三方外部依赖。"""
    suffix = path.suffix.lower()
    if suffix == ".docx":
        import xml.etree.ElementTree as ET
        import zipfile

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
