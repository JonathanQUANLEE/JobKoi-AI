"""前程无忧投递主循环：搜索 → 解析卡片 → 点"投递"按钮 → 去重记账。

51job 投递动作是"投简历"（`button.btn.apply`），HR 看简历后主动联系。
与猎聘不同：不发言、不进详情页，直接在搜索页点按钮。
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from job51 import driver  # noqa: E402

LOGS = ROOT / "logs"
SENT_LOG = LOGS / "job51_sent.jsonl"
SEEN_LOG = LOGS / "job51_seen.jsonl"

DEFAULT_KEYWORDS = [
    "AI Agent",
    "大模型应用",
    "算法",
    "Python",
    "软件开发",
    "前端开发",
    "后端开发",
    "数据分析",
    "测试工程师",
]

# 放宽策略（用户 2026-10-08 指示）：只要计算机相关岗位就投，不再限定"实习"。
# 仍保留：校招岗跳过（点击会跳转应届生求职网，无法在本站完成投递）。
COMPUTER_TITLE_PATTERNS = [
    # —— AI / 算法方向 ——
    "ai", "agent", "llm", "nlp", "aigc", "rag",
    "大模型", "算法", "机器学习", "深度学习", "人工智能", "多模态", "智能体",
    "计算机视觉", "数据挖掘", "语音识别", "具身智能",
    # —— 开发方向 ——
    "python", "java", "golang", "php", "c++", "c#",
    "前端", "后端", "全栈", "web", "安卓", "android", "ios", "小程序", "嵌入式",
    "软件", "程序员", "编程", "开发工程师", "研发工程师",
    # —— 数据方向 ——
    "大数据", "数据分析", "数据开发", "数据仓库", "数据工程", "数据库", "etl",
    # —— 测试 / 运维 ——
    "测试工程师", "软件测试", "自动化测试", "运维", "devops", "sre",
    # —— 通用 IT ——
    "计算机", "it", "信息技术", "信息化", "网络工程",
]


def _kw_hit(low: str, kw: str) -> bool:
    """中英混排安全的"词"匹配。

    纯字母英文关键词要求前后不是英文字母/数字（避免 "email" 命中 "ai"），
    中文关键词直接子串匹配。注意不能用 \\b：中英混排时 "AI工程师" 里
    "ai" 与 "工" 之间不构成词边界，\\bai\\b 会漏匹配。
    """
    if kw.isascii() and kw.isalpha():
        return re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", low) is not None
    return kw in low


def _is_computer_title(title: str) -> bool:
    low = (title or "").lower()
    return any(_kw_hit(low, p) for p in COMPUTER_TITLE_PATTERNS)


def _normalize_company(name: str) -> str:
    s = re.sub(r"[\s\u3000]+", "", str(name or "")).lower()
    s = re.sub(r"[\(（\[][^)）\]]*[\)）\]]", "", s)
    for suffix in ("股份有限公司", "有限责任公司", "有限公司", "集团公司", "公司", "集团"):
        if s.endswith(suffix) and len(s) > len(suffix):
            s = s[: -len(suffix)]
            break
    return s


def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def _append_jsonl(path: Path, rec: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _sent_job_ids() -> set[str]:
    return {r.get("job_id") for r in _load_jsonl(SENT_LOG) if r.get("job_id")}


def _sent_companies() -> set[str]:
    return {_normalize_company(r.get("company")) for r in _load_jsonl(SENT_LOG) if r.get("company")}


def _today_sent() -> int:
    today = datetime.now().strftime("%Y-%m-%d")
    return sum(1 for r in _load_jsonl(SENT_LOG) if str(r.get("ts") or "").startswith(today))


def _log(msg: str) -> None:
    print(msg, flush=True)


async def _dismiss_confirm_dialog(tab) -> bool:
    """点投递后可能弹"确认投递/选择简历"弹窗，尝试点确认。"""
    for text in ("确认", "确定", "立即投递", "投递", "提交"):
        try:
            el = await tab.find(text, best_match=True, timeout=3)
            if el:
                await el.click()
                await asyncio.sleep(1)
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


async def run(keywords: list[str], daily_limit: int, tab=None) -> int:
    sent_ids = _sent_job_ids()
    sent_companies = _sent_companies()
    _log(f"[job51] 已投 {len(sent_ids)} 个岗位 / {len(sent_companies)} 家公司（将跳过）")

    if tab is None:
        tab = await driver.open_browser(driver.SEARCH_TMPL.format(kw="AI Agent"))
        if not await driver.is_logged_in(tab):
            _log("[job51] 未登录，请先跑 scripts/job51_login.py 扫码")
            return -1

    sent_today = _today_sent()
    sent_this_run = 0

    for kw in keywords:
        if sent_today >= daily_limit:
            _log(f"[job51] 今日已投 {sent_today}，达到上限 {daily_limit}")
            break

        await driver.goto_search(tab, kw)
        page = 1
        while page <= 50:
            cards = await driver.parse_cards(tab)
            _log(f"[job51] 关键词「{kw}」第 {page} 页 {len(cards)} 个岗位")

            for card in cards:
                if sent_today >= daily_limit:
                    break
                job_id = card.get("jobId") or ""
                title = card.get("title") or ""
                company = card.get("company") or ""
                job_label = card.get("jobLabel") or ""
                applied = card.get("applied") or False

                if not job_id:
                    continue
                if job_id in sent_ids or applied:
                    continue
                # 校招岗（jobLabel="校招"）会跳转应届生求职网，跳过
                if job_label == "校招":
                    _append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "campus_skip"})
                    continue
                # 放宽：不再限定"实习"，只要计算机相关岗位即投
                if not _is_computer_title(title):
                    _append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "not_computer"})
                    continue
                if company and _normalize_company(company) in sent_companies:
                    _append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "company_dedup"})
                    continue

                result = await driver.apply_by_jobid(tab, job_id)
                if result.get("captcha"):
                    _log("[job51] 🛑 触发风控验证码，立即停止本轮（避免封号）")
                    return sent_this_run
                if not result.get("clicked"):
                    continue

                # 点投递后可能弹确认框
                await asyncio.sleep(2)
                await _dismiss_confirm_dialog(tab)
                await asyncio.sleep(1)

                sent_ids.add(job_id)
                if company:
                    sent_companies.add(_normalize_company(company))
                sent_today += 1
                sent_this_run += 1
                _append_jsonl(SENT_LOG, {
                    "ts": datetime.now().isoformat(),
                    "job_id": job_id, "title": title, "company": company,
                    "sent": True, "keyword": kw,
                })
                _log(f"[job51] ✅ 已投递 #{sent_today}：{title} @ {company}")
                # 拟人化节奏（51job 风控敏感，跟猎聘一样 40~80 秒）
                await asyncio.sleep(random.uniform(40, 80))

            if sent_today >= daily_limit:
                break
            if not await driver.next_page(tab):
                _log(f"[job51] 「{kw}」没有下一页了")
                break
            page += 1

        await asyncio.sleep(random.uniform(15, 30))

    _log(f"[job51] 本轮结束：新投递 {sent_this_run}，今日累计 {sent_today}")
    return sent_this_run


def main() -> int:
    import nodriver as uc

    limit = int(os.environ.get("JOB51_DAILY_LIMIT", "40"))
    result = uc.loop().run_until_complete(run(DEFAULT_KEYWORDS, limit))
    return 0 if result >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
