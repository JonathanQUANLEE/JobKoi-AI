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
from boss_zhipin.gui import events  # noqa: E402
from boss_zhipin.platforms.ledger import (  # noqa: E402
    append_jsonl,
    normalize_company,
    sent_companies,
    sent_job_ids,
    today_sent,
)
from boss_zhipin.platforms.limits import DEFAULT_DAILY_LIMITS  # noqa: E402

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


def _delay_range() -> tuple[float, float]:
    """拟人化投递间隔（秒）：读用户设置 LIEPIN_DELAY_MIN/MAX（profile 分
    平台三档桥接而来），缺省标准档 20-40；运行时钳制进安全区间 [15,45]
    （platforms/limits.py——15s 是公开资料最保守建议，见该文件注释）。

    2026-10-13 修复：旧实现硬编码 40~80s 完全无视用户在 GUI 设置的节奏
    档位（用户实测怒吼"我设了效率档为什么还 40s"）。
    """
    from boss_zhipin.platforms.limits import (
        LIEPIN_DELAY_RANGE_SECONDS,
        clamp_delay_range,
    )

    try:
        value_min = float(os.environ.get("LIEPIN_DELAY_MIN", "20"))
        value_max = float(os.environ.get("LIEPIN_DELAY_MAX", "40"))
    except ValueError:
        value_min, value_max = 20.0, 40.0
    return clamp_delay_range(value_min, value_max, LIEPIN_DELAY_RANGE_SECONDS)


async def run(keywords: list[str], daily_limit: int, greeting: str) -> int:
    """跑一轮投递，返回本轮新发送条数。"""
    sent_ids = sent_job_ids(SENT_LOG)
    # 局部集合必须改名：曾用 sent_companies 同名遮蔽导入的 ledger 函数，
    # Python 把整个函数作用域内的 sent_companies 当局部变量 → 首行
    # UnboundLocalError，猎聘链 2026-10-12 GUI 巡航当场崩（实测日志）。
    contacted_companies = sent_companies(SENT_LOG)
    _log(f"[liepin] 已打招呼 {len(sent_ids)} 个岗位 / {len(contacted_companies)} 家公司（将跳过）")

    # 满额预检（2026-10-13 用户实测，与 51job 同款）：今日额度已投满时
    # 旧逻辑仍先开浏览器再进循环秒退——用户看到"浏览器开了却一动不动"。
    # 开浏览器前直接判满：发平台限额事件（前端常驻横幅 + 实时动态提醒）
    # + 本轮跳过该平台，一个窗口都不浪费。
    sent_today = today_sent(SENT_LOG)
    if sent_today >= daily_limit:
        _log(f"[liepin] 今日已投 {sent_today}，达到上限 {daily_limit}，本轮跳过（不开浏览器）")
        events.emit(
            "platform_limit_reached",
            platform="liepin",
            matched_text="(启动前检查)",
            message=f"猎聘今日已投满 {sent_today}/{daily_limit}，本轮自动跳过该平台（未打开浏览器）。明日再来。",
        )
        return 0

    tab = await driver.open_browser(driver.SEARCH_TMPL.format(kw="AI Agent"))
    if not await driver.is_logged_in(tab):
        _log("[liepin] 未登录，请先在「招聘平台中心」扫码登录")
        events.emit(
            "login_required",
            platform="liepin",
            message="猎聘尚未登录，请先在「招聘平台中心」扫码登录。",
        )
        return -1

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
            href = card.get("href") or (f"https://www.liepin.com/job/{job_id}.shtml" if job_id else "")
            title = card.get("title") or ""
            company = card.get("company") or ""
            salary = card.get("salary") or ""
            location = card.get("location") or ""

            if not job_id or not href:
                continue
            if job_id in sent_ids:
                events.emit("job_skipped", platform="liepin", title=title, reason="duplicate", detail="该岗位此前已打过招呼，自动跳过")
                continue
            if not _is_ai_title(title):
                events.emit("job_skipped", platform="liepin", title=title, reason="filtered_out", detail="标题未命中 AI 方向关键词")
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "not_ai_title"})
                continue
            if normalize_company(company) in contacted_companies and company:
                events.emit("job_skipped", platform="liepin", title=title, reason="duplicate", detail="这家公司此前已打过招呼，自动跳过")
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "company_dedup"})
                continue

            # 实时巡航监控（三平台并列需求）：正在处理该岗位
            events.emit(
                "job_processing",
                platform="liepin",
                title=title,
                company=company,
                salary=salary,
                location=location,
                url=href,
            )
            # 打开详情页，抓公司名（更准），再点聊一聊
            await driver.open_detail(tab, href)
            detail_company = await driver.detail_company(tab)
            company = detail_company or company
            if company and normalize_company(company) in contacted_companies:
                events.emit("job_skipped", platform="liepin", title=title, reason="duplicate", detail="这家公司此前已打过招呼，自动跳过")
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "company_dedup"})
                sent_ids.add(job_id)
                continue

            result = await driver.click_chat_and_send(tab, greeting)
            if result == "captcha":
                _log("[liepin] 🛑 触发风控验证码，立即停止本轮（避免封号）")
                events.emit("captcha_stopped", platform="liepin", title=title)
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "captcha"})
                return sent_this_run
            if result == "limit":
                _log("[liepin] 🛑 平台提示今日打招呼次数已达上限，安全停止本轮（已投 %s 个）", sent_today)
                events.emit(
                    "platform_limit_reached",
                    platform="liepin",
                    matched_text="(详情页动作后检出)",
                    message=f"猎聘提示今日打招呼次数已达上限，已安全停止。本轮已打招呼 {sent_today} 个。",
                )
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "platform_limit"})
                return sent_this_run
            if result == "sent":
                sent_ids.add(job_id)
                if company:
                    contacted_companies.add(normalize_company(company))
                sent_today += 1
                sent_this_run += 1
                append_jsonl(SENT_LOG, {
                    "ts": datetime.now().isoformat(),
                    "job_id": job_id, "title": title, "company": company,
                    "salary": salary, "location": location, "url": href,
                    "sent": True, "keyword": kw,
                })
                events.emit(
                    "job_sent",
                    platform="liepin",
                    title=title,
                    company=company,
                    salary=salary,
                    location=location,
                    url=href,
                    sent=sent_today,
                )
                _log(f"[liepin] ✅ 已打招呼 #{sent_today}：{title} @ {company} [{salary} | {location}]")
                # 拟人化节奏：用户在 GUI 设置的分平台档位（钳制进安全区间），
                # 不再硬编码 40~80s 无视配置
                delay_min, delay_max = _delay_range()
                await asyncio.sleep(random.uniform(delay_min, delay_max))
            else:
                events.emit("job_skipped", platform="liepin", title=title, reason="send_failed", detail=result)
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": result})
                _log(f"[liepin] ⚠️ 跳过（{result}）：{title}")
                await asyncio.sleep(random.uniform(5, 12))

        # 关键词之间稍停
        await asyncio.sleep(random.uniform(15, 30))

    _log(f"[liepin] 本轮结束：新打招呼 {sent_this_run}，今日累计 {sent_today}")
    events.emit(
        "api_flow_finished",
        platform="liepin",
        total=sent_this_run,
        scanned=0,
        message=f"猎聘本轮结束：新打招呼 {sent_this_run} 个，今日累计 {sent_today} 个。",
    )
    return sent_this_run


def main() -> int:
    import nodriver as uc

    limit = int(os.environ.get("LIEPIN_DAILY_LIMIT", str(DEFAULT_DAILY_LIMITS["liepin"])))
    greeting = driver._greeting_text()
    result = uc.loop().run_until_complete(run(DEFAULT_KEYWORDS, limit, greeting))
    return 0 if result >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
