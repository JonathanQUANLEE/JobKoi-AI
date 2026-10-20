"""Tests for delivery robustness: button finding, city URL resolution, and deduplication rollback.

Covers v0.8.0 user-reported issues:
1. 立即沟通按钮未找到 (btn-startchat vs op-btn-chat)
2. 城市匹配 (深圳 -> 101280600, 不落郑州默认)
3. 投递失败回滚 (未投递成功的岗位不进 seen_jobs，第二轮不误报过去已投递)

2026-10-20 审查补强：
- 「继续沟通/网申」按钮必须以 ContactSkipped 异常暴露给调用方（旧版静默
  return 会被当成功虚记已发送）；
- 新增 runner 级回归测试：发送失败 → seen 不落盘 → 重启循环后岗位可正常
  重投（用户反馈 Bug 3 的端到端场景）。
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from boss_zhipin import audit, cli
from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, write_response
from boss_zhipin.website_oper.core import browser_session
from boss_zhipin.website_oper.dispatch import loop_actions, loop_modes

FIXED_GREETING = "您好，我是一名计科专业的大三学生，熟悉Go后端和RAG应用开发。"


# ---------------------------------------------------------------------------
# Bug 2：起始 URL 城市代码拼装
# ---------------------------------------------------------------------------


def test_get_start_url_shenzhen_city(monkeypatch):
    """验证求职画像设置为深圳时，起始 URL 包含深圳代码 101280600。"""
    monkeypatch.delenv("BOSS_START_URL", raising=False)
    monkeypatch.setenv("BOSS_LABEL", "AI应用工程师")
    monkeypatch.setenv(
        "BOSS_PAGE_FILTERS_JSON",
        '{"city": {"enabled": true, "values": ["深圳"]}}',
    )
    url = cli.get_start_url()
    assert "city=101280600" in url
    assert "query=AI%E5%BA%94%E7%94%A8%E5%B7%A5%E7%A8%8B%E5%B8%88" in url


def test_get_start_url_multi_city_first(monkeypatch):
    """多城市配置时，首个城市（如广州）代码正确填入初始 URL。"""
    monkeypatch.delenv("BOSS_START_URL", raising=False)
    monkeypatch.setenv("BOSS_LABEL", "全栈开发")
    monkeypatch.setenv(
        "BOSS_PAGE_FILTERS_JSON",
        '{"city": {"enabled": true, "values": ["广州", "深圳"]}}',
    )
    url = cli.get_start_url()
    assert "city=101280100" in url
    assert "query=%E5%85%A8%E6%A0%88%E5%BC%80%E5%8F%91" in url


def test_get_start_url_city_disabled_falls_back(monkeypatch):
    """城市筛选组停用时，URL 不携带 city 参数（尊重用户关闭筛选的意愿）。"""
    monkeypatch.delenv("BOSS_START_URL", raising=False)
    monkeypatch.setenv("BOSS_LABEL", "AI应用工程师")
    monkeypatch.setenv(
        "BOSS_PAGE_FILTERS_JSON",
        '{"city": {"enabled": false, "values": ["深圳"]}}',
    )
    url = cli.get_start_url()
    assert "city=" not in url


# ---------------------------------------------------------------------------
# Bug 1：按钮状态安全网 —— ContactSkipped 契约（2026-10-20 审查修复）
# ---------------------------------------------------------------------------


def test_click_contact_already_contacted_raises_contact_skipped(monkeypatch):
    """按钮显示「继续沟通」时抛 ContactSkipped(already_contacted)，调用方可按跳过记账。

    旧契约（静默 return 无异常）是缺陷：调用方无法区分「已发送」与「安全跳过」，
    会把已沟通岗位虚记为已投递（计数+1、sent 账本污染、份额虚耗）。
    """

    async def scenario():
        monkeypatch.setattr(
            finding_jobs,
            "get_text_by_css",
            lambda selector, timeout=3: asyncio.sleep(0, result="继续沟通"),
        )
        with pytest.raises(loop_actions.ContactSkipped) as exc_info:
            await loop_actions.click_contact_and_send_response("招呼语")
        assert exc_info.value.reason == "already_contacted"
        assert "继续沟通" in exc_info.value.button_text

    asyncio.run(scenario())


def test_click_contact_apply_online_raises_contact_skipped(monkeypatch):
    """按钮显示「立即网申」时抛 ContactSkipped(apply_online)，调用方按跳过记账。"""

    async def scenario():
        monkeypatch.setattr(
            finding_jobs,
            "get_text_by_css",
            lambda selector, timeout=3: asyncio.sleep(0, result="立即网申"),
        )
        with pytest.raises(loop_actions.ContactSkipped) as exc_info:
            await loop_actions.click_contact_and_send_response("招呼语")
        assert exc_info.value.reason == "apply_online"

    asyncio.run(scenario())


def test_click_contact_modern_btn_startchat(monkeypatch):
    """现代 BOSS 的 a.btn-startchat 按钮应能被正确定位并点击（正常发送路径无异常）。"""
    clicked_xpaths = []

    async def fake_get_text(selector, timeout=3):
        return "立即沟通"

    async def fake_click(xpath, timeout=1.5):
        clicked_xpaths.append(xpath)
        if "btn-startchat" in xpath:
            return True
        return False

    monkeypatch.setattr(finding_jobs, "get_text_by_css", fake_get_text)
    monkeypatch.setattr(finding_jobs, "click_by_xpath", fake_click)
    monkeypatch.setattr(
        finding_jobs,
        "click_stay_on_page_if_present",
        lambda timeout=3: asyncio.sleep(0, result=True),
    )

    from boss_zhipin.website_oper.core import limit_guard

    monkeypatch.setattr(limit_guard, "check_platform_limit", lambda: asyncio.sleep(0))

    async def scenario():
        await loop_actions.click_contact_and_send_response("招呼语")
        assert any("btn-startchat" in xp for xp in clicked_xpaths)

    asyncio.run(scenario())


# ---------------------------------------------------------------------------
# ContactSkipped 记账：不虚记已发送（handle_auto_send_job 层）
# ---------------------------------------------------------------------------


class _FakeJob(finding_jobs.JobPosting):
    """loop_modes 落账需要的完整岗位替身（真实 JobPosting 子类）。"""

    def __init__(self):
        super().__init__(
            title="AI 应用工程师",
            description="岗位职责：负责AI应用开发。",
            company="某公司",
        )


def _run_auto_send_with_click(monkeypatch, click_behavior):
    """跑 handle_auto_send_job，点击行为可控，返回 (返回值, 事件列表)。"""
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(loop_actions, "click_contact_and_send_response", click_behavior)
    monkeypatch.setattr(audit, "log_attempt", lambda **kwargs: None)

    async def run():
        return await loop_modes.handle_auto_send_job(
            job_index=1,
            job=_FakeJob(),
            job_description="岗位职责：负责AI应用开发。",
            dedupe_key="fake-key",
            fixed_greeting=FIXED_GREETING,
            dry_run=False,
            sent_log_path=None,
            skipped_log_path=None,
            send_mode="auto",
            details={},
            auto_send_max_sent=10,
            delay_min=0.0,
            delay_max=0.0,
            sent_count=3,
            daily_sent_count=3,
        )

    return asyncio.run(run()), collected


def test_auto_send_contact_skipped_does_not_inflate_sent(monkeypatch):
    """按钮状态跳过（已沟通/网申）绝不虚记已发送：计数不变、无 letter_sent 事件。"""

    async def click_already_contacted(response):
        raise loop_actions.ContactSkipped("already_contacted", "继续沟通")

    (should_stop, sent, daily), collected = _run_auto_send_with_click(
        monkeypatch, click_already_contacted
    )

    assert should_stop is False  # 主循环继续下一岗位
    assert sent == 3 and daily == 3  # 没有虚记投递
    assert not any(kind == "letter_sent" for kind, _ in collected)
    assert any(
        kind == "job_skipped" and p.get("reason") == "already_contacted"
        for kind, p in collected
    )
    # 不应触发守护自愈（ContactSkipped 不是聊天链路故障）
    assert not any(kind == "agent_intervene" for kind, _ in collected)


def test_auto_send_apply_online_skip_does_not_inflate_sent(monkeypatch):
    """网申岗位跳过同样不虚记已发送。"""

    async def click_apply_online(response):
        raise loop_actions.ContactSkipped("apply_online", "立即网申")

    (should_stop, sent, daily), collected = _run_auto_send_with_click(
        monkeypatch, click_apply_online
    )

    assert should_stop is False
    assert sent == 3 and daily == 3
    assert not any(kind == "letter_sent" for kind, _ in collected)
    assert any(
        kind == "job_skipped" and p.get("reason") == "apply_online"
        for kind, p in collected
    )


# ---------------------------------------------------------------------------
# Bug 3 端到端回归：发送失败 → seen 不落盘 → 重启循环后正常重投
# ---------------------------------------------------------------------------


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            records.append(json.loads(line))
    return records


def _patch_loop_browser(monkeypatch):
    """DOM 流全环循环的最小浏览器替身（仿 test_review_send._patch_browser）。"""

    async def noop(*args, **kwargs):
        return None

    async def fast_sleep(*args, **kwargs):
        return None

    async def get_text(selector: str):
        return "立即沟通"

    async def no_scroll():
        return False

    async def no_next_page():
        return False

    async def get_job(index: int):
        if index != 1:
            return None
        return finding_jobs.JobPosting(
            title="AI应用开发实习",
            description="上海 RAG LangChain 大模型应用开发",
        )

    monkeypatch.setattr(finding_jobs, "open_browser_with_options", noop)
    monkeypatch.setattr(finding_jobs, "log_in", noop)
    monkeypatch.setattr(finding_jobs, "select_dropdown_option", noop)
    monkeypatch.setattr(finding_jobs, "get_job_by_index", get_job)
    monkeypatch.setattr(finding_jobs, "get_text_by_css", get_text)
    monkeypatch.setattr(finding_jobs, "scroll_to_load_more_jobs", no_scroll)
    monkeypatch.setattr(finding_jobs, "click_next_page_if_present", no_next_page)
    monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
    monkeypatch.setattr(browser_session, "human_pause", fast_sleep)
    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", fast_sleep)


def _set_loop_env(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
    monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
    monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "5")
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MIN", "0")
    monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MAX", "0")
    monkeypatch.setenv("BOSS_PROFILE_NAME", "backend")
    monkeypatch.setenv("BOSS_SEEN_JOBS_FILE", str(tmp_path / "seen_jobs.jsonl"))
    monkeypatch.setenv("BOSS_SENT_LOG_FILE", str(tmp_path / "sent_jobs.jsonl"))
    monkeypatch.setenv("BOSS_SKIPPED_LOG_FILE", str(tmp_path / "skipped_jobs.jsonl"))
    monkeypatch.setenv(
        "BOSS_PROFILE_FILTERS_JSON",
        json.dumps(
            {
                "title": {
                    "required": {"enabled": True, "scope": "title", "keywords": ["实习"]},
                    "any": {"enabled": True, "scope": "title", "keywords": ["AI"]},
                }
            },
            ensure_ascii=False,
        ),
    )


def test_send_failure_rolls_back_seen_and_retry_succeeds(monkeypatch, tmp_path):
    """用户实测 Bug 3 的端到端回归。

    第一轮：发送失败（聊天链路异常自愈跳过）→ 岗位绝不写入 seen_jobs.jsonl；
    第二轮：重启循环 → 同一岗位不被误判 duplicate，重试并真实发送成功。
    """
    _set_loop_env(monkeypatch, tmp_path)
    seen_file = tmp_path / "seen_jobs.jsonl"
    sent_file = tmp_path / "sent_jobs.jsonl"
    skipped_file = tmp_path / "skipped_jobs.jsonl"

    events_run1: list[tuple[str, dict]] = []
    events_run2: list[tuple[str, dict]] = []

    def _run_once(events_collector, click_behavior):
        _patch_loop_browser(monkeypatch)
        monkeypatch.setattr(
            gui_events,
            "emit",
            lambda kind, **payload: events_collector.append((kind, payload)),
        )
        monkeypatch.setattr(audit, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(loop_actions, "click_contact_and_send_response", click_behavior)

        async def recover():
            return True

        monkeypatch.setattr(loop_actions, "recover_from_chat_failure", recover)

        async def scenario():
            await write_response.send_job_descriptions_to_chat(
                usr_name="测试",
                url="https://example.test",
                browser_type="chrome",
                label="",
                dry_run=False,
            )

        asyncio.run(scenario())

    # ---- 第一轮：发送失败（模拟 #chat-input 未出现的聊天链路异常）----
    async def failing_click(response):
        raise RuntimeError("chat input (#chat-input) 未找到")

    _run_once(events_run1, failing_click)

    # 核心断言 1：失败的岗位绝不写入 seen 账本（旧版缺陷根因）
    assert _read_jsonl(seen_file) == [], "发送失败的岗位不得写入 seen_jobs.jsonl"
    # 记为自愈跳过
    skipped = _read_jsonl(skipped_file)
    assert any(r.get("reason") == "chat_recovery_skip" for r in skipped)
    # 没有虚记已发送
    assert not any(
        kind == "letter_sent" and p.get("status") == "sent" for kind, p in events_run1
    )

    # ---- 第二轮：重启循环，同一岗位应被重投而非 duplicate 秒跳 ----
    async def success_click(response):
        return None

    _run_once(events_run2, success_click)

    # 核心断言 2：第二轮没有出现 duplicate 误判（Bug 3 的用户可见症状）
    assert not any(
        kind == "job_skipped" and p.get("reason") == "duplicate"
        for kind, p in events_run2
    )
    # 核心断言 3：岗位被真实重投并成功
    assert any(
        kind == "letter_sent" and p.get("status") == "sent" for kind, p in events_run2
    )
    # 成功投递后 seen 账本补记（事务性确认）
    assert any(r.get("job_key") for r in _read_jsonl(seen_file))
    assert any(r.get("status") == "sent" for r in _read_jsonl(sent_file))


def test_dry_run_does_not_burn_seen_ledger(monkeypatch, tmp_path):
    """dry-run 是彩排：演练过的岗位不得写入 seen 账本。

    2026-10-20 审查修复：旧版 `or dry_run` 会把演练岗位烧进 seen_jobs.jsonl，
    用户先 dry-run 预演、后真实巡航时全部岗位被误判 duplicate 秒跳——
    与 Bug 3 同形的新触发路径。
    """
    _set_loop_env(monkeypatch, tmp_path)
    seen_file = tmp_path / "seen_jobs.jsonl"
    sent_file = tmp_path / "sent_jobs.jsonl"
    events: list[tuple[str, dict]] = []

    _patch_loop_browser(monkeypatch)
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: events.append((kind, payload))
    )
    monkeypatch.setattr(audit, "log_attempt", lambda **kwargs: None)

    async def success_click(response):
        return None

    monkeypatch.setattr(loop_actions, "click_contact_and_send_response", success_click)

    async def scenario():
        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=True,
        )

    asyncio.run(scenario())

    # 演练记账存在（dry_run 事件/日志），但 seen 账本必须干净
    assert any(
        kind == "letter_sent" and p.get("status") == "dry_run" for kind, p in events
    )
    assert _read_jsonl(seen_file) == [], "dry-run 演练不得写入 seen_jobs.jsonl"
