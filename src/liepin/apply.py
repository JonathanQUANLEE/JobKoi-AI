"""猎聘投递主循环：搜索 → 卡片解析 → 详情页点"聊一聊" → 发固定招呼语 → 去重记账。

与 BOSS 的区别：
- 猎聘**必须发一句招呼语**才建立对话（用户已确认：聊一聊 + 固定招呼语）。
- 去重维度：jobId（岗位唯一）+ 公司名（同公司不重复投）。

日志：
- logs/liepin_sent.jsonl   —— 已打招呼（sent: true）
- logs/liepin_seen.jsonl   —— 已见过（含跳过）
"""

from __future__ import annotations

import asyncio
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

from liepin import driver  # noqa: E402
from boss_zhipin.platforms.ledger import (  # noqa: E402
    append_jsonl,
    normalize_company,
    sent_companies,
    sent_job_ids,
    today_sent,
)

LOGS = ROOT / "logs"
SENT_LOG = LOGS / "liepin_sent.jsonl"
SEEN_LOG = LOGS / "liepin_seen.jsonl"

DEFAULT_KEYWORDS = [
    "AI Agent",
    "Agent",
    "大模型",
    "人工智能",
    "机器学习",
    "深度学习",
    "NLP",
    "多模态",
    "LLM",
    "AI工程师",
    "算法工程师",
    "AIGC",
    "智能体",
    "RAG",
    "AI应用",
    "计算机视觉",
]


# 标题过滤：用户要"AI 相关"，但猎聘搜索会混入不相关岗位（实测混进"海外市场专员"），
# 这里要求标题命中任一 AI 关键词才投。英文词用词边界，避免 \bai\b 误伤 email/fair。
AI_TITLE_PATTERNS = [
    r"\bai\b", r"\bagent\b", r"\bllm\b", r"\bnlp\b", r"\baigc\b", r"\brag\b",
    "大模型", "模型", "算法", "机器学习", "深度学习", "人工智能",
    "多模态", "智能体", "计算机视觉",
]


def _is_ai_title(title: str) -> bool:
    low = (title or "").lower()
    for p in AI_TITLE_PATTERNS:
        if p.startswith("\\b"):
            if re.search(p, low):
                return True
        elif p in low:
            return True
    return False


def _log(msg: str) -> None:
    print(msg, flush=True)


async def run(keywords: list[str], daily_limit: int, greeting: str) -> int:
    """跑一轮投递，返回本轮新发送条数。"""
    sent_ids = sent_job_ids(SENT_LOG)
    sent_companies = sent_companies(SENT_LOG)
    _log(f"[liepin] 已打招呼 {len(sent_ids)} 个岗位 / {len(sent_companies)} 家公司（将跳过）")

    tab = await driver.open_browser(driver.SEARCH_TMPL.format(kw="AI Agent"))
    if not await driver.is_logged_in(tab):
        _log("[liepin] 未登录，请先跑 scripts/liepin_login.py 扫码")
        return -1

    sent_today = today_sent(SENT_LOG)
    sent_this_run = 0

    for kw in keywords:
        if sent_today >= daily_limit:
            _log(f"[liepin] 今日已投 {sent_today}，达到上限 {daily_limit}")
            break

        cards = await driver.goto_search(tab, kw)
        _log(f"[liepin] 关键词「{kw}」拉到 {len(cards)} 个岗位")

        for card in cards:
            if sent_today >= daily_limit:
                break
            job_id = card.get("jobId") or ""
            href = card.get("href") or ""
            title = card.get("title") or ""
            company = card.get("company") or ""

            if not job_id or not href:
                continue
            if job_id in sent_ids:
                continue
            if not _is_ai_title(title):
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "not_ai_title"})
                continue
            if normalize_company(company) in sent_companies and company:
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "company_dedup"})
                continue

            # 打开详情页，抓公司名（更准），再点聊一聊
            await driver.open_detail(tab, href)
            detail_company = await driver.detail_company(tab)
            company = detail_company or company
            if company and normalize_company(company) in sent_companies:
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "company_dedup"})
                sent_ids.add(job_id)
                continue

            result = await driver.click_chat_and_send(tab, greeting)
            if result == "captcha":
                _log("[liepin] 🛑 触发风控验证码，立即停止本轮（避免封号）")
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "captcha"})
                return sent_this_run
            if result == "limit":
                _log("[liepin] 🛑 平台提示今日打招呼次数已达上限，安全停止本轮（已投 %s 个）", sent_today)
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": "platform_limit"})
                return sent_this_run
            if result == "sent":
                sent_ids.add(job_id)
                if company:
                    sent_companies.add(normalize_company(company))
                sent_today += 1
                sent_this_run += 1
                append_jsonl(SENT_LOG, {
                    "ts": datetime.now().isoformat(),
                    "job_id": job_id, "title": title, "company": company,
                    "sent": True, "keyword": kw,
                })
                _log(f"[liepin] ✅ 已打招呼 #{sent_today}：{title} @ {company}")
                # 拟人化节奏：真实用户投一个岗位至少 1 分钟（看JD、犹豫、打字），
                # 3 秒一个必触发风控。随机 40~80 秒。
                await asyncio.sleep(random.uniform(40, 80))
            else:
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "reason": result})
                _log(f"[liepin] ⚠️ 跳过（{result}）：{title}")
                await asyncio.sleep(random.uniform(5, 12))

        # 关键词之间稍停
        await asyncio.sleep(random.uniform(15, 30))

    _log(f"[liepin] 本轮结束：新打招呼 {sent_this_run}，今日累计 {sent_today}")
    return sent_this_run


def main() -> int:
    import nodriver as uc

    limit = int(os.environ.get("LIEPIN_DAILY_LIMIT", "100"))
    greeting = driver._greeting_text()
    result = uc.loop().run_until_complete(run(DEFAULT_KEYWORDS, limit, greeting))
    return 0 if result >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
