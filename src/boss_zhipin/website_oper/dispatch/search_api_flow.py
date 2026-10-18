"""搜索结果 API 直读流程（绕过 DOM 虚拟列表限制）。"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from pathlib import Path
from typing import Any

from boss_zhipin.audit import validate_letter
from boss_zhipin.config.filter_rules import match_posting
from boss_zhipin.gui import events
from boss_zhipin.platforms.platform_limits import PlatformLimitReached
from boss_zhipin.website_oper.dispatch.loop_actions import (
    is_apply_online_button,
    probe_apply_online_button,
)
from boss_zhipin.website_oper.core.page_filter_ctrl import expand_nationwide_cities
from boss_zhipin.website_oper.dispatch.env_config import (
    _auto_send_daily_limit,
    _auto_send_delay_range,
    _auto_send_max_sent,
    _boss_active_filter_enabled,
    _filter_rules_without_boss_active,
    _merge_boss_active_filter,
    _page_filters,
    _page_filters_for_click,
    _profile_filters,
    _profile_name,
    _stop_on_captcha_enabled,
    _to_filter_posting,
)
from boss_zhipin.website_oper.dispatch.history_logger import (
    _job_with_derived_fields,
    _log_seen,
    _log_sent,
    _log_skipped,
    _read_seen_job_keys,
    _sent_today_count,
    _state_path,
)

log = logging.getLogger(__name__)

# 每城**每词**最多翻多少页（2026-10-12 实测：热门城连续翻 15 页触发 wapi
# 风控 code=37；且热门城会吃光风控额度让后续城市全部饿死——违背用户
# 「每个城市都投到」的核心诉求）。10 页 = 单城单岗位词 300 岗的投递面，
# 主动停在风控线之前，翻完即推进下一词/下一城。收紧行为（只慢不快），
# 不碰反爬红线。
BOSS_MAX_PAGES_PER_CITY = 10


def _keyword_from_url(url: str) -> str:
    """从搜索页 URL 提取用户搜索词（query 参数，已解码）。"""
    from urllib.parse import parse_qsl, urlsplit

    for key, value in parse_qsl(urlsplit(url or "").query, keep_blank_values=True):
        if key == "query":
            return value
    return ""


def _current_city_name() -> str:
    """从当前 URL 的 city 代码反查城市名（单元身份的地面真相）。

    城市轮换原语（apply_page_filters / rotate_next_city_batch）都以 URL 直填
    方式应用城市，URL 的 city 参数就是"当前正在投哪个城"的唯一事实源。
    解析失败返回空串（单元键退化为 ("", 词)，不炸流程）。
    """
    from urllib.parse import parse_qsl, urlsplit

    from boss_zhipin.website_oper import finding_jobs
    from boss_zhipin.website_oper.core.page_filter_ctrl import BOSS_CITY_CODES

    code_to_name = {code: name for name, code in BOSS_CITY_CODES.items()}
    url = finding_jobs.get_current_url()
    for key, value in parse_qsl(urlsplit(url or "").query, keep_blank_values=True):
        if key == "city" and value in code_to_name:
            return code_to_name[value]
    return ""


def _unit_quotas() -> tuple[int, int]:
    """(城市×岗位词) 单元配额：(扫描新岗位数, 投出数)，带下限钳制。

    默认扫 12 个新岗位或投 5 份即轮换（2026-10-17 用户实测调整：投出配额
    2 太激进——画像过滤宽时约 90 秒就整页导航换城，轮换开销与风控压力
    偏大；5 份让单元驻留更久、节奏更平缓）。钳制下限防误配成 0（配额
    永不触发=公平轮换失效）。
    """
    try:
        scan_quota = max(5, int(os.getenv("BOSS_UNIT_SCAN_QUOTA", "12")))
    except ValueError:
        scan_quota = 12
    try:
        sent_quota = max(1, int(os.getenv("BOSS_UNIT_SENT_QUOTA", "5")))
    except ValueError:
        sent_quota = 5
    return scan_quota, sent_quota


# 单元轮换的最大轮数护栏：防 URL 城市解析异常等病态状态下 ③ 分支无限重启。
# 正常场景一轮访问全部单元一次，12 轮 ≈ 数百次单元访问，远超任何单日预算。
MAX_ROTATION_ROUNDS = 12

_DETAIL_JD_SELECTORS = (
    ".job-sec-text",
    ".job-detail-section .job-sec-text",
    ".detail-content",
)


def _use_search_api_flow(url: str) -> bool:
    """起始页是岗位搜索页时走 API 直读，绕过 DOM 虚拟列表。"""
    return "/web/geek/jobs" in (url or "")


# 只依赖卡片自带字段（无需详情页 JD 全文）即可判定的作用域。
# 这些范围允许"标题预过滤"：不匹配的岗位直接跳过，不开详情页。
_PRESCREEN_OK_SCOPES = frozenset({"title", "company", "location", "boss"})


def _can_prescreen_by_title(filters: dict[str, Any]) -> bool:
    """筛选组全部只依赖卡片字段时返回 True（可先按卡片过滤再开详情页）。

    只要任一组规则作用域涉及 description / title_description / all，
    就必须打开详情页读 JD 才能判定 → 返回 False。
    """
    for groups in (filters or {}).values():
        if not isinstance(groups, dict):
            continue
        for rule in (groups.get("required"), groups.get("any"), groups.get("exclude")):
            if isinstance(rule, dict) and bool(rule.get("enabled", True)):
                scope = str(rule.get("scope") or "title")
                if scope not in _PRESCREEN_OK_SCOPES:
                    return False
    return True


async def _open_job_detail_page(url: str, timeout: float = 30) -> bool:
    from boss_zhipin.website_oper import finding_jobs
    from boss_zhipin.website_oper.core.browser_session import human_pause
    from boss_zhipin.website_oper.core.cdp_guard import cdp_call

    tab = finding_jobs.get_tab()
    if tab is None or not url:
        return False
    try:
        # 2026-10-18 事故加固：tab.get 内部是 CDP await 链，页面被风控 JS
        # 卡死时挂起不返回；wait_for 版本会被 nodriver 内部清理链拖死，
        # 改走 cdp_call（可放弃僵尸，主循环不死）。
        await cdp_call(tab.get(url), timeout=timeout, label="tab.get 详情页")
    except Exception as e:
        log.warning("打开详情页失败 %s: %s", url, e)
        return False
    # 拟人化"阅读"停顿（2026-10-15 三平台封号复盘：JobPilot——人类在
    # 新页面行动前有 reading pause；ApplyGoat——人扫一个岗 30s、细读
    # 3min）。旧固定 sleep(2) 秒开秒关详情页是高频访问画像的直接来源。
    await human_pause(6.0, 15.0)
    return True


async def _extract_detail_jd() -> str:
    """抓详情页职位描述；取不到返回空串（退化为只按标题筛选）。"""
    from boss_zhipin.website_oper import finding_jobs

    best = ""
    for selector in _DETAIL_JD_SELECTORS:
        try:
            text = await finding_jobs.get_text_by_css(selector, timeout=3)
        except Exception:
            text = None
        if text and len(text.strip()) > len(best):
            best = text.strip()
        if len(best) >= 100:
            break
    return best


async def _send_greeting_on_detail_page(greeting: str) -> str:
    """在详情页点击“立即沟通”。点击后扫描平台限额提示，命中返回 'platform_limit'。"""
    from boss_zhipin.website_oper import finding_jobs
    from boss_zhipin.website_oper.core.limit_guard import check_platform_limit

    button_text = (
        await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        return "already_contacted"
    if is_apply_online_button(button_text):
        # 网申按钮与沟通按钮同类名（btn-startchat）的形态：点击前的最后防线。
        return "apply_online"
    if not button_text:
        # 沟通按钮读不到：探测是否有网申形态的按钮（不同类名），避免误当 no_button
        button_text = await probe_apply_online_button()
        if is_apply_online_button(button_text):
            return "apply_online"
    contact_xpath = "//a[contains(@class, 'btn-startchat')]"
    if not await finding_jobs.click_by_xpath(contact_xpath, timeout=10):
        return "no_button"
    # 拟人化：点完"立即沟通"稍作停顿再检查限额/处理弹窗（固定 1s 是机器签名）
    from boss_zhipin.website_oper.core.browser_session import human_pause

    await human_pause(0.8, 2.0)
    try:
        await check_platform_limit()
    except PlatformLimitReached:
        return "platform_limit"
    await finding_jobs.click_stay_on_page_if_present(timeout=3)
    await finding_jobs.dismiss_greeting_dialog(timeout=3)
    if finding_jobs.send_resume_after_greeting_enabled():
        await finding_jobs.click_send_resume(timeout=5)
    return "sent"


async def _notify_captcha_needs_user(title: str = "") -> None:
    """验证码/安全验证检出后的统一处置（2026-10-18 用户需求）。

    三件事，缺一不可：
    1. **强制前置受控浏览器窗口**——用户可能正在干别的事、浏览器被盖住
       或最小化，必须"突然弹出来"提醒；
    2. **登记保留窗口**——runner 收尾时不再自动关浏览器，否则用户还没
       看清验证码窗口就被关掉了（旧版实测痛点）；
    3. 广播 ``captcha_stopped`` 事件，前端弹强提醒通知。

    顺序很重要：先弹窗（同步的 Win32 调用，to_thread）再 emit，保证用户
    看到窗口时前端通知也同步到达。
    """
    from boss_zhipin.gui import browser_retention
    from boss_zhipin.website_oper.core.window_focus import focus_platform_browser

    browser_retention.request_keep_open("boss")
    await focus_platform_browser("boss")
    events.emit(
        "captcha_stopped",
        platform="boss",
        title=title,
        needs_user_action=True,
        message=(
            "BOSS 触发验证码/安全验证，巡航已安全停止。"
            "受控浏览器窗口已强制前置——请立即在浏览器中完成验证；"
            "窗口会保持打开，验证完成后可重新启动巡航。"
        ),
    )


async def _process_single_api_job(
    *,
    api_job: dict[str, Any],
    seen_job_keys: set[str],
    seen_jobs_path: Path | None,
    sent_log_path: Path | None,
    skipped_log_path: Path | None,
    filters: dict[str, Any],
    boss_active_filter_enabled: bool,
    stop_on_captcha: bool,
    scan_only: bool,
    dry_run: bool,
    greeting: str,
    sent_count: int,
    daily_sent_count: int,
    delay_min: float,
    delay_max: float,
    jd_health: dict[str, int] | None = None,
) -> tuple[str, int, int]:
    """处理 API 搜索结果中的单个岗位。

    返回值：(status, sent_count, daily_sent_count)
    status 可取值: 'seen', 'captcha', 'filtered',
                   'already_contacted', 'dry_run', 'sent', 'failed',
                   'apply_online', 'page_degraded'

    ``jd_health``：详情页健康度跟踪（2026-10-17 二次实测事故：连续 5 个
    详情页取不到 JD = 会话被风控降级的强信号——详情页已在返回无内容页面，
    继续硬扫每个空烧 ~90s 且给风控升温）。3 连续失效探测验证码页（命中即
    停），5 连续失效按「风控降级」停止；成功取到 JD 即复位计数。
    """
    from boss_zhipin.website_oper import finding_jobs, job_api

    job = job_api.to_job_posting(api_job)
    # 实时巡航监控（2026-10-12 用户需求）：每个岗位开始处理时上报一次，
    # 前端「实时巡航」页的"当前岗位聚光卡"靠它展示正在看哪个岗位、到哪一步。
    # platform 字段（2026-10-12 三平台并列需求）：前端按平台分通道并列显示。
    events.emit(
        "job_processing",
        platform="boss",
        title=job.title,
        company=job.company,
        salary=job.salary,
        location=job.location,
    )
    dedupe_key = finding_jobs.job_key(job)
    if dedupe_key in seen_job_keys:
        # 已投过/扫过的岗位：跳过也要让用户看见（否则浏览器静止像卡死）
        events.emit(
            "job_skipped",
            platform="boss",
            title=job.title,
            reason="duplicate",
            detail="本地历史记录中已处理过该岗位",
        )
        return "seen", sent_count, daily_sent_count

    # 内存级去重（2026-10-18 审查修复）：同轮防重复照旧立即标记；但**永久
    # 落盘**（_log_seen）推迟到详情页打开成功之后——旧版打开失败的岗位
    # 也被记入已见，下一轮按 duplicate 跳过不再重试，瞬时网络故障会
    # "烧掉"岗位。打开失败的岗位还要从内存集合回滚，本轮后续也不再误跳。
    seen_job_keys.add(dedupe_key)

    # 企业级去重已按用户规格移除（2026-10-11）：同一企业常有多个岗位，
    # 不能因为投过该企业就跳过它的其他岗位；去重只按岗位（dedupe_key）。

    # 标题预过滤（观感修复：别开着浏览器逐个点不相干岗位）——
    # 规则全部只依赖卡片字段时，先用 API 卡片数据过滤一轮；不命中直接跳过，
    # 不再打开详情页（详情页只留给"卡片信息已命中、需进一步核对 JD"的岗位）。
    if _can_prescreen_by_title(filters):
        probe_posting = _to_filter_posting(job, "")
        # 活跃状态缺失（wapi 卡既无 activeTimeDesc 也无 bossOnline）时
        # 优雅降级：跳过活跃限制只按岗位规则判定，绝不因"没数据"误杀
        # （与 DOM 流 job_evaluator 同一套语义）。
        probe_filters = filters
        if boss_active_filter_enabled and not probe_posting.boss_active_status:
            probe_filters = _filter_rules_without_boss_active(filters)
        probe_match = match_posting(probe_posting, probe_filters)
        if not probe_match.matched:
            _log_skipped(
                skipped_log_path,
                job=job,
                job_key=dedupe_key,
                send_mode="auto",
                reason="filtered_out",
                details={
                    "stage": "profile_filter",
                    "reason": probe_match.reason,
                    "job_title": job.title,
                },
            )
            events.emit(
                "job_skipped",
                platform="boss",
                title=job.title,
                reason="filtered_out",
                detail=probe_match.reason,
            )
            return "filtered", sent_count, daily_sent_count

    if not await _open_job_detail_page(job.detail_url):
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="detail_open_failed",
            details={"stage": "detail_page", "job_title": job.title},
        )
        # 回滚内存标记（2026-10-18）：打开失败≠已处理，下一轮应重试
        # （永久 seen 落盘已推迟到打开成功之后，这里只需回滚内存集合）。
        seen_job_keys.discard(dedupe_key)
        return "failed", sent_count, daily_sent_count

    # 详情页打开成功：此刻才把岗位永久记入已见（2026-10-18 审查修复——
    # 打开失败的岗位不再被"烧掉"，见上方内存级去重注释）。
    _log_seen(seen_jobs_path, job=job, job_key=dedupe_key, send_mode="auto")

    if stop_on_captcha and await finding_jobs.captcha_visible():
        log.warning("详情页检测到验证码/安全验证，按 BOSS_STOP_ON_CAPTCHA 停止")
        await _notify_captcha_needs_user(job.title)
        return "captcha", sent_count, daily_sent_count

    # 2026-10-18 事故加固：详情页主线程被验证码/风控 JS 卡住时，
    # tab.select 的 CDP 调用会挂死——旧版外层 wait_for 抛的 TimeoutError
    # 直接穿透到 runner._wrap，把整轮巡航打死（日志实锤：evaluate 5s 超时
    # 后 20s 整轮崩）。改为：超时 = 本岗位 JD 取不到 → 按标题筛选继续，
    # 与「JD 未取到」同一降级路径；jd_health 计数照常推进（连续失效仍会
    # 触发风控降级停机）。
    try:
        jd_text = await asyncio.wait_for(_extract_detail_jd(), timeout=20)
    except asyncio.TimeoutError:
        log.warning(
            "详情页 JD 提取超时（20s，页面疑似被验证码/风控 JS 卡住），按标题筛选继续：%s",
            job.title,
        )
        jd_text = ""
    if not jd_text:
        log.info("详情页 JD 未取到，按标题筛选：%s", job.title)
        if jd_health is not None:
            # 页面降级探测（2026-10-17 二次实测事故）：连续详情页无内容
            # = 会话被风控降级的强信号（发生于换城轮换之前 7 分钟——不是
            # 轮换的锅，是账号/会话级风控）。保号优先：宁可早停，绝不空烧。
            jd_health["consecutive_missing"] = jd_health.get("consecutive_missing", 0) + 1
            missing = jd_health["consecutive_missing"]
            if missing >= 3 and await finding_jobs.captcha_visible():
                # 只读 DOM 探测命中验证码页（不受 BOSS_STOP_ON_CAPTCHA 门控——
                # 这是探测到实锤风控页后的安全停机，与开关联人的"预防性检测"不同）
                log.warning(
                    "连续 %d 个详情页无 JD 且检测到验证码/安全验证页，停止巡航保号", missing
                )
                await _notify_captcha_needs_user(job.title)
                return "captcha", sent_count, daily_sent_count
            if missing >= 5:
                log.warning(
                    "连续 %d 个详情页取不到 JD（疑似风控降级/页面异常），停止巡航保号", missing
                )
                events.emit(
                    "agent_intervene",
                    platform="boss",
                    level="warn",
                    title=job.title,
                    action="风控降级停止",
                    detail=(
                        f"连续 {missing} 个详情页取不到内容（疑似平台风控降级），"
                        "已提前停止巡航保号；建议到浏览器完成验证或 1~2 小时后再试"
                    ),
                )
                return "page_degraded", sent_count, daily_sent_count
    elif jd_health is not None:
        jd_health["consecutive_missing"] = 0

    job = _job_with_derived_fields(
        job_api.to_job_posting(api_job, description=jd_text), jd_text
    )
    filter_posting = _to_filter_posting(job, jd_text)
    # 详情页后的完整匹配同样做缺状态降级（JD 文本里也提取不到活跃
    # 标签时，不能让活跃规则把岗位一刀切死）。
    full_filters = filters
    if boss_active_filter_enabled and not filter_posting.boss_active_status:
        full_filters = _filter_rules_without_boss_active(filters)
    match = match_posting(filter_posting, full_filters)
    if not match.matched:
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="filtered_out",
            details={
                "stage": "profile_filter",
                "reason": match.reason,
                "job_title": job.title,
            },
        )
        events.emit(
            "job_skipped",
            platform="boss",
            title=job.title,
            reason="filtered_out",
            detail=match.reason,
        )
        return "filtered", sent_count, daily_sent_count

    button_text = (
        await finding_jobs.get_text_by_css("a.btn-startchat", timeout=3) or ""
    ).strip()
    if "继续沟通" in button_text or "继续聊天" in button_text:
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="already_contacted",
            details={
                "stage": "contact_status",
                "button_text": button_text,
                "job_title": job.title,
            },
        )
        return "already_contacted", sent_count, daily_sent_count

    if not button_text:
        # 沟通按钮读不到：探测网申形态按钮（不同类名），避免误判 no_button
        button_text = await probe_apply_online_button()
    if is_apply_online_button(button_text):
        # 网申/外链岗位（2026-10-17 用户实测痛点）：按钮为「立即网申」等外部
        # 投递入口，点击不会进聊天页——旧流程会把 btn-startchat 类名的网申
        # 按钮当「立即沟通」点下去（假报 sent + 网申弹窗残留阻塞后续岗位）。
        # 守护 Agent 研判：需外部系统投递，站内直聊不可用 → 记录并平滑跳过，
        # 绝不让单个岗位的异态炸掉整轮巡航。
        detail = (
            f"BOSS 按钮为「{button_text}」，该岗位需外部系统网申，暂不支持站内直聊"
        )
        log.info("⏭️ [api-flow] 网申岗位跳过：%s（%s）", job.title, button_text)
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason="apply_online",
            details={
                "stage": "contact_status",
                "button_text": button_text,
                "job_title": job.title,
            },
        )
        events.emit(
            "job_skipped",
            platform="boss",
            title=job.title,
            reason="apply_online",
            detail=detail,
        )
        events.emit(
            "agent_intervene",
            platform="boss",
            level="info",
            title=job.title,
            action="安全跳过",
            detail=(
                f"识别到「{button_text}」岗位：需外部系统投递，暂不支持站内直聊。"
                "已记录并平滑推进下一岗位，主流程未受阻"
            ),
        )
        return "apply_online", sent_count, daily_sent_count

    if scan_only or dry_run:
        _log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            status="dry_run",
            details={"stage": "api_flow", "job_title": job.title},
            dry_run=True,
            sent=False,
        )
        sent_count += 1
        log.info("[DRY-RUN] 命中 %s（%s），不真实发送", job.title, job.company)
        return "dry_run", sent_count, daily_sent_count

    try:
        # 2026-10-18 事故加固：wait_for 在内层取消链挂死时永不返回（发送
        # 假死场景实测根因），cdp_call 两次 cancel + 可放弃，保证单岗位
        # 最坏 120s + 宽限后一定交还主循环（连续失败熔断随后接管）。
        from boss_zhipin.website_oper.core.cdp_guard import cdp_call

        status = await cdp_call(
            _send_greeting_on_detail_page(greeting),
            timeout=120,
            grace=10.0,
            label=f"发送招呼语：{job.title}",
        )
    except asyncio.TimeoutError:
        log.warning("发送超时（120s），跳过：%s", job.title)
        status = "failed"
    except Exception as e:
        log.warning("发送异常（%s）：%s", job.title, e)
        status = "failed"

    if status == "platform_limit":
        # 平台弹出限额提示：全局停机信号，不做 skip 记账，直接上传给调度层。
        log.info("检出平台限额提示，终止本轮投递")
        return status, sent_count, daily_sent_count

    if status == "sent":
        sent_count += 1
        daily_sent_count += 1
        _log_sent(
            sent_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            status="sent",
            details={"stage": "api_flow", "job_title": job.title},
            dry_run=False,
            sent=True,
        )
        events.emit(
            "job_sent",
            platform="boss",
            title=job.title,
            company=job.company,
            sent=sent_count,
        )
        log.info(
            "✅ [api-flow] 已发送 #%d：%s（%s）",
            sent_count,
            job.title,
            job.company,
        )
    else:
        if status == "apply_online":
            # 点击瞬间按钮文案才渲染成网申的罕见形态：与点击前识别同语义处理
            reason = "apply_online"
            events.emit(
                "agent_intervene",
                platform="boss",
                level="info",
                title=job.title,
                action="安全跳过",
                detail="点击时才发现该岗位为网申入口，已放弃点击动作并平滑推进下一岗位",
            )
        else:
            reason = "already_contacted" if status == "already_contacted" else "send_failed"
        _log_skipped(
            skipped_log_path,
            job=job,
            job_key=dedupe_key,
            send_mode="auto",
            reason=reason,
            details={
                "stage": "send",
                "button_state": status,
                "job_title": job.title,
            },
        )
        if status == "already_contacted":
            log.info("⏭️ [api-flow] 该岗位此前已沟通过，跳过：%s", job.title)

    # 带站岗的节流睡眠：用户中途手关浏览器时 ~2s 内中止，不傻等满 10-30s。
    # 2026-10-15 封号复盘：均匀分布的随机延迟同样是机器签名，改高斯钟形
    # （human_pause，调研依据见 browser_session 注释）。
    from boss_zhipin.website_oper.core.browser_session import human_pause

    await human_pause(delay_min, delay_max)
    return status, sent_count, daily_sent_count


async def _run_search_api_flow(
    *,
    usr_name: str,
    url: str,
    dry_run: bool,
    scan_only: bool,
    greeting: str,
) -> None:
    """API 直读搜索结果：按页枚举 → 逐个开详情页 → 本地筛选 → 发送。"""
    from boss_zhipin.website_oper import finding_jobs, job_api

    if not scan_only:
        validation = validate_letter(greeting)
        if not validation.ok:
            raise RuntimeError("固定招呼语未通过发送校验: " + ", ".join(validation.reasons))

    seen_jobs_path = _state_path("BOSS_SEEN_JOBS_FILE")
    sent_log_path = _state_path("BOSS_SENT_LOG_FILE")
    skipped_log_path = _state_path("BOSS_SKIPPED_LOG_FILE")
    # 活跃窗口（三阶段引擎·机制三 2026-10-13）：把画像 page_filters 里的
    # BOSS 活跃状态同步成本地 OR 规则（与 DOM 流 loop_config 同一套合并
    # 逻辑——此前 api 直读流漏了这步，用户在 GUI 配了活跃筛选也不生效）。
    # 缺状态的岗位由 _process_single_api_job 内做优雅降级（不误杀）。
    page_filter_cfg = _page_filters()
    filters = _merge_boss_active_filter(_profile_filters(), page_filter_cfg)
    boss_active_filter_enabled = _boss_active_filter_enabled(page_filter_cfg)
    stop_on_captcha = _stop_on_captcha_enabled()
    delay_min, delay_max = _auto_send_delay_range()
    max_sent = _auto_send_max_sent()
    daily_limit = _auto_send_daily_limit()
    # scan_only 的扫描上限（2026-10-18 审查修复）：搜索页 API 流此前按
    # auto 的 max_sent 停（dry-run 计数），用户设的 BOSS_SCAN_MAX_JOBS
    # 在搜索页失效——与 DOM 流 loop_config 的停止语义对齐。
    if scan_only:
        from boss_zhipin.website_oper.dispatch.env_config import _scan_max_jobs

        max_sent = _scan_max_jobs()
    sent_count = 0
    daily_sent_count = _sent_today_count(
        sent_log_path, profile=_profile_name()
    )
    seen_job_keys: set[str] = _read_seen_job_keys(seen_jobs_path)
    query = job_api.search_query_from_url(url)
    tab = finding_jobs.get_tab()
    if tab is None:
        raise RuntimeError("受控 tab 不存在，无法执行 API 直读流程")

    events.emit(
        "api_flow_started",
        usr_name=usr_name,
        daily_sent=daily_sent_count,
        dry_run=dry_run,
        scan=scan_only,
    )
    log.info(
        "[api-flow] 启动：dry_run=%s scan=%s 今日已发 %d 条",
        dry_run,
        scan_only,
        daily_sent_count,
    )

    page = 1
    # 连续秒过页计数（2026-10-15 阶梯节流）：连续越多页 <3s 秒过，说明陷
    # 历史已投区越深，页间隔要越慢（用法见下方页间节流处注释）。
    consecutive_fast_pages = 0
    # 拟人化批次休息（2026-10-15 三平台封号复盘调研：影刀 RPA 社区实测
    # 连投 20~30 份必触发风控；Apply4Me 安全清单：每 5~8 个动作后休息
    # 一段）。一口气匀速跑到日限是最典型的机器画像——每连投 5~8 个
    # （随机）休 3~8 分钟，带站岗（用户手关浏览器 ~2s 内中止）。
    sends_since_break = 0
    break_after = random.randint(5, 8)
    # 跳过分类计数（2026-10-12 用户实测：150 岗全部秒跳、0 投递且无任何
    # 解释，用户以为巡航卡死——结束时必须把"为什么没投"说清楚）。
    skipped_duplicates = 0
    skipped_filtered = 0
    skipped_already = 0
    # 网申岗位跳过数（2026-10-17 守护 Agent）：独立分类，让用户清楚这些
    # 岗位不是"失败"而是平台形态不支持站内直聊。
    skipped_apply_online = 0
    failed_count = 0
    scanned_count = 0
    # 详情页健康度（2026-10-17 二次实测）：连续详情页取不到 JD = 会话被
    # 风控降级的强信号——_process_single_api_job 内计数与探测，达阈值
    # 返回 page_degraded/captcha 触发保号停机（详见其 docstring）。
    jd_health: dict[str, int] = {}
    # 连续失败熔断计数（2026-10-18 审查修复：旧版在每页循环内重置，跨页的
    # 间歇性失败（每页 2-3 个）永远凑不满 5，熔断保护被削弱。移到单元
    # 循环外初始化——跨页累计，任一成功/网申识别到按钮即复位（见下方）。
    consecutive_failures = 0
    # 按城市维度统计（2026-10-12 用户追问"郑州为什么不去投"：多城市是混合
    # 搜索，郑州岗位其实扫过——必须按城市拆开汇报，才能让用户看明白）。
    city_stats: dict[str, dict[str, int]] = {}
    stop_reason = "completed"
    # 城市随机逐城推进（2026-10-12 用户拍板 + wapi 取证 v3：wapi 只收单城 city，
    # 多城逗号 code=19）。第 1 城由入口 apply_page_filters 洗牌后直填；这里只管
    # 当前城自然扫完后推进下一城——每个城市都投到、一个都不饿死。
    # （page_filter_cfg 已在 filters 构造处读取，这里复用同一份。）
    city_cfg = page_filter_cfg.get("city") if isinstance(page_filter_cfg, dict) else None
    # enabled 检查必须与 apply_page_filters 对齐：城市组被禁用时它一个都不会直填，
    # 这里如果仍算出多城去推进，会在巡航中途把被禁用的城市偷偷加上。
    all_cities = (
        [
            str(v).strip()
            for v in city_cfg.get("values") or []
            if str(v).strip()
        ]
        if isinstance(city_cfg, dict) and bool(city_cfg.get("enabled", True))
        else []
    )
    # 「全国」展开（2026-10-17）：与入口 apply_page_filters / rotate_next_city_batch
    # 同一套 expand_nationwide_cities——全国代码只是 IP 属地混合流，展开后每个
    # 核心城市都进轮换矩阵、都被真实投到。
    all_cities = expand_nationwide_cities(all_cities)
    total_cities = max(1, len(all_cities))
    cities_done = 1 if len(all_cities) >= 1 else 0  # 第 1 城（随机）入口已应用

    def _record_city(city_name: str, status: str) -> None:
        bucket = city_stats.setdefault(
            city_name, {"scanned": 0, "sent": 0, "skipped": 0}
        )
        bucket["scanned"] += 1
        if status == "sent":
            bucket["sent"] += 1
        elif status in ("seen", "filtered", "already_contacted", "failed", "apply_online"):
            bucket["skipped"] += 1

    def _emit_flow_summary(stop: str) -> None:
        scanned = scanned_count
        message = (
            f"本轮扫描 {scanned} 个岗位：新投递 {sent_count}、"
            f"已投过跳过 {skipped_duplicates}、规则不匹配 {skipped_filtered}、"
            f"此前已沟通 {skipped_already}、网申岗位跳过 {skipped_apply_online}、"
            f"打开失败 {failed_count}。"
        )
        if sent_count == 0:
            if skipped_duplicates >= scanned > 0 and scanned_count > 0:
                message += "该搜索词的岗位近期已全部投递过，建议换个搜索词或明天再来。"
            elif skipped_filtered >= scanned > 0 and scanned_count > 0:
                message += "岗位与你的画像规则（关键词/城市/排除项）均不匹配，可在「求职画像」调整规则。"
            else:
                message += "本轮没有可投递的新岗位。"
        if stop == "captcha":
            message += "（触发验证码已安全停止）"
        elif stop == "page_degraded":
            message += (
                "（连续多个详情页取不到内容，疑似平台风控降级——已提前停止保号；"
                "建议打开浏览器确认是否需要完成验证，或 1~2 小时后再巡航）"
            )
        elif stop == "platform_limit":
            message += "（平台提示今日上限已安全停止）"
        elif stop == "api_error":
            message += "（搜索接口风控限流，稍后再试）"
        per_city = sorted(
            (
                {"city": city, **counts}
                for city, counts in city_stats.items()
            ),
            key=lambda item: item["scanned"],
            reverse=True,
        )
        events.emit(
            "api_flow_finished",
            # platform 字段（2026-10-18 审查修复）：多平台并发巡航时前端用
            # 它找 BOSS 的汇总——此前只有猎聘/51job 带，前端 find(platform
            # === "boss") 恒 undefined，结束弹窗会错误显示其他平台的统计。
            platform="boss",
            total=sent_count,
            page=page,
            scanned=scanned,
            skipped_duplicates=skipped_duplicates,
            skipped_filtered=skipped_filtered,
            skipped_already_contacted=skipped_already,
            skipped_apply_online=skipped_apply_online,
            failed=failed_count,
            stop_reason=stop,
            per_city=per_city,
            cities_done=cities_done,
            total_cities=total_cities,
            message=message,
        )
        log.info("[api-flow] 结束（%s）：%s", stop, message)

    # 岗位关键词轮换表（2026-10-15 用户需求"多写岗位换着投"）：入口 URL
    # 的搜索词排第一（与首屏一致），再拼接 BOSS_LABEL 里切分出的多岗位词
    # （split_search_keywords：中文逗号/顿号/分号/换行切分，不切空格与
    # 斜杠）。去重保序；只有一个词时表长为 1，轮换逻辑零介入，行为与
    # 旧版完全一致（零回归设计）。
    from boss_zhipin.config.query_fission import split_search_keywords

    rotation_keywords: list[str] = []
    for _kw in [_keyword_from_url(url), *split_search_keywords(os.getenv("BOSS_LABEL", ""))]:
        if _kw and _kw not in rotation_keywords:
            rotation_keywords.append(_kw)
    if not rotation_keywords:
        rotation_keywords = [""]
    kw_index = 0

    # ---- (城市×岗位词) 单元配额状态（2026-10-17 公平轮换） ----
    # 痛点：旧机制"单城词表耗尽才换城"是深度优先——北上广的无限推荐流让
    # 第 1 城吃光全局日限，选 7 城 = 连续几天只投第 1 城。新机制广度优先：
    # 每个 (城, 词) 单元每次访问扫够配额（新岗位数 / 投出数，先到先轮换）
    # 就主动轮换到下一单元，长尾城市与岗位词雨露均沾。
    # - unit_pages: 单元 → 下次要取的页码（配额中断不推进页码：重取本页，
    #   已扫岗位靠 seen 去重——全盘覆盖且有限终止两不误）
    # - unit_exhausted: 自然扫完（空页/超页上限）的单元集合
    # - 配额只数"新岗位"（status != seen）：纯重复页不占配额，单元每轮
    #   必有进展（页面推进或新岗位被消耗），杜绝"配额卡死在同一页"死循环
    scan_quota, sent_quota = _unit_quotas()
    unit_pages: dict[tuple[str, str], int] = {}
    unit_exhausted: set[tuple[str, str]] = set()
    total_units = max(1, len(all_cities)) * len(rotation_keywords)
    multi_unit = total_units > 1  # 单单元零介入：行为与旧版完全一致（零回归）
    rotation_round = 1

    # 单元轮换外层循环（2026-10-17 公平轮换）：每个 (城×词) 单元扫够配额
    # 或自然耗尽就轮换——城市优先（北京×AI → 上海×AI，PRD 主路径），城尽
    # 换词，词尽仍有存量则重洗城市序列开新一轮；风控/限额/验证码/手动停止
    # 等全局停止条件一律不轮换硬闯（保号优先，与旧机制同一铁律）。
    while True:
        halt_flow: str | None = None  # "captcha" | "platform_limit"（全局停机）
        quota_hit = False
        current_city = _current_city_name()
        unit_key = (current_city, rotation_keywords[kw_index])
        unit_scanned = 0
        unit_sent = 0
        # 单元的下次页码；已耗尽/超页上限的单元跳过页循环直接走推进
        page = unit_pages.get(unit_key, 1)
        if page > BOSS_MAX_PAGES_PER_CITY:
            unit_exhausted.add(unit_key)
        if unit_key in unit_exhausted:
            page = BOSS_MAX_PAGES_PER_CITY + 1
        while page <= BOSS_MAX_PAGES_PER_CITY:
            if max_sent is not None and sent_count >= max_sent:
                stop_reason = "max_sent"
                break
            if daily_limit is not None and daily_sent_count >= daily_limit:
                # 启动即满额（或发完最后一单翻页回来）：发醒目事件——
                # 前端常驻横幅 + 实时动态都会提醒"BOSS 今日已投满"，
                # 不再只把原因埋进结束汇总里（2026-10-13 用户实测）。
                events.emit(
                    "platform_limit_reached",
                    platform="boss",
                    matched_text="(进入翻页循环时检查)",
                    message=f"BOSS 直聘今日已投满 {daily_sent_count}/{daily_limit}，已安全停止。"
                    "今天的实际投递数量可在「投递明细记录」中查看。",
                )
                stop_reason = "daily_limit"
                break
            page_started = time.monotonic()
            try:
                api_jobs = await job_api.fetch_search_page(tab, query, page)
            except RuntimeError as e:
                # code=37 = 请求过于频繁（2026-10-13 实测：全跳过页秒翻 6 次
                # 后触发）。尊重风控信号：冷却退避 + 刷新页面后重试一次，
                # 而不是立刻硬停浪费整轮巡航；重试仍被限制才优雅结束。
                # 2026-10-15 加固：① 45s 实测不够（冷却后重试照样 37），
                # 提到 90s；② 重试前 Page.reload 重建页面上下文——wapi 的
                # 环境校验依赖页面加载时生成的风控令牌，高频 XHR 后旧令牌
                # 可能已失效，原地重试大概率还是 37；③ 明确不轮换关键词/
                # 城市硬闯：会话已风控发热，换词只是换个姿势打同一接口，
                # 只会叠加风险信号，熔断保号优先。
                if "code=37" in str(e):
                    events.emit(
                        "api_flow_error",
                        page=page,
                        message=f"触发 BOSS 频率限制（{e}），冷却 90 秒后刷新页面自动重试第 {page} 页…",
                    )
                    log.warning(
                        "[api-flow] code=37 频率限制，冷却 90s 后刷新重试第 %d 页", page
                    )
                    from boss_zhipin.website_oper.core.browser_session import (
                        reload_current_page,
                        sleep_with_browser_guard,
                    )

                    # 带站岗冷却：用户中途手关浏览器时 ~2s 内中止，不傻等满 90s
                    await sleep_with_browser_guard(90)
                    # 重试前刷新页面，重建风控令牌（见上方注释②）
                    await reload_current_page()
                    try:
                        api_jobs = await job_api.fetch_search_page(tab, query, page)
                    except RuntimeError as e2:
                        log.warning("冷却刷新后第 %d 页仍被限制，结束：%s", page, e2)
                        events.emit(
                            "api_flow_error",
                            page=page,
                            message="冷却并刷新后仍触发频率限制，本轮安全结束。建议等待 10 分钟后再试，或换个搜索词。",
                        )
                        stop_reason = "api_error"
                        break
                else:
                    if "无有效响应" in str(e):
                        # 页面上下文失效（2026-10-17 实测事故：单元轮换整页导航
                        # 后首个 wapi XHR 偶发拿到空值——旧版对这种非 37 异常
                        # 一律直接放弃整轮巡航）。守护 Agent 处置：短冷却 +
                        # Page.reload 重建页面上下文/风控令牌 + 重试一次；再失败
                        # 才优雅收尾（保号优先，绝不硬闯——与 code=37 同款哲学）。
                        events.emit(
                            "api_flow_error",
                            page=page,
                            message=f"搜索接口暂无响应（{e}），30 秒后刷新页面自动重试…",
                        )
                        events.emit(
                            "agent_intervene",
                            platform="boss",
                            level="warn",
                            title=f"第 {page} 页搜索接口",
                            action="自愈重试",
                            detail="接口无有效响应（页面上下文可能未就绪），冷却 30 秒并刷新页面后自动重试一次",
                        )
                        log.warning(
                            "[api-flow] 搜索接口无有效响应，冷却 30s 后刷新重试第 %d 页", page
                        )
                        from boss_zhipin.website_oper.core.browser_session import (
                            reload_current_page,
                            sleep_with_browser_guard,
                        )

                        await sleep_with_browser_guard(30)
                        await reload_current_page()
                        try:
                            api_jobs = await job_api.fetch_search_page(tab, query, page)
                        except RuntimeError as e2:
                            log.warning("刷新后第 %d 页仍无响应，结束：%s", page, e2)
                            events.emit(
                                "api_flow_error",
                                page=page,
                                message="刷新页面后接口仍无响应，本轮安全结束。建议稍后重新发起巡航。",
                            )
                            stop_reason = "api_error"
                            break
                        events.emit(
                            "agent_intervene",
                            platform="boss",
                            level="recovered",
                            title=f"第 {page} 页搜索接口",
                            action="已恢复",
                            detail="刷新页面重建上下文后接口已恢复，继续扫描",
                        )
                    else:
                        log.warning("第 %d 页搜索接口失败，结束：%s", page, e)
                        events.emit("api_flow_error", page=page, message=str(e))
                        stop_reason = "api_error"
                        break
            if not api_jobs:
                log.info("第 %d 页没有岗位，搜索结果已全部取完", page)
                unit_exhausted.add(unit_key)  # 单元自然耗尽
                break

            # 连续失败熔断（2026-10-16 实测事故：20 个详情页连续 30s 超时，
            # 白等 10 分钟才崩。浏览器标签页卡死/风控限制时连续 failed，
            # 连续 5 个即提前收工，避免整轮巡航空耗在超时上）。
            # 2026-10-18 修复：计数初始化已移到单元循环外（跨页累计）。
            for api_job in api_jobs:
                if max_sent is not None and sent_count >= max_sent:
                    break
                if daily_limit is not None and daily_sent_count >= daily_limit:
                    break

                status, sent_count, daily_sent_count = await _process_single_api_job(
                    api_job=api_job,
                    seen_job_keys=seen_job_keys,
                    seen_jobs_path=seen_jobs_path,
                    sent_log_path=sent_log_path,
                    skipped_log_path=skipped_log_path,
                    filters=filters,
                    boss_active_filter_enabled=boss_active_filter_enabled,
                    stop_on_captcha=stop_on_captcha,
                    scan_only=scan_only,
                    dry_run=dry_run,
                    greeting=greeting,
                    sent_count=sent_count,
                    daily_sent_count=daily_sent_count,
                    delay_min=delay_min,
                    delay_max=delay_max,
                    jd_health=jd_health,
                )
                scanned_count += 1
                _record_city(api_job.city or "未知城市", status)
                if status == "seen":
                    skipped_duplicates += 1
                elif status == "filtered":
                    skipped_filtered += 1
                elif status == "already_contacted":
                    skipped_already += 1
                elif status == "apply_online":
                    # 网申跳过是守护 Agent 的主动决策而非故障：既不算 failed，
                    # 也要打断"连续失败"计数（按钮能读到说明页面活着），
                    # 绝不触发"连续 5 个失败提前收工"的误停机。
                    skipped_apply_online += 1
                    consecutive_failures = 0
                elif status == "failed":
                    failed_count += 1
                    consecutive_failures += 1
                    if consecutive_failures >= 5:
                        log.warning(
                            "[api-flow] 🔌 连续 %d 个岗位详情页打不开（疑似浏览器卡死/网络/风控限制），"
                            "提前结束本轮巡航以免空耗",
                            consecutive_failures,
                        )
                        events.emit(
                            "api_flow_error",
                            page=page,
                            message="连续 5 个岗位详情页打不开（疑似网络或风控限制），"
                            "本轮巡航已提前停止；稍后可重新发起。",
                        )
                        halt_flow = "api_error"
                        break
                elif status == "sent":
                    sends_since_break += 1
                    consecutive_failures = 0
                if status == "captcha":
                    halt_flow = "captcha"
                    break
                if status == "page_degraded":
                    # 详情页连续无内容（疑似风控降级）：保号优先立即停机，
                    # 不带着被降级的会话继续硬扫（事件已由岗位层发出）。
                    halt_flow = "page_degraded"
                    break
                if status == "platform_limit":
                    events.emit(
                        "platform_limit_reached",
                        platform="boss",
                        matched_text="(详情页动作后检出)",
                        message="平台提示已达今日投递上限，已安全停止。"
                        "今天的实际投递数量可在「投递明细记录」中查看。",
                    )
                    halt_flow = "platform_limit"
                    break

                # 单元配额（2026-10-17 公平轮换）：只数新岗位（seen 是历史
                # 重复不占配额）；扫够或投够即轮换，大城市/热门词不再吃光
                # 全局额度，长尾城市与岗位词雨露均沾。
                if status != "seen":
                    unit_scanned += 1
                    if status == "sent":
                        unit_sent += 1
                if multi_unit and (
                    unit_scanned >= scan_quota or unit_sent >= sent_quota
                ):
                    quota_hit = True
                    log.info(
                        "[api-flow] 单元 [%s × %s] 配额到（新扫 %d / 投 %d），"
                        "轮换下一单元雨露均沾",
                        current_city,
                        rotation_keywords[kw_index],
                        unit_scanned,
                        unit_sent,
                    )
                    break

            if halt_flow:
                stop_reason = halt_flow
                break
            if quota_hit:
                # 页码不推进：下次访问本单元重取本页，已扫岗位靠 seen 去重
                break

            # 拟人化批次休息（见上方初始化处注释）：连投若干个后歇一会儿，
            # 模拟真人"投几个歇一会儿"的节奏结构。
            if sends_since_break >= break_after:
                rest = random.uniform(180, 480)
                log.info(
                    "[api-flow] ⏸️ 拟人化休息 %ds（已连投 %d 个，模拟真人歇一会儿再继续）",
                    int(rest),
                    sends_since_break,
                )
                from boss_zhipin.website_oper.core.browser_session import (
                    sleep_with_browser_guard,
                )

                await sleep_with_browser_guard(rest)
                sends_since_break = 0
                break_after = random.randint(5, 8)

            log.info(
                "[api-flow] 第 %d 页处理完成（本页 %d 个岗位），本轮累计发送 %d",
                page,
                len(api_jobs),
                sent_count,
            )
            page += 1
            unit_pages[unit_key] = page  # 整页扫完才推进页码（配额中断不推进）
            # 页间节流：秒翻 6 页会触发 BOSS 搜索接口风控（实测 code=37），
            # 拟人化页间停顿再翻下一页。
            # 2026-10-13 加固（自适应上浮）：本页 <3s 秒过 = 全是已投/规则
            # 不匹配、一个详情页都没开——正在穿越历史已投区，纯接口高频
            # 翻页最容易触发频率限制。此时把页间停顿上浮到 4~6.5s，
            # 只慢不快（开过详情页的正常页维持基线）。
            # 2026-10-15 加固（阶梯上浮）：实测 4~6.5s 仍不够——上一轮巡航
            # 已把会话风控额度烧热时，28s 连翻 5 页照样在第 6 页吃 code=37。
            # 连续秒过页越多 = 陷历史已投区越深：第 3 个连续快页起上浮到
            # 9~15s，把翻页节奏压回人类水平；出现正常页（开过详情页）即
            # 复位。城市推进时故意不复位（只慢不快：上一城若是纯已投区，
            # 会话热度会带进下一城）。
            # 2026-10-15 封号复盘：均匀分布改高斯钟形分布（human_pause）。
            from boss_zhipin.website_oper.core.browser_session import human_pause

            page_elapsed = time.monotonic() - page_started
            if page_elapsed < 3.0:
                consecutive_fast_pages += 1
                if consecutive_fast_pages >= 3:
                    await human_pause(9.0, 15.0)
                else:
                    await human_pause(4.0, 6.5)
            else:
                consecutive_fast_pages = 0
                await human_pause(3.0, 6.5)

        # ---- 单元推进判定（2026-10-17 公平轮换）：配额到或自然扫完都触发；
        # 风控/限额/验证码触发的结束（stop_reason != completed）一律不轮换
        # 硬闯（保号优先，与旧机制同一铁律）。consecutive_fast_pages 故意
        # 不复位（只慢不快：轮换前的会话热度会带进下一单元）。 ----
        if halt_flow:
            break
        if stop_reason != "completed":
            break
        # 全部单元自然耗尽 → 圆满收工
        if len(unit_exhausted) >= total_units:
            log.info(
                "[api-flow] %d 个 (城市×岗位词) 单元已全部自然扫完，本轮圆满结束",
                total_units,
            )
            break
        advanced = False
        # ① 同词换城（PRD 主路径：北京×AI应用 → 上海×AI应用，城市优先交错）
        if cities_done < total_cities:
            rotated = await finding_jobs.rotate_next_city_batch(
                _page_filters_for_click(page_filter_cfg),
                emit_event=lambda payload: events.emit("page_filter", **payload),
            )
            if rotated:
                cities_done += 1
                advanced = True
        # ② 本轮城走完 → 换下一个岗位词；换词后城市轮重启（新词从重洗后的
        # 第 1 城开始，城市多样性最大化）
        if not advanced and kw_index < len(rotation_keywords) - 1:
            next_kw = rotation_keywords[kw_index + 1]
            rotated_kw = await finding_jobs.rotate_to_keyword(
                next_kw,
                emit_event=lambda payload: events.emit("page_filter", **payload),
            )
            if rotated_kw:
                kw_index += 1
                advanced = True
                log.info(
                    "[api-flow] 岗位关键词推进 %d/%d：%s",
                    kw_index + 1,
                    len(rotation_keywords),
                    next_kw,
                )
                if len(all_cities) >= 2 and await finding_jobs.restart_city_rotation_round(
                    _page_filters_for_click(page_filter_cfg),
                    emit_event=lambda payload: events.emit("page_filter", **payload),
                ):
                    rotation_round += 1
                    cities_done = 0
                    if await finding_jobs.rotate_next_city_batch(
                        _page_filters_for_click(page_filter_cfg),
                        emit_event=lambda payload: events.emit("page_filter", **payload),
                    ):
                        cities_done = 1
        # ③ 词也尽但仍有单元有存量 → 词复位 + 多城重洗序列，开启新一轮；
        # 轮数护栏防病态状态下的无限重启
        if (
            not advanced
            and len(unit_exhausted) < total_units
            and rotation_round < MAX_ROTATION_ROUNDS
        ):
            if len(rotation_keywords) > 1 and await finding_jobs.rotate_to_keyword(
                rotation_keywords[0],
                emit_event=lambda payload: events.emit("page_filter", **payload),
            ):
                kw_index = 0
                advanced = True
                log.info("[api-flow] 词表走完仍有单元存量，岗位词复位开启新一轮")
            if len(all_cities) >= 2 and await finding_jobs.restart_city_rotation_round(
                _page_filters_for_click(page_filter_cfg),
                emit_event=lambda payload: events.emit("page_filter", **payload),
            ):
                rotation_round += 1
                cities_done = 0
                if await finding_jobs.rotate_next_city_batch(
                    _page_filters_for_click(page_filter_cfg),
                    emit_event=lambda payload: events.emit("page_filter", **payload),
                ):
                    cities_done = 1
                    advanced = True
        if not advanced:
            log.info("[api-flow] 轮换原语全部失败（无下一城/下一词），结束")
            break
        # 单元间节流（拟人化，红线：只慢不快）。2026-10-15 封号复盘：换城/换词
        # 匀速太快，15~40s 高斯停顿（真人换个城市/搜索词会先看看结果缓一缓）。
        from boss_zhipin.website_oper.core.browser_session import human_pause

        await human_pause(15.0, 40.0)
        # 状态 resync：kw_index 按轮换后的 URL 实词对齐（轮换失败时以 URL
        # 实际词为准，不丢状态）；query/tab 同步刷新。
        actual_url = finding_jobs.get_current_url()
        cur_kw = _keyword_from_url(actual_url)
        kw_index = (
            rotation_keywords.index(cur_kw) if cur_kw in rotation_keywords else kw_index
        )
        query = job_api.search_query_from_url(actual_url)
        tab = finding_jobs.get_tab()
        if tab is None:
            stop_reason = "api_error"
            break
        log.info(
            "[api-flow] 单元推进：第 %d 轮 %d/%d 城 × 词[%s]，URL=%s",
            rotation_round,
            cities_done,
            total_cities,
            rotation_keywords[kw_index],
            actual_url,
        )

    _emit_flow_summary(stop_reason)
    log.info("[api-flow] 结束：本轮发送 %d 条，翻到第 %d 页", sent_count, page)
