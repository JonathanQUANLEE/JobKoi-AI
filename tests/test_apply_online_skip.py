"""BOSS「立即网申」岗位识别与安全跳过测试（2026-10-17 守护 Agent P0）。

用户实测痛点：大厂/校招岗的动作按钮是「立即网申」而非「立即沟通」，
点击不会进入聊天页。旧行为的两种事故形态：
1. API 直读流把 btn-startchat 类名的网申按钮当沟通按钮点下去
   （假报 sent + 网申弹窗残留阻塞后续岗位）；
2. DOM 流硬等 #chat-input 50s 超时后抛 RuntimeError，整轮巡航中断。

行为规格：
1. 网申按钮识别（纯函数）：「立即网申」「前往官网投递」→ True；
   「立即沟通」「继续沟通」与空串 → False（保守匹配，宁漏勿误）；
2. API 流：网申岗位 → status=apply_online，记 skip 账本，广播
   job_skipped + agent_intervene 事件，绝不点击按钮；
3. apply_online 不进"连续失败"计数：整页网申岗位不会触发
   "连续 5 个失败提前收工"的误停机；
4. DOM 流 auto 模式：聊天链路 RuntimeError → 守护 Agent 自愈成功
   （回列表）→ 记跳过继续下一岗位，不炸巡航；自愈失败 → 异常照常
   传播（真·浏览器级故障停机是正确行为）。
"""

from __future__ import annotations

import asyncio

from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.dispatch import loop_actions, loop_modes, search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"

ENTRY_URL = "https://www.zhipin.com/web/geek/jobs?query=%E6%B5%8B%E8%AF%95"


def _api_job(eid: str, name: str = "AI 应用工程师") -> dict:
    return {
        "encryptJobId": eid,
        "jobName": name,
        "brandName": "某公司",
        "cityName": "深圳",
        "salaryDesc": "15-25K",
        "jobDegree": "本科",
    }


# ---------------------------------------------------------------------------
# 1. 网申按钮识别（纯函数）
# ---------------------------------------------------------------------------


def test_is_apply_online_button_patterns():
    """网申/官网投递文案命中；正常沟通文案与空串不误伤。"""
    assert loop_actions.is_apply_online_button("立即网申") is True
    assert loop_actions.is_apply_online_button("前往官网投递") is True
    assert loop_actions.is_apply_online_button("  立即网申  ") is True
    # 正常按钮绝不能误判（误判 = 白白放弃可直聊岗位）
    assert loop_actions.is_apply_online_button("立即沟通") is False
    assert loop_actions.is_apply_online_button("继续沟通") is False
    assert loop_actions.is_apply_online_button("继续聊天") is False
    assert loop_actions.is_apply_online_button("") is False
    assert loop_actions.is_apply_online_button(None) is False  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# 2. API 流：网申岗位安全跳过（单岗位级）
# ---------------------------------------------------------------------------


def _run_single_job(monkeypatch, button_text: str):
    """直调 _process_single_api_job：按钮文案可控，返回 (status, 事件流)。"""
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(
        finding_jobs, "get_text_by_css", lambda selector, timeout=3: _async_value(button_text)
    )
    clicks: list[str] = []
    monkeypatch.setattr(
        finding_jobs, "click_by_xpath", lambda xp, timeout=10: _async_value(True, clicks, xp)
    )
    monkeypatch.setattr(
        search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _async_value(True)
    )
    monkeypatch.setattr(
        search_api_flow, "_extract_detail_jd", lambda: _async_value("岗位职责：负责AI应用开发与落地。")
    )
    from boss_zhipin.website_oper.core import browser_session

    monkeypatch.setattr(browser_session, "human_pause", lambda a, b: _async_value(None))

    async def run():
        return await search_api_flow._process_single_api_job(
            api_job=job_api.parse_api_job(_api_job("e-online")),
            seen_job_keys=set(),
            seen_jobs_path=None,
            sent_log_path=None,
            skipped_log_path=None,
            filters={},
            boss_active_filter_enabled=False,
            stop_on_captcha=False,
            scan_only=False,
            dry_run=False,
            greeting=GREETING,
            sent_count=0,
            daily_sent_count=0,
            delay_min=0.1,
            delay_max=0.2,
        )

    status = asyncio.run(run())
    return status, collected, clicks


def _async_value(value, record: list | None = None, tag=None):
    """返回一个已构造好的协程（await 后产出 value；供 lambda 桩直接使用）。"""

    async def _impl(*args, **kwargs):
        if record is not None:
            record.append(tag)
        return value

    return _impl()


def test_api_flow_skips_apply_online_job_without_clicking(monkeypatch):
    """网申按钮（btn-startchat 同类名形态）：返回 apply_online、不点击、双事件广播。"""
    status, collected, clicks = _run_single_job(monkeypatch, "立即网申")

    assert status == ("apply_online", 0, 0)
    # 绝不能点击网申按钮（旧 bug：点下去假报 sent + 弹窗残留）
    assert clicks == []
    # 前端可见：job_skipped（时间轴）+ agent_intervene（守护面板）
    kinds = [(k, p) for k, p in collected]
    assert any(
        k == "job_skipped" and p.get("reason") == "apply_online" for k, p in kinds
    )
    interventions = [p for k, p in kinds if k == "agent_intervene"]
    assert len(interventions) == 1
    assert interventions[0]["action"] == "安全跳过"
    assert interventions[0]["level"] == "info"


def test_api_flow_normal_button_still_sends(monkeypatch):
    """正常「立即沟通」岗位零回归：照旧走点击发送链路（回归保护）。"""
    # 走 dry_run：不真实发送也能验证"没有走网申跳过分支"
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(
        finding_jobs, "get_text_by_css", lambda selector, timeout=3: _async_value("立即沟通")
    )
    monkeypatch.setattr(
        search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _async_value(True)
    )
    monkeypatch.setattr(
        search_api_flow, "_extract_detail_jd", lambda: _async_value("岗位职责：负责AI应用开发与落地。")
    )
    from boss_zhipin.website_oper.core import browser_session

    monkeypatch.setattr(browser_session, "human_pause", lambda a, b: _async_value(None))

    async def run():
        return await search_api_flow._process_single_api_job(
            api_job=job_api.parse_api_job(_api_job("e-normal")),
            seen_job_keys=set(),
            seen_jobs_path=None,
            sent_log_path=None,
            skipped_log_path=None,
            filters={},
            boss_active_filter_enabled=False,
            stop_on_captcha=False,
            scan_only=False,
            dry_run=True,  # dry_run：按钮判定后直接记账，不点按钮
            greeting=GREETING,
            sent_count=0,
            daily_sent_count=0,
            delay_min=0.1,
            delay_max=0.2,
        )

    status = asyncio.run(run())
    assert status == ("dry_run", 1, 0)  # 正常岗位不受网申分支影响
    assert not any(k == "agent_intervene" for k, _ in collected)


# ---------------------------------------------------------------------------
# 3. API 流：整页网申岗位不触发"连续失败误停机"
# ---------------------------------------------------------------------------


def test_full_page_apply_online_jobs_do_not_halt_flow(monkeypatch):
    """8 个岗位全是网申：不触发连续 5 失败熔断，优雅 completed 收尾并分类汇报。"""
    jobs = [job_api.parse_api_job(_api_job(f"e-{i}")) for i in range(8)]
    collected: list[tuple[str, dict]] = []
    sleeps: list[float] = []

    async def fake_fetch(tab, query, page):
        return jobs if page == 1 else []

    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(job_api, "fetch_search_page", fake_fetch)
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object())
    monkeypatch.setattr(search_api_flow, "_state_path", lambda name: None)
    monkeypatch.setattr(search_api_flow, "_profile_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_page_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_sent_today_count", lambda path, profile: 0)
    monkeypatch.setattr(search_api_flow, "_auto_send_max_sent", lambda: 10)
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: 10)
    monkeypatch.setattr(
        search_api_flow.asyncio, "sleep", lambda s: _async_value(None, sleeps, s)
    )

    from boss_zhipin.website_oper.core import browser_session

    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", lambda s, chunk=2.0: _async_value(None, sleeps, s))
    monkeypatch.setattr(browser_session, "human_pause", lambda a, b: _async_value(None, sleeps, a))

    # 每个岗位的详情页按钮都是「立即网申」
    monkeypatch.setattr(
        finding_jobs, "get_text_by_css", lambda selector, timeout=3: _async_value("立即网申")
    )
    monkeypatch.setattr(
        search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _async_value(True)
    )
    monkeypatch.setattr(
        search_api_flow, "_extract_detail_jd", lambda: _async_value("岗位职责：负责AI应用开发与落地。")
    )
    monkeypatch.delenv("BOSS_LABEL", raising=False)

    async def run():
        await search_api_flow._run_search_api_flow(
            usr_name="测试",
            url=ENTRY_URL,
            dry_run=False,
            scan_only=False,
            greeting=GREETING,
        )

    asyncio.run(run())

    summaries = [p for k, p in collected if k == "api_flow_finished"]
    assert len(summaries) == 1
    # 8 个网申岗位全部安全跳过，没有触发"连续失败"误停机
    assert summaries[0]["stop_reason"] == "completed"
    assert summaries[0]["skipped_apply_online"] == 8
    assert summaries[0]["failed"] == 0
    # 没有误报"浏览器卡死提前停止"
    assert not any(k == "api_flow_error" for k, _ in collected)
    # 守护面板收到 8 次介入记录
    assert sum(1 for k, _ in collected if k == "agent_intervene") == 8


# ---------------------------------------------------------------------------
# 4. DOM 流 auto 模式：聊天链路异常自愈（不炸巡航）
# ---------------------------------------------------------------------------


class _FakeJob(finding_jobs.JobPosting):
    """loop_modes 落账需要的完整岗位替身（真实 JobPosting 子类）。"""

    def __init__(self):
        super().__init__(
            title="AI 应用工程师",
            description="岗位职责：负责AI应用开发。",
            company="某公司",
        )


def _run_auto_send(monkeypatch, recover_ok: bool):
    """跑 handle_auto_send_job：点击必抛 RuntimeError，自愈结果可控。"""
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )

    async def fake_click(response):
        raise RuntimeError("chat input (#chat-input) 未找到")

    monkeypatch.setattr(loop_actions, "click_contact_and_send_response", fake_click)
    monkeypatch.setattr(
        loop_actions, "recover_from_chat_failure", lambda: _async_value(recover_ok)
    )

    async def run():
        return await loop_modes.handle_auto_send_job(
            job_index=7,
            job=_FakeJob(),
            job_description="岗位职责：负责AI应用开发。",
            dedupe_key="fake-key",
            fixed_greeting=GREETING,
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


def test_auto_send_recovers_and_continues(monkeypatch):
    """自愈成功：不抛异常、计数不变、广播自愈事件，主循环继续下一岗位。"""
    (should_stop, sent, daily), collected = _run_auto_send(monkeypatch, recover_ok=True)

    assert should_stop is False  # 主循环继续
    assert sent == 3 and daily == 3  # 没有虚记投递
    kinds = [(k, p) for k, p in collected]
    assert any(
        k == "job_skipped" and p.get("reason") == "chat_recovery_skip" for k, p in kinds
    )
    interventions = [p for k, p in kinds if k == "agent_intervene"]
    assert len(interventions) == 1
    assert interventions[0]["level"] == "recovered"
    assert interventions[0]["action"] == "自愈恢复"


def test_auto_send_propagates_when_recovery_fails(monkeypatch):
    """自愈失败（真·浏览器级故障）：异常照常传播触发安全停机。"""
    try:
        _run_auto_send(monkeypatch, recover_ok=False)
        raised = False
    except RuntimeError:
        raised = True
    assert raised, "自愈失败必须让异常传播（浏览器级故障停机是正确行为）"


# ---------------------------------------------------------------------------
# 5. recover_from_chat_failure：三种恢复路径
# ---------------------------------------------------------------------------


def _run_recovery(monkeypatch, *, on_list: bool, back_ok: bool):
    monkeypatch.setattr(
        finding_jobs, "wait_for_css", lambda sel, timeout=50: _async_value(on_list)
    )
    monkeypatch.setattr(
        finding_jobs, "click_stay_on_page_if_present", lambda timeout=3: _async_value(False)
    )
    monkeypatch.setattr(
        finding_jobs, "dismiss_greeting_dialog", lambda timeout=5: _async_value(False)
    )
    monkeypatch.setattr(
        finding_jobs, "return_to_job_list", lambda timeout=12.0, max_attempts=2: _async_value(back_ok)
    )
    return asyncio.run(loop_actions.recover_from_chat_failure())


def test_recovery_when_still_on_list(monkeypatch):
    """页面未漂移（仍在列表页）：直接恢复成功。"""
    assert _run_recovery(monkeypatch, on_list=True, back_ok=False) is True


def test_recovery_via_return_to_list(monkeypatch):
    """离开列表页：清弹窗 + 回列表成功 → 恢复。"""
    assert _run_recovery(monkeypatch, on_list=False, back_ok=True) is True


def test_recovery_failure_returns_false(monkeypatch):
    """回不到列表页：返回 False（调用方应让原异常传播）。"""
    assert _run_recovery(monkeypatch, on_list=False, back_ok=False) is False
