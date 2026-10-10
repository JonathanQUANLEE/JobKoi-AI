"""岗位卡片解析与列表滚动加载。"""
from __future__ import annotations

import asyncio
import json
import logging

from boss_zhipin.website_oper.core.models import (
    JobPosting,
    _strip_jd_noise,
)

log = logging.getLogger(__name__)


def _first_line_matching(lines: list[str], needles: tuple[str, ...]) -> str:
    return next((line for line in lines if any(needle in line for needle in needles)), "")


def _first_company_line(lines: list[str]) -> str:
    for line in lines:
        if any(word in line for word in ("公司", "科技", "网络", "信息", "智能", "软件")):
            return line
    return ""


def _split_boss_line(line: str) -> tuple[str, str]:
    if not line:
        return "", ""
    parts = line.split(maxsplit=1)
    if len(parts) == 1:
        return "", parts[0]
    return parts[0], parts[1]


def _parse_job_card_text(text: str, *, fallback_title: str = "") -> JobPosting:
    """从岗位卡片可见文本中尽力提取结构化字段。"""
    from boss_zhipin.website_oper import finding_jobs

    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    title = fallback_title or (lines[0] if lines else "")
    salary = _first_line_matching(lines, ("元/天", "K", "k", "薪"))
    location = _first_line_matching(lines, ("·", "广州", "深圳", "北京", "上海", "杭州", "成都"))
    education = _first_line_matching(lines, ("博士", "硕士", "本科", "大专", "学历不限"))
    company = _first_company_line(lines)
    boss_line = _first_line_matching(lines, ("活跃", "刚刚在线", "在线"))
    boss_name, boss_active_status = _split_boss_line(boss_line)
    boss_active_status = boss_active_status or finding_jobs.extract_boss_active_status(text)
    known = {title, salary, location, education, company, boss_line}
    tags = [line for line in lines[1:] if line not in known]
    return JobPosting(
        title=title,
        description="",
        company=company,
        location=location,
        salary=salary,
        tags=tags,
        boss_name=boss_name,
        boss_active_status=boss_active_status,
        education=education,
    )


async def _js_click_job_card_and_get_title(index_1: int) -> dict:
    """点击第 N 个岗位卡，并返回岗位卡文本。"""
    from boss_zhipin.website_oper import finding_jobs

    js = f"""
    JSON.stringify((() => {{
      try {{
        const cards = document.querySelectorAll('.job-card-box');
        if (cards.length < {index_1}) return {{ok: false, total: cards.length}};
        const card = cards[{index_1 - 1}];
        const titleEl = card.querySelector('.job-name, .job-title, [class*="job-name"], [class*="job-title"]');
        const text = ((titleEl && titleEl.innerText) || card.innerText || '').trim();
        const title = text.split('\\n').map((line) => line.trim()).find(Boolean) || '';
        card.click();
        return {{ok: true, total: cards.length, title, cardText: (card.innerText || '').trim()}};
      }} catch (e) {{
        return {{ok: false, error: String(e), stack: e.stack || ''}};
      }}
    }})())
    """
    return await finding_jobs._safe_evaluate(js)


async def get_job_description_by_index(index: int) -> str | None:
    """点开第 N 个岗位卡（1-indexed），返回右侧 JD 详情面板的文本；失败返回 None。"""
    from boss_zhipin.website_oper import finding_jobs

    log.info("[get_job_description_by_index] index=%d", index)
    job = await finding_jobs.get_job_by_index(index)
    return job.description if job else None


async def get_job_by_index(index: int) -> JobPosting | None:
    """点开第 N 个岗位卡（1-indexed），返回岗位标题和右侧 JD；失败返回 None。"""
    from boss_zhipin.website_oper import finding_jobs

    log.info("[get_job_by_index] index=%d", index)
    click_result = await finding_jobs._js_click_job_card_and_get_title(index)
    log.info("  点击 .job-card-box[%d]: %s", index, click_result)
    if not click_result.get("ok"):
        return None

    jd = await finding_jobs._js_wait_text(".job-detail-body", min_len=50, timeout_s=10)
    if jd is None:
        log.info("  10s 内 .job-detail-body 没出现或文本太短")
        return None
    jd = _strip_jd_noise(jd)
    title = (click_result.get("title") or "").strip()
    card = _parse_job_card_text(click_result.get("cardText") or "", fallback_title=title)
    log.info("  标题 %r，JD 长度 %d 字符", title, len(jd))
    return JobPosting(
        title=card.title,
        description=jd,
        company=card.company,
        location=card.location,
        salary=card.salary,
        tags=card.tags or [],
        boss_name=card.boss_name,
        boss_active_status=card.boss_active_status,
        education=card.education,
        detail_url=card.detail_url,
    )


async def get_loaded_job_count() -> int:
    """返回当前已加载的岗位卡数量。"""
    from boss_zhipin.website_oper import finding_jobs

    result = await finding_jobs._safe_evaluate(
        """
        JSON.stringify((() => {
          return {count: document.querySelectorAll('.job-card-box').length};
        })())
        """,
        timeout=5,
    )
    return int(result.get("count") or 0)


async def get_selected_job_index() -> int:
    """返回当前选中的岗位卡索引（1-indexed），无法识别时回退到 1。"""
    from boss_zhipin.website_oper import finding_jobs

    result = await finding_jobs._safe_evaluate(
        r"""
        JSON.stringify((() => {
          const cards = Array.from(document.querySelectorAll('.job-card-box'));
          if (!cards.length) return {index: 1, detected: false, reason: 'no_cards'};

          const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
          const hasSelectedMarker = (element) => {
            if (!element) return false;
            if (element.getAttribute && (
              element.getAttribute('aria-selected') === 'true'
              || element.getAttribute('aria-current') === 'true'
            )) return true;
            const classes = normalize(
              typeof element.className === 'string' ? element.className : ''
            );
            return /(^|\s)(active|selected|current)(\s|$)/i.test(classes);
          };

          let selected = cards.findIndex((card) => {
            const parent = card.parentElement;
            const grandparent = parent && parent.parentElement;
            return [card, parent, grandparent].some(hasSelectedMarker);
          });
          if (selected >= 0) {
            return {index: selected + 1, detected: true, reason: 'active_marker'};
          }

          const detailTitleElement = document.querySelector(
            '.job-detail-box .job-name, .job-detail-info .job-name, '
            + '.job-detail-header .job-name, .job-detail-box [class*="job-name"], '
            + '.job-detail-box [class*="job-title"]'
          );
          const detailTitle = normalize(detailTitleElement && detailTitleElement.innerText);
          if (detailTitle) {
            selected = cards.findIndex((card) => {
              const titleElement = card.querySelector(
                '.job-name, .job-title, [class*="job-name"], [class*="job-title"]'
              );
              const title = normalize(
                (titleElement && titleElement.innerText)
                || (card.innerText || '').split('\n')[0]
              );
              return title === detailTitle;
            });
          }
          return selected >= 0
            ? {index: selected + 1, detected: true, reason: 'detail_title'}
            : {index: 1, detected: false, reason: 'not_detected'};
        })())
        """,
        timeout=5,
    )
    try:
        index = max(1, int(result.get("index") or 1))
    except (TypeError, ValueError):
        index = 1
    if result.get("detected"):
        log.info("检测到当前选中的岗位卡：第 %d 条", index)
    else:
        log.info("未识别到当前选中的岗位卡，从第 1 条开始")
    return index


async def scroll_to_load_more_jobs(timeout: float = 8.0) -> bool:
    """滚动左侧岗位列表并等待新岗位出现。成功返回 True，否则 False。"""
    from boss_zhipin.website_oper import finding_jobs

    before = await finding_jobs.get_loaded_job_count()
    scroll_result = await finding_jobs._safe_evaluate(
        """
        JSON.stringify((() => {
          const firstCardText = () => {
            const card = document.querySelector('.job-card-box');
            return card ? (card.innerText || '').trim().slice(0, 120) : '';
          };
          const cards = Array.from(document.querySelectorAll('.job-card-box'));
          const candidates = [
            document.querySelector('.job-list-box'),
            document.querySelector('.job-list'),
            document.querySelector('.job-list-container'),
            document.querySelector('[class*="job-list"]'),
            cards[0] ? cards[0].closest('div') : null,
          ].filter(Boolean);
          const scrollable = candidates.find((el) => el.scrollHeight > el.clientHeight + 20);
          const target = scrollable || document.scrollingElement || document.documentElement || document.body;
          const beforeTop = target.scrollTop || window.scrollY || 0;
          const beforeFirst = firstCardText();
          target.scrollTop = beforeTop + Math.max(600, Math.floor((target.clientHeight || window.innerHeight || 600) * 0.85));
          if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
            window.scrollBy(0, Math.max(600, Math.floor(window.innerHeight * 0.85)));
          }
          const afterTop = target.scrollTop || window.scrollY || 0;
          const afterFirst = firstCardText();
          return {
            ok: true,
            target: scrollable ? 'left-list' : 'window',
            beforeTop,
            afterTop,
            beforeFirst,
            afterFirst,
          };
        })())
        """,
        timeout=5,
    )
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(0.5)
        after = await finding_jobs.get_loaded_job_count()
        if after > before:
            log.info(
                "滚动加载更多岗位：%d -> %d（target=%s）",
                before,
                after,
                scroll_result.get("target", ""),
            )
            return True
        if (
            scroll_result.get("afterTop") != scroll_result.get("beforeTop")
            or scroll_result.get("afterFirst") != scroll_result.get("beforeFirst")
        ):
            log.info(
                "岗位列表已滚动（target=%s，count=%d，DOM 数量未变，按虚拟列表继续）",
                scroll_result.get("target", ""),
                before,
            )
            return True
    log.info("滚动后岗位数量和可见内容均未变化：%d", before)
    return False
