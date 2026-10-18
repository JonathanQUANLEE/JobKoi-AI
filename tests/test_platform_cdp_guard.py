"""猎聘/51job 驱动防挂死护栏测试（2026-10-19 三平台统一加固）。

事故背景（BOSS api-flow 实测根因，2026-10-18 修复后本组测试把它
推广到猎聘/51job）：页面 renderer 被风控 JS 卡死时，nodriver 的 CDP
调用（evaluate/get/find/click）挂起永不返回，裸 await 会把整轮巡航
挂死（浏览器假死 + 软件死寂 + 停止按钮无效）。

修复后契约（cdp_call 就地降级语义）：
- parse_cards / goto_search  → 超时返回 []（本轮按 0 岗位降级）
- open_detail               → 超时返回 False（岗位跳过）
- click_chat                → 超时返回 "failed: ..."（岗位跳过，不炸轮）
- apply_by_jobid            → 超时返回 {"clicked": False}（岗位跳过）
- next_page                 → 超时返回 False（按无下一页降级）
- apply.run() 端到端        → CDP 全程假死时优雅跑完返回 0，绝不挂死

测试技巧：_HungTab 模拟假死通道（所有 CDP 调用挂 3600s）；用 fast
版 cdp_call（timeout 钳到 0.3s）让用例毫秒级跑完，语义与生产同构。
"""
from __future__ import annotations

import asyncio

import job51.driver as job51_driver
import liepin.driver as liepin_driver
from boss_zhipin.website_oper.core.cdp_guard import cdp_call as real_cdp_call


def _install_fast_cdp(monkeypatch, *modules):
    """把各驱动里的 cdp_call 换成毫秒级快速版（语义同构：超时→TimeoutError）。"""

    def fast_cdp(coro, *, timeout, grace=None, label=""):
        return real_cdp_call(coro, timeout=min(timeout, 0.3), grace=0.1, label=label)

    for mod in modules:
        monkeypatch.setattr(mod, "cdp_call", fast_cdp)


class _HungTab:
    """模拟 CDP 通道假死：所有 nodriver 调用永不返回。

    注意：不能用 asyncio.sleep(3600) 模拟挂死——用例里的 _fast_sleep
    会 patch 全局 asyncio.sleep（asyncio 是全局单例模块），把挂死也
    一并解除。改用 Event().wait()：不受 sleep patch 影响、真正挂起。
    """

    async def _hang(self) -> None:
        await asyncio.Event().wait()

    async def evaluate(self, _js=None):
        await self._hang()

    async def get(self, _url=None):
        await self._hang()

    async def find(self, *_a, **_kw):
        await self._hang()

    async def select(self, *_a, **_kw):
        await self._hang()

    async def click(self, *_a, **_kw):
        await self._hang()

    async def send(self, *_a, **_kw):
        await self._hang()


def _fast_sleep(monkeypatch, *modules):
    """拟人停顿秒回（human_pause 内部走 asyncio.sleep）。"""
    for mod in modules:
        monkeypatch.setattr(mod.asyncio, "sleep", _quick_sleep)


async def _quick_sleep(_seconds):
    return None


# ---------------------------------------------------------------------------
# 猎聘：driver 层逐函数降级
# ---------------------------------------------------------------------------


def test_liepin_parse_cards_hung_returns_empty(monkeypatch):
    """卡片解析挂死 → 空列表降级（不炸轮）。"""
    _install_fast_cdp(monkeypatch, liepin_driver)
    assert asyncio.run(liepin_driver.parse_cards(_HungTab())) == []


def test_liepin_goto_search_hung_returns_empty(monkeypatch):
    """搜索导航挂死 → 本词 0 岗位降级，且不抛封禁/异常。"""
    _install_fast_cdp(monkeypatch, liepin_driver)
    _fast_sleep(monkeypatch, liepin_driver)
    result = asyncio.run(liepin_driver.goto_search(_HungTab(), "AI Agent"))
    assert result == []


def test_liepin_open_detail_hung_returns_false(monkeypatch):
    """详情页导航挂死 → False（apply 层按岗位跳过）。"""
    _install_fast_cdp(monkeypatch, liepin_driver)
    _fast_sleep(monkeypatch, liepin_driver)
    assert asyncio.run(liepin_driver.open_detail(_HungTab(), "https://x")) is False


def test_liepin_click_chat_hung_returns_failed(monkeypatch):
    """聊一聊按钮查找/点击挂死 → "failed: ..."（岗位跳过，不炸轮）。"""
    _install_fast_cdp(monkeypatch, liepin_driver)
    _fast_sleep(monkeypatch, liepin_driver)
    result = asyncio.run(liepin_driver.click_chat(_HungTab(), "您好"))
    assert isinstance(result, str) and result.startswith("failed:")


# ---------------------------------------------------------------------------
# 51job：driver 层逐函数降级
# ---------------------------------------------------------------------------


def test_job51_parse_cards_hung_returns_empty(monkeypatch):
    """卡片解析挂死 → 空列表降级。"""
    _install_fast_cdp(monkeypatch, job51_driver)
    assert asyncio.run(job51_driver.parse_cards(_HungTab())) == []


def test_job51_goto_search_hung_returns_empty(monkeypatch):
    """搜索导航挂死 → 本词 0 岗位降级。"""
    _install_fast_cdp(monkeypatch, job51_driver)
    _fast_sleep(monkeypatch, job51_driver)
    assert asyncio.run(job51_driver.goto_search(_HungTab(), "AI Agent")) == []


def test_job51_apply_by_jobid_hung_skips_job(monkeypatch):
    """投递点击挂死 → clicked=False（岗位跳过；绝不挂死投递链）。"""
    _install_fast_cdp(monkeypatch, job51_driver)
    result = asyncio.run(job51_driver.apply_by_jobid(_HungTab(), "j123"))
    assert result == {"clicked": False}


def test_job51_next_page_hung_returns_false(monkeypatch):
    """翻页挂死 → 按无下一页降级（结束本词翻页）。"""
    _install_fast_cdp(monkeypatch, job51_driver)
    assert asyncio.run(job51_driver.next_page(_HungTab())) is False


def test_job51_dismiss_dialogs_hung_return_none(monkeypatch):
    """弹窗关闭挂死 → "none"（apply 层按未确认弹窗降级）。"""
    _install_fast_cdp(monkeypatch, job51_driver)
    assert asyncio.run(job51_driver.dismiss_confirm_dialog(_HungTab())) == "none"
    assert asyncio.run(job51_driver.dismiss_success_dialog(_HungTab())) == "none"


# ---------------------------------------------------------------------------
# 端到端：CDP 全程假死时整轮优雅结束（不挂死、不崩溃、事件齐全）
# ---------------------------------------------------------------------------


def test_liepin_run_survives_total_cdp_blackout(monkeypatch, tmp_path):
    """猎聘 apply.run 全程 CDP 假死：整轮必须正常返回 0（旧行为=永久挂死）。"""
    import liepin.apply as liepin_apply

    collected: list[tuple[str, dict]] = []
    _install_fast_cdp(monkeypatch, liepin_driver)

    async def fake_open_browser(url, headless=False):
        return _HungTab()

    async def fake_is_logged_in(tab=None):
        return True

    monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(liepin_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(liepin_apply, "SENT_LOG", tmp_path / "sent.jsonl")
    monkeypatch.setattr(liepin_apply, "SEEN_LOG", tmp_path / "seen.jsonl")
    monkeypatch.setattr(
        liepin_apply.events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(liepin_apply.asyncio, "sleep", _quick_sleep)
    _fast_sleep(monkeypatch, liepin_driver)
    # goto_search 用真函数 + 挂死 tab：导航降级为 0 岗位

    result = asyncio.run(liepin_apply.run(["AI Agent", "大模型"], 10, "您好"))
    assert result == 0
    # 整轮正常收尾（结束汇总事件在），且没有任何岗位被误投
    kinds = [k for k, _ in collected]
    assert "api_flow_finished" in kinds
    assert "job_sent" not in kinds
    assert not (tmp_path / "sent.jsonl").exists()


def test_job51_run_survives_total_cdp_blackout(monkeypatch, tmp_path):
    """51job apply.run 全程 CDP 假死：整轮必须正常返回 0（旧行为=永久挂死）。"""
    import job51.apply as job51_apply

    collected: list[tuple[str, dict]] = []
    _install_fast_cdp(monkeypatch, job51_driver)

    async def fake_open_browser(url, headless=False):
        return _HungTab()

    async def fake_is_logged_in(tab=None):
        return True

    monkeypatch.setattr(job51_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(job51_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(job51_apply, "SENT_LOG", tmp_path / "sent.jsonl")
    monkeypatch.setattr(job51_apply, "SEEN_LOG", tmp_path / "seen.jsonl")
    monkeypatch.setattr(
        job51_apply.events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(job51_apply.asyncio, "sleep", _quick_sleep)
    _fast_sleep(monkeypatch, job51_driver)

    result = asyncio.run(job51_apply.run(["AI Agent", "算法"], 10))
    assert result == 0
    kinds = [k for k, _ in collected]
    assert "api_flow_finished" in kinds
    assert "job_sent" not in kinds
    assert not (tmp_path / "sent.jsonl").exists()
