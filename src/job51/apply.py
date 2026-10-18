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


def _sample_keywords(keywords: list[str], low: int = 3, high: int = 5) -> list[str]:
    """每轮随机抽 low~high 个关键词（2026-10-15 三平台封号复盘统一策略）。

    与猎聘同款：一轮多词连搜是"搜索风暴"访问画像。词数 ≤ high 全跑
    （零回归）；前 2 个（用户主词）必带；其余随机补齐——多轮自然覆盖。
    """
    if len(keywords) <= high:
        return list(keywords)
    take = random.randint(low, high)
    head = keywords[:2]
    rest = [k for k in keywords[2:] if k not in head]
    need = max(0, take - len(head))
    return head + random.sample(rest, min(need, len(rest)))


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


async def run(
    keywords: list[str],
    daily_limit: int,
    tab=None,
    run_max: int | None = None,
) -> int:
    """跑一轮投递，返回本轮新发送条数。

    ``run_max``（2026-10-15 新号保护模式）：本轮新发送数达到即停——
    三时段配额切分的「单轮份额」。None = 不限（旧行为）。日累计上限
    仍由 daily_limit + sent log 跨轮累计兜底。
    """
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
    # 关键词抽样（2026-10-15 三平台封号复盘统一策略，与猎聘同款）
    keywords = _sample_keywords(keywords)
    _log(f"[job51] 本轮关键词（拟人化抽样后）：{keywords}")
    # 拟人化批次休息：每连投 5~8 个（随机）休 3~8 分钟（与猎聘同款，
    # 调研依据见猎聘 apply.py 注释：影刀 RPA 实测 + Apply4Me 清单）。
    sends_since_break = 0
    break_after = random.randint(5, 8)

    for kw in keywords:
        if sent_today >= daily_limit:
            _log(f"[job51] 今日已投 {sent_today}，达到上限 {daily_limit}")
            break
        if run_max is not None and sent_this_run >= run_max:
            _log(f"[job51] 本轮已达单轮保护上限 {run_max}，停（今日累计 {sent_today}）")
            break

        await driver.goto_search(tab, kw)
        page = 1
        while page <= 50:
            cards = await driver.parse_cards(tab)
            # 封禁/风控拦截页（2026-10-18 审查补齐）：goto_search 返回的
            # banned 标记被 parse_cards 覆盖后丢失，这里重新探测一次——
            # 封禁页顶掉内容时 parse_cards 也是 0 张卡，两者一起判。
            if not cards and await driver.check_ban_page(tab):
                _log("[job51] 🛑 检测到「账号行为异常」封禁/风控拦截页，本轮立即停止")
                events.emit(
                    "agent_intervene",
                    platform="job51",
                    level="warn",
                    title=kw,
                    action="风控拦截停止",
                    detail=(
                        "检测到封禁/风控拦截页（通常约 2 小时自动解锁），"
                        "已停止本轮巡航保号；建议稍后再试"
                    ),
                )
                return sent_this_run
            _log(f"[job51] 关键词「{kw}」第 {page} 页 {len(cards)} 个岗位")

            for card in cards:
                if sent_today >= daily_limit:
                    break
                if run_max is not None and sent_this_run >= run_max:
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
                    # 2026-10-18 用户需求：强提醒——强制前置浏览器 + 保留窗口
                    # 等用户完成验证（runner 收尾据此跳过自动关浏览器）。
                    from boss_zhipin.gui import browser_retention
                    from boss_zhipin.website_oper.core.window_focus import focus_platform_browser

                    browser_retention.request_keep_open("job51")
                    await focus_platform_browser("job51")
                    events.emit(
                        "captcha_stopped",
                        platform="job51",
                        title=title,
                        needs_user_action=True,
                        message=(
                            "前程无忧触发验证码/安全验证，巡航已安全停止。"
                            "受控浏览器窗口已强制前置——请立即在浏览器中完成验证；"
                            "窗口会保持打开，验证完成后可重新启动巡航。"
                        ),
                    )
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
                # 成功回执确认（2026-10-18 三路审查修复）：旧版 dismiss 后
                # 无条件记账——点击未真正提交（需选简历/事件未被处理）也计
                # "已投"，虚增数据且该公司被永久标记导致漏投。现在只有看到
                # "投递成功"弹窗（closed/escape）才记账；两轮探测都没有则记
                # "疑似未投"（不发 job_sent、不进 SENT_LOG、不占公司去重）。
                dismiss_result = await driver.dismiss_success_dialog(tab)
                if dismiss_result == "none":
                    # 成功弹窗可能还在渲染，等 1s 再确认一次
                    await asyncio.sleep(1)
                    dismiss_result = await driver.dismiss_success_dialog(tab)
                if dismiss_result == "none":
                    events.emit(
                        "job_skipped",
                        platform="job51",
                        title=title,
                        reason="send_failed",
                        detail="点击投递后未出现成功弹窗（疑似未提交成功），本轮不记账，下次巡航会重试",
                    )
                    _log(f"[job51] ⚠️ 投递未确认（无成功弹窗），不记账：{title} @ {company}")
                    continue
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
                # 拟人化节奏：用户在 GUI 设置的分平台档位（钳制进安全区间）。
                # 2026-10-15 封号复盘：均匀分布改高斯钟形分布（driver.human_pause）。
                delay_min, delay_max = _delay_range()
                await driver.human_pause(delay_min, delay_max)
                # 批次休息：连投 break_after 个后歇 3~8 分钟（见上方注释）
                sends_since_break += 1
                if sends_since_break >= break_after:
                    rest = random.uniform(180, 480)
                    _log(f"[job51] ⏸️ 拟人化休息 {int(rest)}s（已连投 {sends_since_break} 个，模拟真人歇一会儿再继续）")
                    await asyncio.sleep(rest)
                    sends_since_break = 0
                    break_after = random.randint(5, 8)

            if sent_today >= daily_limit:
                break
            if not await driver.next_page(tab):
                _log(f"[job51] 「{kw}」没有下一页了")
                break
            page += 1

        # 关键词之间稍停：旧 15~30s 匀速换词太快（与猎聘同款复盘），
        # 上浮到 40~100s 高斯停顿，只慢不快。
        await driver.human_pause(40.0, 100.0)

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
    # 单轮上限（2026-10-15 用户拍板"一次巡航投多少就停"）：保护模式注入的
    # 份额优先，未注入时回退保守默认 10（platforms/limits.py 单一真相）。
    from boss_zhipin.platforms.limits import env_run_max

    run_max = env_run_max("JOB51_RUN_MAX", "job51")
    result = uc.loop().run_until_complete(run(DEFAULT_KEYWORDS, limit, run_max=run_max))
    return 0 if result >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
