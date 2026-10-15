"""三平台巡航调度与投递链入口的回归测试。

覆盖 2026-10-13 的两起 GUI 实测事故：
1. liepin/job51 的 ``apply.run()`` 首行 UnboundLocalError——局部集合
   ``sent_companies`` 同名遮蔽导入的 ledger 函数，链启动即崩
   （终端实测：``cannot access local variable 'sent_companies'``）；
2. runtime 调度强制把 BOSS 塞进任何巡航（``platforms.insert(0, "boss")``）
   ——用户在平台中心只勾猎聘，跑的却是 BOSS 直聘。
"""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture()
def isolated_ledger_logs(tmp_path, monkeypatch):
    """把 liepin/job51 的账本指向临时文件，测试不读不写真实 logs/。"""
    import job51.apply as job51_apply
    import liepin.apply as liepin_apply

    monkeypatch.setattr(liepin_apply, "SENT_LOG", tmp_path / "liepin_sent.jsonl")
    monkeypatch.setattr(liepin_apply, "SEEN_LOG", tmp_path / "liepin_seen.jsonl")
    monkeypatch.setattr(job51_apply, "SENT_LOG", tmp_path / "job51_sent.jsonl")
    monkeypatch.setattr(job51_apply, "SEEN_LOG", tmp_path / "job51_seen.jsonl")
    return tmp_path


# ---------------------------------------------------------------------------
# 事故 1 回归：sent_companies 同名遮蔽 → run() 首行 UnboundLocalError
# ---------------------------------------------------------------------------


def test_liepin_run_no_shadow_crash(isolated_ledger_logs, monkeypatch):
    """猎聘链入口必须能跑完一轮（曾首行 UnboundLocalError 崩溃）。"""
    import liepin.apply as liepin_apply
    import liepin.driver as liepin_driver

    class _FakeTab:
        pass

    async def fake_open_browser(url):
        return _FakeTab()

    async def fake_is_logged_in(tab=None):
        return True

    async def fake_goto_search(tab, kw):
        return []

    monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(liepin_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(liepin_driver, "goto_search", fake_goto_search)
    # 关键词间 15~30s 拟人停顿不能拖慢测试
    monkeypatch.setattr(liepin_apply.asyncio, "sleep", _instant_sleep)

    # 修复前：下一行抛 UnboundLocalError（sent_companies 局部遮蔽）
    result = asyncio.run(
        liepin_apply.run(["AI Agent"], 5, "您好，我对这个岗位很感兴趣，期待与您沟通。")
    )
    assert result == 0


def test_job51_run_no_shadow_crash(isolated_ledger_logs, monkeypatch):
    """51job 链入口必须能跑完一轮（与猎聘同款遮蔽 bug）。"""
    import job51.apply as job51_apply
    import job51.driver as job51_driver

    class _FakeTab:
        pass

    async def fake_open_browser(url):
        return _FakeTab()

    async def fake_is_logged_in(tab=None):
        return True

    async def fake_goto_search(tab, kw):
        return None

    async def fake_parse_cards(tab):
        return []

    async def fake_next_page(tab):
        return False

    monkeypatch.setattr(job51_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(job51_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(job51_driver, "goto_search", fake_goto_search)
    monkeypatch.setattr(job51_driver, "parse_cards", fake_parse_cards)
    monkeypatch.setattr(job51_driver, "next_page", fake_next_page)
    # 关键词间 15~30s 拟人停顿不能拖慢测试
    monkeypatch.setattr(job51_apply.asyncio, "sleep", _instant_sleep)

    # 修复前：下一行抛 UnboundLocalError（sent_companies 局部遮蔽）
    result = asyncio.run(job51_apply.run(["AI Agent"], 5))
    assert result == 0


def test_liepin_company_dedup_survives_shadow_fix(isolated_ledger_logs, monkeypatch):
    """遮蔽修复后公司去重语义不回退：同公司第二个岗位要被跳过。"""
    import liepin.apply as liepin_apply
    import liepin.driver as liepin_driver

    cards_page1 = [
        {
            "jobId": "job-1",
            "href": "https://www.liepin.com/job/job-1.shtml",
            "title": "AI Agent 工程师",
            "company": "示例科技",
            "salary": "20-30k",
            "location": "深圳",
        },
        {
            "jobId": "job-2",
            "href": "https://www.liepin.com/job/job-2.shtml",
            "title": "大模型算法工程师",
            "company": "示例科技",  # 同公司 → 应被 company_dedup 跳过
            "salary": "25-35k",
            "location": "上海",
        },
    ]
    searched: list[str] = []

    class _FakeTab:
        pass

    async def fake_open_browser(url):
        return _FakeTab()

    async def fake_is_logged_in(tab=None):
        return True

    async def fake_goto_search(tab, kw):
        searched.append(kw)
        return list(cards_page1)

    sent_titles: list[str] = []

    async def fake_click_chat(tab, greeting=""):
        sent_titles.append("sent")
        return "sent"

    async def fake_open_detail(tab, href):
        return None

    async def fake_detail_company(tab):
        return ""

    monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(liepin_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(liepin_driver, "goto_search", fake_goto_search)
    monkeypatch.setattr(liepin_driver, "click_chat", fake_click_chat)
    monkeypatch.setattr(liepin_driver, "open_detail", fake_open_detail)
    monkeypatch.setattr(liepin_driver, "detail_company", fake_detail_company)
    # 拟人化 40~80s 节流不能拖慢测试
    monkeypatch.setattr(liepin_apply.asyncio, "sleep", _instant_sleep)

    result = asyncio.run(
        liepin_apply.run(["AI Agent"], 5, "您好，我对这个岗位很感兴趣，期待与您沟通。")
    )
    assert result == 1  # 只发了第一个岗位
    assert sent_titles == ["sent"]


async def _instant_sleep(seconds):
    return None


# ---------------------------------------------------------------------------
# 事故 2 回归：平台调度必须严格按勾选跑，不得强制插入 BOSS
# ---------------------------------------------------------------------------


def _make_config(**overrides):
    from boss_zhipin.tauri.commands.runtime import RunConfig

    base = {"usr_name": "测试用户", "label": "", "profile": "", "platforms": ["boss"]}
    base.update(overrides)
    return RunConfig(**base)


@pytest.fixture()
def dispatch_recorder(monkeypatch):
    """把三平台的真实入口全部换成记录桩，捕获调度决策。"""
    import boss_zhipin.cli as cli_mod
    import job51.apply as job51_apply
    import liepin.apply as liepin_apply
    import liepin.driver as liepin_driver
    from boss_zhipin.tauri.commands import runtime

    calls = {"boss": 0, "liepin": 0, "job51": 0}
    liepin_greetings: list[str] = []

    async def fake_run_automation(**kwargs):
        calls["boss"] += 1

    async def fake_liepin_run(kws, limit, greeting, run_max=None):
        calls["liepin"] += 1
        liepin_greetings.append(greeting)
        assert kws, "猎聘关键词不能为空"
        return 0

    async def fake_job51_run(kws, limit, run_max=None):
        calls["job51"] += 1
        assert kws, "51job 关键词不能为空"
        return 0

    monkeypatch.setattr(cli_mod, "run_automation", fake_run_automation)
    monkeypatch.setattr(liepin_apply, "run", fake_liepin_run)
    monkeypatch.setattr(liepin_driver, "_greeting_text", lambda: "您好，期待沟通。")
    monkeypatch.setattr(job51_apply, "run", fake_job51_run)
    return {"runtime": runtime, "calls": calls, "liepin_greetings": liepin_greetings}


def test_dispatch_liepin_only_skips_boss(dispatch_recorder):
    """只勾猎聘 → 只跑猎聘，绝不夹带 BOSS（2026-10-13 用户实测事故）。"""
    runtime = dispatch_recorder["runtime"]
    factory = runtime._build_main_loop_factory(_make_config(platforms=["liepin"]))
    asyncio.run(factory())
    assert dispatch_recorder["calls"] == {"boss": 0, "liepin": 1, "job51": 0}
    assert dispatch_recorder["liepin_greetings"] == ["您好，期待沟通。"]


def test_dispatch_job51_only_skips_boss(dispatch_recorder):
    """只勾 51job → 只跑 51job。"""
    runtime = dispatch_recorder["runtime"]
    factory = runtime._build_main_loop_factory(_make_config(platforms=["job51"]))
    asyncio.run(factory())
    assert dispatch_recorder["calls"] == {"boss": 0, "liepin": 0, "job51": 1}


def test_dispatch_boss_only_uses_single_path(dispatch_recorder):
    """只勾 BOSS → 单链路 run_automation，不进多平台分支。"""
    runtime = dispatch_recorder["runtime"]
    factory = runtime._build_main_loop_factory(_make_config(platforms=["boss"]))
    asyncio.run(factory())
    assert dispatch_recorder["calls"] == {"boss": 1, "liepin": 0, "job51": 0}


def test_dispatch_all_three_platforms(dispatch_recorder):
    """三平台全勾 → 三条链都跑。"""
    runtime = dispatch_recorder["runtime"]
    factory = runtime._build_main_loop_factory(
        _make_config(platforms=["boss", "liepin", "job51"])
    )
    asyncio.run(factory())
    assert dispatch_recorder["calls"] == {"boss": 1, "liepin": 1, "job51": 1}


def test_dispatch_empty_platforms_defaults_to_boss(dispatch_recorder):
    """前端没传平台（空列表）→ 兜底只跑 BOSS，不静默全跑。"""
    runtime = dispatch_recorder["runtime"]
    factory = runtime._build_main_loop_factory(_make_config(platforms=[]))
    asyncio.run(factory())
    assert dispatch_recorder["calls"] == {"boss": 1, "liepin": 0, "job51": 0}


def test_dispatch_injects_user_keyword_first(dispatch_recorder, monkeypatch):
    """工作台搜索词要注入猎聘/51job 关键词队列首位（三平台意图同步）。"""
    import job51.apply as job51_apply
    import liepin.apply as liepin_apply

    runtime_module = dispatch_recorder["runtime"]
    seen_kws: list[list[str]] = []

    # dispatch_recorder 已把 run 换成记录桩；再包一层 spy 捕获关键词队列
    stub_liepin_run = liepin_apply.run
    stub_job51_run = job51_apply.run

    async def spy_liepin_run(kws, limit, greeting, run_max=None):
        seen_kws.append(list(kws))
        return await stub_liepin_run(kws, limit, greeting, run_max=run_max)

    async def spy_job51_run(kws, limit, run_max=None):
        seen_kws.append(list(kws))
        return await stub_job51_run(kws, limit, run_max=run_max)

    monkeypatch.setattr(liepin_apply, "run", spy_liepin_run)
    monkeypatch.setattr(job51_apply, "run", spy_job51_run)

    factory = runtime_module._build_main_loop_factory(
        _make_config(platforms=["liepin", "job51"], label="AI Agent 实习")
    )
    asyncio.run(factory())

    assert dispatch_recorder["calls"] == {"boss": 0, "liepin": 1, "job51": 1}
    assert len(seen_kws) == 2
    assert all(kws[0] == "AI Agent 实习" for kws in seen_kws)


def test_liepin_not_logged_in_emits_login_required(isolated_ledger_logs, monkeypatch):
    """猎聘未登录时必须向 GUI 事件流发送 login_required 事件，带 platform=liepin。"""
    import liepin.apply as liepin_apply
    import liepin.driver as liepin_driver
    from boss_zhipin.gui import events

    captured = []
    events.set_emit_callback(captured.append)
    try:
        class _FakeTab:
            pass

        async def fake_open_browser(url):
            return _FakeTab()

        async def fake_is_logged_in(tab=None):
            return False

        monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)
        monkeypatch.setattr(liepin_driver, "is_logged_in", fake_is_logged_in)

        result = asyncio.run(liepin_apply.run(["AI Agent"], 5, "hello"))
        assert result == -1
        assert len(captured) == 1
        assert captured[0].kind == "login_required"
        assert captured[0].payload.get("platform") == "liepin"
        assert "未登录" in captured[0].payload.get("message", "")
    finally:
        events.set_emit_callback(None)


def test_job51_not_logged_in_emits_login_required(isolated_ledger_logs, monkeypatch):
    """51job 未登录时必须向 GUI 事件流发送 login_required 事件，带 platform=job51。"""
    import job51.apply as job51_apply
    import job51.driver as job51_driver
    from boss_zhipin.gui import events

    captured = []
    events.set_emit_callback(captured.append)
    try:
        class _FakeTab:
            pass

        async def fake_open_browser(url):
            return _FakeTab()

        async def fake_is_logged_in(tab=None):
            return False

        monkeypatch.setattr(job51_driver, "open_browser", fake_open_browser)
        monkeypatch.setattr(job51_driver, "is_logged_in", fake_is_logged_in)

        result = asyncio.run(job51_apply.run(["AI Agent"], 5))
        assert result == -1
        assert len(captured) == 1
        assert captured[0].kind == "login_required"
        assert captured[0].payload.get("platform") == "job51"
        assert "未登录" in captured[0].payload.get("message", "")
    finally:
        events.set_emit_callback(None)


# ---------------------------------------------------------------------------
# 满额预检（2026-10-13 用户实测）：今日额度投满后启动巡航，旧逻辑先开
# 浏览器再秒退——用户看到"浏览器开了却一动不动"，也没有任何提醒。
# ---------------------------------------------------------------------------


def _prefill_today_sent(log_path, count):
    """往账本里预填今天的投递记录，模拟"今日额度已投满"。"""
    import json
    from datetime import datetime

    with open(log_path, "w", encoding="utf-8") as f:
        for i in range(count):
            f.write(
                json.dumps(
                    {
                        "ts": datetime.now().isoformat(),
                        "job_id": f"prefill-{i}",
                        "sent": True,
                    }
                )
                + "\n"
            )


def test_job51_quota_exhausted_skips_browser_and_notifies(isolated_ledger_logs, monkeypatch):
    """51job 今日满额：不开浏览器 + 发 platform_limit_reached 事件提醒用户。"""
    import job51.apply as job51_apply
    import job51.driver as job51_driver
    from boss_zhipin.gui import events

    _prefill_today_sent(job51_apply.SENT_LOG, 5)

    captured = []
    events.set_emit_callback(captured.append)
    try:
        opened = []

        async def fake_open_browser(url):
            opened.append(url)
            raise AssertionError("满额时不应打开浏览器")

        monkeypatch.setattr(job51_driver, "open_browser", fake_open_browser)

        result = asyncio.run(job51_apply.run(["AI Agent"], 5))
        assert result == 0
        assert opened == []
        limit_events = [
            e for e in captured if e.kind == "platform_limit_reached"
        ]
        assert len(limit_events) == 1
        assert limit_events[0].payload.get("platform") == "job51"
        assert "已投满" in limit_events[0].payload.get("message", "")
        assert "未打开浏览器" in limit_events[0].payload.get("message", "")
    finally:
        events.set_emit_callback(None)


def test_liepin_quota_exhausted_skips_browser_and_notifies(isolated_ledger_logs, monkeypatch):
    """猎聘今日满额：不开浏览器 + 发 platform_limit_reached 事件提醒用户。"""
    import liepin.apply as liepin_apply
    import liepin.driver as liepin_driver
    from boss_zhipin.gui import events

    _prefill_today_sent(liepin_apply.SENT_LOG, 5)

    captured = []
    events.set_emit_callback(captured.append)
    try:
        opened = []

        async def fake_open_browser(url):
            opened.append(url)
            raise AssertionError("满额时不应打开浏览器")

        monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)

        result = asyncio.run(liepin_apply.run(["AI Agent"], 5, "hello"))
        assert result == 0
        assert opened == []
        limit_events = [
            e for e in captured if e.kind == "platform_limit_reached"
        ]
        assert len(limit_events) == 1
        assert limit_events[0].payload.get("platform") == "liepin"
        assert "已投满" in limit_events[0].payload.get("message", "")
    finally:
        events.set_emit_callback(None)


def test_quota_not_exhausted_still_opens_browser(isolated_ledger_logs, monkeypatch):
    """额度没用完时行为不变：照常开浏览器跑一轮（回归保护）。"""
    import job51.apply as job51_apply
    import job51.driver as job51_driver

    # 不预填账本（今日 0 投，额度 5）——open_browser 必须被调用
    opened = []

    class _FakeTab:
        pass

    async def fake_open_browser(url):
        opened.append(url)
        return _FakeTab()

    async def fake_is_logged_in(tab=None):
        return False

    async def fake_goto_search(tab, kw):
        return None

    monkeypatch.setattr(job51_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(job51_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(job51_driver, "goto_search", fake_goto_search)
    monkeypatch.setattr(job51_apply.asyncio, "sleep", _instant_sleep)

    result = asyncio.run(job51_apply.run(["AI Agent"], 5))
    assert result == -1  # 未登录返回 -1（预检放行后正常走到登录检查）
    assert len(opened) == 1
