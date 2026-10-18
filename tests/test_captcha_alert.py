"""验证码强提醒 + 窗口保留 + JD 超时降级回归测试（2026-10-18 用户实测需求）。

事故/需求回放：
1. 16:00 实测：详情页 JD 提取 ``asyncio.wait_for`` 超时（页面被验证码/风控
   JS 卡住，evaluate 先报 5s 超时），``TimeoutError`` 直接穿透到
   ``runner._wrap`` 把整轮巡航打死。修复后：超时 = 本岗位按标题筛选继续。
2. 19:55 实测：检出验证码后巡航停机，但 ``runner._wrap`` 的 finally 立刻
   自动关浏览器——用户根本来不及完成验证。修复后：验证码停机时强制前置
   浏览器窗口 + 保留窗口（不自动关）。

覆盖：
1. JD 提取超时不再穿透，岗位降级为按标题筛选继续；
2. ``_notify_captcha_needs_user`` 登记保留 + 广播 needs_user_action；
3. ``browser_retention`` 语义（登记/查询/复位）；
4. ``runner._wrap`` 收尾时按平台跳过 shutdown。
"""

from __future__ import annotations

import asyncio

from boss_zhipin.gui import browser_retention, runner
from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.dispatch import search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"


def _api_job(eid: str) -> dict:
    return {
        "encryptJobId": eid,
        "jobName": "AI 应用工程师",
        "brandName": "某公司",
        "cityName": "深圳",
        "salaryDesc": "15-25K",
        "jobDegree": "本科",
    }


def _ret(value):
    async def _impl(*args, **kwargs):
        return value

    return _impl()


# ---------------------------------------------------------------------------
# 1. JD 提取超时 → 降级为按标题筛选，不再打死整轮
# ---------------------------------------------------------------------------


def _run_single_job(monkeypatch, *, jd_impl):
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(
        finding_jobs, "get_text_by_css", lambda selector, timeout=3: _ret("立即沟通")
    )
    monkeypatch.setattr(
        search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _ret(True)
    )
    monkeypatch.setattr(search_api_flow, "_extract_detail_jd", jd_impl)
    monkeypatch.setattr(finding_jobs, "captcha_visible", lambda: _ret(False))
    from boss_zhipin.website_oper.core import browser_session

    monkeypatch.setattr(browser_session, "human_pause", lambda a, b: _ret(None))

    async def run():
        return await search_api_flow._process_single_api_job(
            api_job=job_api.parse_api_job(_api_job("e-timeout")),
            seen_job_keys=set(),
            seen_jobs_path=None,
            sent_log_path=None,
            skipped_log_path=None,
            filters={},
            boss_active_filter_enabled=False,
            stop_on_captcha=False,
            scan_only=False,
            dry_run=True,
            greeting=GREETING,
            sent_count=0,
            daily_sent_count=0,
            delay_min=0.1,
            delay_max=0.2,
            jd_health={},
        )

    return asyncio.run(run()), collected


def test_jd_timeout_degrades_instead_of_crashing(monkeypatch):
    """JD 提取超时：岗位按标题筛选继续（dry_run 正常走完），不抛异常。

    用 0.05s 超时 + 慢 JD 实现，避免真实空等 20 秒拖慢套件
    （2026-10-18 审查指出）。降级语义与生产 20s 完全相同。
    """
    real_wait_for = asyncio.wait_for

    async def short_wait_for(aw, timeout):
        # 只缩短 JD 提取这处的超时；其它 wait_for（如发送 120s）保持原值。
        if timeout == 20:
            timeout = 0.05
        return await real_wait_for(aw, timeout=timeout)

    monkeypatch.setattr(search_api_flow.asyncio, "wait_for", short_wait_for)

    async def slow_jd():
        await asyncio.sleep(60)
        return ""

    (status, _, _), _ = _run_single_job(monkeypatch, jd_impl=slow_jd)
    assert status == "dry_run"


# ---------------------------------------------------------------------------
# 2. 验证码通知：登记保留 + needs_user_action 事件
# ---------------------------------------------------------------------------


def test_captcha_notify_requests_retention_and_emits(monkeypatch):
    browser_retention.reset()
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )

    async def no_focus(platform):
        return False

    # 注意：_notify_captcha_needs_user 内部是函数内 import
    # （``from ... import focus_platform_browser``），所以必须 patch
    # 源模块属性，patch search_api_flow 上的名字是空操作（2026-10-18 审查）。
    monkeypatch.setattr(
        "boss_zhipin.website_oper.core.window_focus.focus_platform_browser", no_focus
    )

    asyncio.run(search_api_flow._notify_captcha_needs_user("测试岗位"))

    assert browser_retention.should_keep_open("boss") is True
    captcha_events = [p for k, p in collected if k == "captcha_stopped"]
    assert len(captcha_events) == 1
    assert captcha_events[0]["needs_user_action"] is True
    assert captcha_events[0]["platform"] == "boss"
    browser_retention.reset()


# ---------------------------------------------------------------------------
# 3. browser_retention 语义
# ---------------------------------------------------------------------------


def test_browser_retention_lifecycle():
    browser_retention.reset()
    assert not browser_retention.should_keep_open("boss")
    browser_retention.request_keep_open("boss")
    browser_retention.request_keep_open("liepin")
    assert browser_retention.should_keep_open("boss")
    assert browser_retention.should_keep_open("liepin")
    assert not browser_retention.should_keep_open("job51")
    browser_retention.reset()
    assert not browser_retention.should_keep_open("boss")


# ---------------------------------------------------------------------------
# 4. runner 收尾：验证码停机时跳过 shutdown
# ---------------------------------------------------------------------------


def test_runner_keeps_browser_on_captcha(monkeypatch):
    """登记保留后，_wrap 收尾不得调用 finding_jobs.shutdown()。"""
    browser_retention.reset()
    browser_retention.request_keep_open("boss")

    shut_calls: list[str] = []

    async def fake_shutdown():
        shut_calls.append("boss")

    class _FakeBrowser:
        pass

    monkeypatch.setattr(finding_jobs, "_browser", _FakeBrowser())
    monkeypatch.setattr(finding_jobs, "shutdown", fake_shutdown)

    async def quick():
        return None

    asyncio.run(runner._wrap(quick()))

    assert shut_calls == []
    # _wrap 收尾会 reset 登记，确保下一轮不被污染
    assert not browser_retention.should_keep_open("boss")


# ---------------------------------------------------------------------------
# 5. 多平台路径：猎聘/51job 验证码保留（2026-10-18 审查发现的严重盲区）
# ---------------------------------------------------------------------------


def _import_runtime():
    """runtime 模块依赖 pytauri，测试环境可能缺失——缺失则跳过。"""
    try:
        from boss_zhipin.tauri.commands import runtime
    except Exception:  # noqa: BLE001 — 缺 pytauri 时该用例不适用
        import pytest

        pytest.skip("pytauri 不可用，跳过多平台路径测试")
    return runtime


def test_multi_platform_liepin_keeps_browser_on_captcha(monkeypatch):
    """猎聘验证码保留：多平台关闭函数必须跳过 shutdown。"""
    runtime = _import_runtime()
    browser_retention.reset()
    browser_retention.request_keep_open("liepin")

    shut_calls: list[str] = []

    import liepin.driver as liepin_driver

    async def fake_shutdown():
        shut_calls.append("liepin")

    monkeypatch.setattr(liepin_driver, "_browser", object())
    monkeypatch.setattr(liepin_driver, "shutdown", fake_shutdown)

    asyncio.run(runtime.close_platform_browser("liepin"))

    assert shut_calls == []
    browser_retention.reset()


def test_multi_platform_job51_closes_without_captcha(monkeypatch):
    """无验证码登记时，51job 链结束照常关浏览器（零回归）。"""
    runtime = _import_runtime()
    browser_retention.reset()

    shut_calls: list[str] = []

    import job51.driver as job51_driver

    async def fake_shutdown():
        shut_calls.append("job51")

    monkeypatch.setattr(job51_driver, "_browser", object())
    monkeypatch.setattr(job51_driver, "shutdown", fake_shutdown)

    asyncio.run(runtime.close_platform_browser("job51"))

    assert shut_calls == ["job51"]
