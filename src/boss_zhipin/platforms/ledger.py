"""三平台公共投递账本原语（单一真相）。

BOSS / 猎聘 / 51job 的账本逻辑历史上各复制了一份（字符级相同），P2 重构
（2026-10）合并于此。各平台只传自己的账本路径，记录 schema 由各平台自定：
- BOSS     dispatch/history_logger.py（rich schema：job_key/sent/job 子对象）
- 猎聘     logs/liepin_sent.jsonl（扁平 schema：job_id/company/ts/sent）
- 51job    logs/job51_sent.jsonl（同猎聘扁平 schema）

去重语义（用户 2026-10-11 拍板）：本地计数只是「预警」口径——真正停止投递
的最终裁决，是平台页面上返回「今日额度已用完」类文案（见各平台
limit/alert 检测），两层缺一不可。
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path


def normalize_company(name: str) -> str:
    """公司名归一化：去空白、去括号注记、去公司后缀。

    用于「同一家公司只投一次」的公司维度去重；三平台语义完全一致。
    """
    s = re.sub(r"[\s\u3000]+", "", str(name or "")).lower()
    s = re.sub(r"[\(（\[][^)）\]]*[\)）\]]", "", s)
    for suffix in (
        "股份有限公司",
        "有限责任公司",
        "有限公司",
        "集团公司",
        "公司",
        "集团",
    ):
        if s.endswith(suffix) and len(s) > len(suffix):
            s = s[: -len(suffix)]
            break
    return s


def load_jsonl(path: Path) -> list[dict]:
    """读 jsonl 账本：文件不存在返回 []，损坏行跳过不炸。"""
    if not path.exists():
        return []
    out: list[dict] = []
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def append_jsonl(path: Path | None, record: dict) -> None:
    """追加一条 jsonl 记录；path 为 None 时静默跳过，目录不存在自动创建。"""
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def sent_job_ids(sent_log: Path) -> set[str]:
    """已投递岗位 ID 集合（岗位维度去重）。"""
    return {r.get("job_id") for r in load_jsonl(sent_log) if r.get("job_id")}


def sent_companies(sent_log: Path) -> set[str]:
    """已投递公司的归一化名集合（公司维度去重）。"""
    return {
        normalize_company(r.get("company"))
        for r in load_jsonl(sent_log)
        if r.get("company")
    }


def today_sent(sent_log: Path) -> int:
    """本地今日投递计数（预警口径；最终裁决看平台限额文案，见模块 docstring）。"""
    today = datetime.now().strftime("%Y-%m-%d")
    return sum(
        1
        for r in load_jsonl(sent_log)
        if str(r.get("ts") or "").startswith(today)
    )
