"""猎聘投递主循环：搜索 → 卡片解析 → 详情页点"聊一聊" → 去重记账。

与 BOSS 的区别：
- 猎聘点"聊一聊"后**平台自动给 HR 发默认招呼**（2026-10-15 用户实测
  拍板：默认只点击不手发，LIEPIN_CLICK_ONLY；双重消息极易被风控识别）。
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


def _sample_keywords(keywords: list[str], low: int = 3, high: int = 5) -> list[str]:
    """每轮随机抽 low~high 个关键词（2026-10-15 封号复盘用户拍板）。

    一轮 16+ 词连搜是"搜索风暴"画像（封的正是异常**访问**）。规则：
    - 词数 ≤ high：全跑（零回归）；
    - 前 2 个词（用户主词，runtime 裂变序在前）必带，保住投递意图；
    - 其余从剩下的词里随机补齐到 low~high 个——多轮巡航自然覆盖全词表。
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


async def run(
    keywords: list[str],
    daily_limit: int,
    greeting: str,
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
    # 关键词抽样（2026-10-15 封号复盘用户拍板）：一轮只搜 3~5 个词，
    # 多轮巡航自然覆盖全词表——一轮 16+ 词连搜是"搜索风暴"访问画像。
    keywords = _sample_keywords(keywords)
    _log(f"[liepin] 本轮关键词（拟人化抽样后）：{keywords}")
    # 拟人化批次休息（2026-10-15 封号复盘调研：影刀 RPA 社区实测连投
    # 20~30 份必触发风控，建议投一批后离开去干点别的；Apply4Me 安全
    # 清单：每 5~8 个动作后休息一段）。人投几个岗位会歇一会儿再继续——
    # 一口气匀速跑到日限是最典型的机器画像。每连投 5~8 个招呼（随机）
    # 休 3~8 分钟；浏览器保持打开（真人离开键盘时浏览器也是开着的）。
    sends_since_break = 0
    break_after = random.randint(5, 8)

    def _banned_event(where: str) -> None:
        """封禁页通知：复用 platform_limit_reached 通道（前端常驻横幅 + 实时动态）。"""
        events.emit(
            "platform_limit_reached",
            platform="liepin",
            matched_text="(账号行为异常封禁页)",
            message=(
                "猎聘检测到访问行为异常，已临时封禁（通常约 2 小时自动解锁），"
                f"本轮在{where}已安全停止。建议今天暂停猎聘巡航；明天起把"
                "「拟人风控与策略」节奏调到稳健档，或开启新号保护模式（小额度多时段）。"
            ),
        )

    for kw in keywords:
        if sent_today >= daily_limit:
            _log(f"[liepin] 今日已投 {sent_today}，达到上限 {daily_limit}")
            break
        if run_max is not None and sent_this_run >= run_max:
            _log(f"[liepin] 本轮已达单轮保护上限 {run_max}，停（今日累计 {sent_today}）")
            break

        try:
            cards = await driver.goto_search(tab, kw)
        except driver.LiepinBannedError:
            _log("[liepin] 🛑 检测到「账号行为异常」封禁页（搜索时），本轮立即停止")
            _banned_event("搜索岗位时")
            return sent_this_run
        _log(f"[liepin] 关键词「{kw}」拉到 {len(cards)} 个岗位")

        for card in cards:
            if sent_today >= daily_limit:
                break
            if run_max is not None and sent_this_run >= run_max:
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

            # 纯点击打招呼（2026-10-15 用户实测拍板）：点"聊一聊"即完成——
            # 平台会自动给 HR 发默认招呼，再手打一条属于双重消息、极易被
            # 检测封号。greeting 仅在 LIEPIN_CLICK_ONLY=0 紧急回退手发时用。
            result = await driver.click_chat(tab, driver.pick_greeting(greeting))
            if result == "banned":
                _log("[liepin] 🛑 检测到「账号行为异常」封禁页（详情页沟通时），本轮立即停止")
                _banned_event("岗位详情页沟通时")
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": "account_banned"})
                return sent_this_run
            if result == "captcha":
                _log("[liepin] 🛑 触发风控验证码，立即停止本轮（避免封号）")
                # 2026-10-18 用户需求：强提醒——强制前置浏览器 + 保留窗口
                # 等用户完成验证（runner 收尾据此跳过自动关浏览器）。
                from boss_zhipin.gui import browser_retention
                from boss_zhipin.website_oper.core.window_focus import focus_platform_browser

                browser_retention.request_keep_open("liepin")
                await focus_platform_browser("liepin")
                events.emit(
                    "captcha_stopped",
                    platform="liepin",
                    title=title,
                    needs_user_action=True,
                    message=(
                        "猎聘触发验证码/安全验证，巡航已安全停止。"
                        "受控浏览器窗口已强制前置——请立即在浏览器中完成验证；"
                        "窗口会保持打开，验证完成后可重新启动巡航。"
                    ),
                )
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
                # 拟人化节奏：用户在 GUI 设置的分平台档位（钳制进安全区间）。
                # 2026-10-15 封号复盘：均匀分布的随机延迟同样是机器签名，
                # 改高斯钟形分布（driver.human_pause，调研依据见其注释）。
                delay_min, delay_max = _delay_range()
                await driver.human_pause(delay_min, delay_max)
                # 批次休息：连投 break_after 个后歇 3~8 分钟（见上方注释）
                sends_since_break += 1
                if sends_since_break >= break_after:
                    rest = random.uniform(180, 480)
                    _log(f"[liepin] ⏸️ 拟人化休息 {int(rest)}s（已连投 {sends_since_break} 个，模拟真人歇一会儿再继续）")
                    await asyncio.sleep(rest)
                    sends_since_break = 0
                    break_after = random.randint(5, 8)
            else:
                events.emit("job_skipped", platform="liepin", title=title, reason="send_failed", detail=result)
                append_jsonl(SEEN_LOG, {"ts": datetime.now().isoformat(), "job_id": job_id, "title": title, "company": company, "salary": salary, "location": location, "reason": result})
                _log(f"[liepin] ⚠️ 跳过（{result}）：{title}")
                await driver.human_pause(5.0, 12.0)

        # 关键词之间稍停：2026-10-15 封号复盘——旧 15~30s 匀速换词太快，
        # 一轮 16+ 个关键词连搜是"搜索风暴"画像（封的正是异常**访问**），
        # 上浮到 40~100s 高斯停顿，只慢不快。
        await driver.human_pause(40.0, 100.0)

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
    # 单轮上限（2026-10-15 用户拍板"一次巡航投多少就停"）：保护模式注入的
    # 份额优先，未注入时回退保守默认 15（platforms/limits.py 单一真相）。
    from boss_zhipin.platforms.limits import env_run_max

    run_max = env_run_max("LIEPIN_RUN_MAX", "liepin")
    result = uc.loop().run_until_complete(
        run(DEFAULT_KEYWORDS, limit, greeting, run_max=run_max)
    )
    return 0 if result >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
