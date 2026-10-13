"""前程无忧投递主循环：搜索 → 解析卡片 → 点"投递"按钮 → 去重记账。

51job 投递动作是"投简历"（`button.btn.apply`），HR 看简历后主动联系。
与猎聘不同：不发言、不进详情页，直接在搜索页点按钮。
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

from job51 import driver  # noqa: E402
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


def _log(msg: str) -> None:
    print(msg, flush=True)


def _delay_range() -> tuple[float, float]:
    """拟人化投递间隔（秒）：读用户设置 JOB51_DELAY_MIN/MAX（profile 分
    平台三档桥接而来），缺省标准档 20-40；运行时钳制进安全区间 [15,45]
    （platforms/limits.py）。

    2026-10-13 修复：旧实现硬编码 40~80s 完全无视用户在 GUI 设置的节奏
    档位（与猎聘同款事故）。
    """
    from boss_zhipin.platforms.limits import (
        JOB51_DELAY_RANGE_SECONDS,
        clamp_delay_range,
    )

    try:
        value_min = float(os.environ.get("JOB51_DELAY_MIN", "20"))
        value_max = float(os.environ.get("JOB51_DELAY_MAX", "40"))
    except ValueError:
        value_min, value_max = 20.0, 40.0
    return clamp_delay_range(value_min, value_max, JOB51_DELAY_RANGE_SECONDS)


async def run(keywords: list[str], daily_limit: int, tab=None) -> int:
    sent_ids = sent_job_ids(SENT_LOG)
    # 局部集合必须改名：曾用 sent_companies 同名遮蔽导入的 ledger 函数，
    # Python 把整个函数作用域内的 sent_companies 当局部变量 → 首行
    # UnboundLocalError，51job 链会当场崩（与猎聘 2026-10-12 同款事故）。
    contacted_companies = sent_companies(SENT_LOG)
    _log(f"[job51] 已投 {len(sent_ids)} 个岗位 / {len(contacted_companies)} 家公司（将跳过）")

    # 满额预检（2026-10-13 用户实测）：今日额度已投满时，旧逻辑仍先开
    # 浏览器再进循环秒退——用户看到"浏览器开了却一动不动"。改为开浏览器
    # 前直接判满：发平台限额事件（前端常驻横幅 + 实时动态提醒）+ 本轮
    # 直接跳过该平台，一个窗口都不浪费。
    sent_today = today_sent(SENT_LOG)
    if sent_today >= daily_limit:
        _log(f"[job51] 今日已投 {sent_today}，达到上限 {daily_limit}，本轮跳过（不开浏览器）")
        events.emit(
            "platform_limit_reached",
            platform="job51",
            matched_text="(启动前检查)",
            message=f"前程无忧今日已投满 {sent_today}/{daily_limit}，本轮自动跳过该平台（未打开浏览器）。明日再来。",
        )
        return 0

    if tab is None:
        tab = await driver.open_browser(driver.SEARCH_TMPL.format(kw="AI Agent"))
        if not await driver.is_logged_in(tab):
            _log("[job51] 未登录，请先在「招聘平台中心」扫码登录")
            events.emit(
                "login_required",
                platform="job51",
                message="前程无忧尚未登录，请先在「招聘平台中心」扫码登录。",
            )
            return -1

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
                salary = card.get("salary") or ""
                location = card.get("location") or ""
                url = card.get("href") or (f"https://jobs.51job.com/{job_id}.html" if job_id else "")
                job_label = card.get("jobLabel") or ""
                applied = card.get("applied") or False

                if not job_id:
                    continue
                if job_id in sent_ids or applied:
                    events.emit("job_skipped", platform="job51", title=title, reason="duplicate", detail="该岗位此前已投递过，自动跳过")
                    continue
                # 校招岗（jobLabel="校招"）会跳转应届生求职网，跳过
                if job_label == "校招":
                    events.emit("job_skipped", platform="job51", title=title, reason="filtered_out", detail="校招岗会跳转应届生求职网，无法投递")
                    append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "campus_skip"})
                    continue
                # 放宽：不再限定"实习"，只要计算机相关岗位即投
                if not _is_computer_title(title):
                    events.emit("job_skipped", platform="job51", title=title, reason="filtered_out", detail="非计算机相关岗位，自动跳过")
                    append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "not_computer"})
                    continue
                if company and normalize_company(company) in contacted_companies:
                    events.emit("job_skipped", platform="job51", title=title, reason="duplicate", detail="这家公司此前已投递过，自动跳过")
                    append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "company_dedup"})
                    continue

                # 实时巡航监控（三平台并列需求）：正在处理该岗位
                events.emit(
                    "job_processing",
                    platform="job51",
                    title=title,
                    company=company,
                    salary=salary,
                    location=location,
                    url=url,
                )
                result = await driver.apply_by_jobid(tab, job_id)
                if result.get("captcha"):
                    _log("[job51] 🛑 触发风控验证码，立即停止本轮（避免封号）")
                    events.emit("captcha_stopped", platform="job51", title=title)
                    return sent_this_run
                if not result.get("clicked"):
                    continue

                # 点投递后可能弹：确认弹窗（选择简历）或"投递成功"大弹窗。
                # 2026-10-13 用户实测：成功弹窗（带微信二维码）不关掉就投不了
                # 下一个——两个都处理，且都在弹层内精确匹配（旧的全页文本
                # find 会误点其他岗位卡的"投递"按钮，且最坏等 15s）。
                await asyncio.sleep(2)
                await driver.dismiss_confirm_dialog(tab)
                if await driver.check_limit_alert(tab):
                    _log(f"[job51] 🛑 平台提示今日投递次数已达上限，安全停止本轮（已投 {sent_today} 个）")
                    events.emit(
                        "platform_limit_reached",
                        platform="job51",
                        matched_text="(投递按钮点击后检出)",
                        message=f"前程无忧提示今日投递次数已达上限，已安全停止。本轮已投递 {sent_today} 个。",
                    )
                    return sent_this_run
                # 成功弹窗可能还在渲染，没关掉就等 1s 再试一次
                if await driver.dismiss_success_dialog(tab) == "none":
                    await asyncio.sleep(1)
                    await driver.dismiss_success_dialog(tab)
                await asyncio.sleep(1)

                sent_ids.add(job_id)
                if company:
                    contacted_companies.add(normalize_company(company))
                sent_today += 1
                sent_this_run += 1
                append_jsonl(SENT_LOG, {
                    "ts": datetime.now().isoformat(),
                    "job_id": job_id, "title": title, "company": company,
                    "salary": salary, "location": location, "url": url,
                    "sent": True, "keyword": kw,
                })
                events.emit(
                    "job_sent",
                    platform="job51",
                    title=title,
                    company=company,
                    salary=salary,
                    location=location,
                    url=url,
                    sent=sent_today,
                )
                _log(f"[job51] ✅ 已投递 #{sent_today}：{title} @ {company} [{salary} | {location}]")
                # 拟人化节奏：用户在 GUI 设置的分平台档位（钳制进安全区间），
                # 不再硬编码 40~80s 无视配置
                delay_min, delay_max = _delay_range()
                await asyncio.sleep(random.uniform(delay_min, delay_max))

            if sent_today >= daily_limit:
                break
            if not await driver.next_page(tab):
                _log(f"[job51] 「{kw}」没有下一页了")
                break
            page += 1

        await asyncio.sleep(random.uniform(15, 30))

    _log(f"[job51] 本轮结束：新投递 {sent_this_run}，今日累计 {sent_today}")
    events.emit(
        "api_flow_finished",
        platform="job51",
        total=sent_this_run,
        scanned=0,
        message=f"前程无忧本轮结束：新投递 {sent_this_run} 个，今日累计 {sent_today} 个。",
    )
    return sent_this_run


def main() -> int:
    import nodriver as uc

    limit = int(os.environ.get("JOB51_DAILY_LIMIT", str(DEFAULT_DAILY_LIMITS["job51"])))
    result = uc.loop().run_until_complete(run(DEFAULT_KEYWORDS, limit))
    return 0 if result >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
