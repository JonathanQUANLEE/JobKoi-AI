"""浏览器验活与死引用清理（2026-10-12 关浏览器事故的回归测试）。

事故回放：用户中途手关浏览器 → 上一轮巡航从 API 流翻页异常路径退出、
``_browser``/``_tab`` 死引用残留 → 下一轮入口只看"引用是否存在"就复用
死会话 → 新浏览器永远不开、筛选瞬间全失败、DOM 流空转成僵尸。
"""
from __future__ import annotations

import asyncio

import pytest

from boss_zhipin.website_oper import write_response


class _FakeBrowser:
    """最小 Browser 替身：只实现 is_browser_alive 依赖的 ``stopped`` 属性。"""

    def __init__(self, stopped: bool = False, raise_on_stopped: bool = False):
        self._stopped = stopped
        self._raise = raise_on_stopped

    @property
    def stopped(self) -> bool:
        if self._raise:
            raise RuntimeError("stopped 探测炸了")
        return self._stopped


def _mock_common_browser_flow(monkeypatch, *, get_job) -> None:
    """把主循环跑通所需的最小浏览器交互 mock（全走 DOM 流、快速结束）。"""
    fj = write_response.finding_jobs

    async def noop(*args, **kwargs):
        return None

    async def fast_sleep(delay: float):
        return None

    async def no_scroll():
        return False

    async def no_next_page():
        return False

    async def no_navigate():
        return False

    async def no_reload(url_param: str = ""):
        return False

    async def zero_loaded_count():
        return 0

    monkeypatch.setattr(fj, "log_in", noop)
    monkeypatch.setattr(fj, "apply_page_filters", noop)
    monkeypatch.setattr(fj, "select_dropdown_option", noop)
    monkeypatch.setattr(fj, "get_current_url", lambda: "")
    monkeypatch.setattr(fj, "get_job_by_index", get_job)
    monkeypatch.setattr(fj, "scroll_to_load_more_jobs", no_scroll)
    monkeypatch.setattr(fj, "click_next_page_if_present", no_next_page)
    monkeypatch.setattr(fj, "navigate_next_search_page", no_navigate)
    monkeypatch.setattr(fj, "reload_current_page", no_reload)
    monkeypatch.setattr(fj, "get_loaded_job_count", zero_loaded_count)
    monkeypatch.setattr(fj, "captcha_visible", no_scroll)
    monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)


# ---------- is_browser_alive 单测 ----------


def test_is_browser_alive_false_when_no_browser(monkeypatch):
    monkeypatch.setattr(write_response.finding_jobs, "_browser", None)
    monkeypatch.setattr(write_response.finding_jobs, "_tab", None)

    assert write_response.finding_jobs.is_browser_alive() is False


def test_is_browser_alive_false_when_process_exited(monkeypatch):
    # 用户手关窗口 → Chrome 进程退出 → stopped=True
    monkeypatch.setattr(
        write_response.finding_jobs, "_browser", _FakeBrowser(stopped=True)
    )

    assert write_response.finding_jobs.is_browser_alive() is False


def test_is_browser_alive_true_when_process_running(monkeypatch):
    monkeypatch.setattr(
        write_response.finding_jobs, "_browser", _FakeBrowser(stopped=False)
    )

    assert write_response.finding_jobs.is_browser_alive() is True


def test_is_browser_alive_false_when_probe_raises(monkeypatch):
    # 验活探测本身炸了 → 按"已死"处理：宁可重开，不可复用死引用
    monkeypatch.setattr(
        write_response.finding_jobs,
        "_browser",
        _FakeBrowser(raise_on_stopped=True),
    )

    assert write_response.finding_jobs.is_browser_alive() is False


# ---------- 入口验活：死引用必须清理后全新启动 ----------


def test_run_recovers_from_stale_dead_session(monkeypatch):
    """复现用户事故：死引用残留 → 入口必须 shutdown 清理 + 全新 open(url)。"""

    async def scenario():
        fj = write_response.finding_jobs
        calls: list = []

        # 上一轮巡航遗留的死引用：进程已退出，但 _browser/_tab 还挂在模块上
        monkeypatch.setattr(fj, "_browser", _FakeBrowser(stopped=True))
        monkeypatch.setattr(fj, "_tab", object())

        async def fake_shutdown():
            calls.append("shutdown")
            monkeypatch.setattr(fj, "_browser", None)
            monkeypatch.setattr(fj, "_tab", None)

        async def fake_open(url_target: str, browser: str):
            calls.append(("open", url_target, browser))
            # 与其他 DOM 测试一致：mock 的 open 不设置 _tab（had_live_browser=False）

        async def no_job(index: int):
            return None

        monkeypatch.setattr(fj, "shutdown", fake_shutdown)
        monkeypatch.setattr(fj, "open_browser_with_options", fake_open)
        monkeypatch.setattr(fj, "ensure_current_tab", fake_shutdown)
        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        _mock_common_browser_flow(monkeypatch, get_job=no_job)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test/start",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        # 死引用被清理 + 用画像起始页全新启动；绝不 ensure_current_tab 复用死页
        assert calls == ["shutdown", ("open", "https://example.test/start", "chrome")]

    asyncio.run(scenario())


def test_run_reuses_live_current_page(monkeypatch):
    """浏览器活着 → 保持原行为：复用当前页（手动筛选流程），不开新浏览器。"""

    async def scenario():
        fj = write_response.finding_jobs
        calls: list = []

        monkeypatch.setattr(fj, "_browser", _FakeBrowser(stopped=False))
        monkeypatch.setattr(fj, "_tab", object())

        async def fake_ensure():
            calls.append("ensure_current_tab")

        async def fake_open(url_target: str, browser: str):
            calls.append(("open", url_target))

        async def no_job(index: int):
            return None

        async def selected_index():
            return 1

        monkeypatch.setattr(fj, "ensure_current_tab", fake_ensure)
        monkeypatch.setattr(fj, "open_browser_with_options", fake_open)
        monkeypatch.setattr(fj, "get_selected_job_index", selected_index)
        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        _mock_common_browser_flow(monkeypatch, get_job=no_job)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test/start",
            browser_type="chrome",
            label="",
            dry_run=False,
            use_current_page=True,
        )

        assert calls[0] == "ensure_current_tab"
        assert all(not isinstance(c, tuple) or c[0] != "open" for c in calls)

    asyncio.run(scenario())


# ---------- 巡航中浏览器死亡：主循环干净中止 ----------


def test_dom_loop_aborts_when_browser_dies_mid_run(monkeypatch):
    """巡航中用户手关浏览器 → 下一轮验活失败 → RuntimeError 干净中止（不僵尸空转）。"""

    async def scenario():
        fj = write_response.finding_jobs

        monkeypatch.setattr(fj, "_browser", _FakeBrowser(stopped=False))
        monkeypatch.setattr(fj, "_tab", object())
        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")

        async def no_job(index: int):
            return None

        async def scroll_and_kill_browser():
            # 模拟滚动等待期间用户关掉浏览器：连接断开 → shutdown() 清空引用
            monkeypatch.setattr(fj, "_browser", None)
            monkeypatch.setattr(fj, "_tab", None)
            return False

        _mock_common_browser_flow(monkeypatch, get_job=no_job)
        # 覆盖公共 mock 的 scroll：死亡时机就藏在第一次滚动里
        monkeypatch.setattr(fj, "scroll_to_load_more_jobs", scroll_and_kill_browser)

        with pytest.raises(RuntimeError, match="浏览器已关闭"):
            await write_response.send_job_descriptions_to_chat(
                usr_name="测试",
                url="https://example.test/start",
                browser_type="chrome",
                label="",
                dry_run=False,
            )

    asyncio.run(scenario())
