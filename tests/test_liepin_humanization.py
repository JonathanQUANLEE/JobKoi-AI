"""猎聘拟人化改造测试（2026-10-15 封号复盘）。

用户猎聘账号触发「账号行为异常」2 小时临时封禁。网络调研（JobPilot
「Human Actor」技术文 / Apply4Me 安全清单 / 影刀 RPA 社区实测）落地：

1. 高斯停顿 human_pause：钟形分布 + 区间截断（均匀分布也是机器签名）；
2. 封禁页检测：搜索/详情页命中「账号行为异常」→ 立即停止 + 用户可见
   事件（复用 platform_limit_reached 通道，前端常驻横幅）；
3. 逐字符拟人输入 _type_human；
4. 批次休息：连投 5~8 个招呼后休 3~8 分钟。
"""

from __future__ import annotations

import asyncio

import pytest

import liepin.apply as liepin_apply
import liepin.driver as liepin_driver
from liepin.driver import LiepinBannedError

GREETING = "您好，我对这个岗位很感兴趣，期待与您沟通。"


# ---------------------------------------------------------------------------
# 1. 高斯停顿：钟形分布 + 区间截断
# ---------------------------------------------------------------------------


def test_human_pause_clamps_to_range(monkeypatch):
    """高斯采样越界时必须截断回 [low, high]（只慢不快红线不受影响）。"""
    sleeps: list[float] = []

    async def rec_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(liepin_driver.asyncio, "sleep", rec_sleep)
    monkeypatch.setattr(liepin_driver.random, "gauss", lambda mid, sigma: 999.0)
    asyncio.run(liepin_driver.human_pause(10, 20))
    assert sleeps == [20.0]

    monkeypatch.setattr(liepin_driver.random, "gauss", lambda mid, sigma: -5.0)
    asyncio.run(liepin_driver.human_pause(10, 20))
    assert sleeps == [20.0, 10.0]

    monkeypatch.setattr(
        liepin_driver.random, "gauss", lambda mid, sigma: 17.3
    )
    asyncio.run(liepin_driver.human_pause(10, 20))
    assert sleeps == [20.0, 10.0, 17.3]


def test_human_pause_uses_gaussian_not_uniform(monkeypatch):
    """必须走高斯采样（钟形），不能再是均匀分布。"""
    calls: list[tuple[float, float]] = []

    async def rec_sleep(seconds):
        pass

    monkeypatch.setattr(liepin_driver.asyncio, "sleep", rec_sleep)

    def rec_gauss(mid, sigma):
        calls.append((mid, sigma))
        return mid

    monkeypatch.setattr(liepin_driver.random, "gauss", rec_gauss)
    asyncio.run(liepin_driver.human_pause(20, 40))
    # 均值=区间中点，sigma=区间宽/4（JobPilot：自然钟形，非均匀随机）
    assert calls == [(30.0, 5.0)]


# ---------------------------------------------------------------------------
# 2. 封禁页检测
# ---------------------------------------------------------------------------


class _FakeTab:
    def __init__(self, text: str = ""):
        self.text = text
        self.urls: list[str] = []

    async def get(self, url):
        self.urls.append(url)

    async def evaluate(self, _js):
        return self.text


def test_check_ban_page_detects_ban_text():
    """封禁页正文（截图原文）命中关键词 → True；正常搜索结果 → False。"""
    ban_tab = _FakeTab("账号行为异常 您的账号存在异常访问行为，已暂时禁止访问！")
    assert asyncio.run(liepin_driver._check_ban_page(ban_tab)) is True
    normal_tab = _FakeTab("AI Agent 工程师 20-40K·14薪 深圳")
    assert asyncio.run(liepin_driver._check_ban_page(normal_tab)) is False


def test_goto_search_raises_on_ban_page(monkeypatch):
    """搜索页被封禁页顶掉 → 抛 LiepinBannedError（不再静默空转整轮）。"""

    async def rec_sleep(seconds):
        pass

    monkeypatch.setattr(liepin_driver.asyncio, "sleep", rec_sleep)
    tab = _FakeTab("账号行为异常")
    with pytest.raises(LiepinBannedError):
        asyncio.run(liepin_driver.goto_search(tab, "AI Agent"))


def test_run_stops_on_banned_search(monkeypatch, tmp_path):
    """goto_search 抛封禁异常 → 本轮立即停止 + 用户可见封禁事件。"""
    collected: list[tuple[str, dict]] = []

    async def fake_open_browser(url, headless=False):
        return _FakeTab()

    async def fake_is_logged_in(tab=None):
        return True

    async def fake_goto_search(tab, kw):
        raise LiepinBannedError("封禁页")

    monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(liepin_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(liepin_driver, "goto_search", fake_goto_search)
    monkeypatch.setattr(liepin_apply, "SENT_LOG", tmp_path / "sent.jsonl")
    monkeypatch.setattr(liepin_apply, "SEEN_LOG", tmp_path / "seen.jsonl")
    monkeypatch.setattr(
        liepin_apply.events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )

    result = asyncio.run(liepin_apply.run(["AI Agent"], 10, GREETING))
    assert result == 0
    # 用户可见的封禁通知（常驻横幅通道）+ 人话指引
    banned = [p for k, p in collected if k == "platform_limit_reached"]
    assert len(banned) == 1
    assert "临时封禁" in banned[0]["message"]
    assert "稳健档" in banned[0]["message"]


def test_run_stops_on_banned_detail_page(monkeypatch, tmp_path):
    """详情页沟通时返回 "banned" → 立即停止 + 记账 account_banned。"""
    collected: list[tuple[str, dict]] = []
    card = {
        "jobId": "j1",
        "href": "https://www.liepin.com/job/j1.shtml",
        "title": "AI Agent 实习",
        "company": "某公司",
        "salary": "20-30k",
        "location": "深圳",
    }

    async def fake_open_browser(url, headless=False):
        return _FakeTab()

    async def fake_is_logged_in(tab=None):
        return True

    async def fake_goto_search(tab, kw):
        return [card]

    async def fake_open_detail(tab, href):
        pass

    async def fake_detail_company(tab):
        return ""

    async def fake_click_chat(tab, greeting=""):
        return "banned"

    async def rec_sleep(seconds):
        pass

    monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(liepin_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(liepin_driver, "goto_search", fake_goto_search)
    monkeypatch.setattr(liepin_driver, "open_detail", fake_open_detail)
    monkeypatch.setattr(liepin_driver, "detail_company", fake_detail_company)
    monkeypatch.setattr(liepin_driver, "click_chat", fake_click_chat)
    monkeypatch.setattr(liepin_apply, "SENT_LOG", tmp_path / "sent.jsonl")
    monkeypatch.setattr(liepin_apply, "SEEN_LOG", tmp_path / "seen.jsonl")
    monkeypatch.setattr(
        liepin_apply.events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(liepin_apply.asyncio, "sleep", rec_sleep)

    result = asyncio.run(liepin_apply.run(["AI Agent"], 10, GREETING))
    assert result == 0
    banned = [p for k, p in collected if k == "platform_limit_reached"]
    assert len(banned) == 1
    assert "临时封禁" in banned[0]["message"]
    # 没有误发任何招呼
    assert not (tmp_path / "sent.jsonl").exists()
    # 见过日志记了 account_banned 原因（可追溯）
    seen_text = (tmp_path / "seen.jsonl").read_text(encoding="utf-8")
    assert "account_banned" in seen_text


# ---------------------------------------------------------------------------
# 3. 逐字符拟人输入
# ---------------------------------------------------------------------------


def test_type_human_types_per_char(monkeypatch):
    """逐字符输入：send_keys 每字符一次（带节奏停顿），整串语义不变。"""
    typed: list[str] = []

    class _FakeBox:
        async def send_keys(self, s):
            typed.append(s)

    async def rec_sleep(seconds):
        pass

    monkeypatch.setattr(liepin_driver.asyncio, "sleep", rec_sleep)
    asyncio.run(liepin_driver._type_human(_FakeBox(), "你好，世界"))
    assert "".join(typed) == "你好，世界"
    assert len(typed) == 5  # 每字符一次，不是整串一次


def test_type_human_falls_back_to_whole_string(monkeypatch):
    """逐字符失败 → 回退整串输入（拟人化不能以发送失败为代价）。"""
    calls: list[str] = []

    class _FlakyBox:
        async def send_keys(self, s):
            calls.append(s)
            if len(s) == 1:
                raise RuntimeError("element detached")

    async def rec_sleep(seconds):
        pass

    monkeypatch.setattr(liepin_driver.asyncio, "sleep", rec_sleep)
    asyncio.run(liepin_driver._type_human(_FlakyBox(), "你好"))
    # 第一个字符就失败 → 回退整串
    assert calls == ["你", "你好"]


# ---------------------------------------------------------------------------
# 5. 关键词抽样（2026-10-15 封号复盘用户拍板：一轮只搜 3~5 个词）
# ---------------------------------------------------------------------------


def test_sample_keywords_small_list_passthrough():
    """词数 ≤ 5：全跑（零回归）。"""
    kws = ["AI Agent", "大模型", "算法"]
    assert liepin_apply._sample_keywords(kws) == ["AI Agent", "大模型", "算法"]


def test_sample_keywords_large_list_caps_and_head():
    """词数 > 5：抽 3~5 个、前 2 个（用户主词）必带。"""
    kws = [f"词{i}" for i in range(16)]
    for _ in range(20):  # 随机抽样跑多轮，性质必须稳定成立
        out = liepin_apply._sample_keywords(kws)
        assert 3 <= len(out) <= 5
        assert out[:2] == ["词0", "词1"]  # 用户主词必带
        assert len(set(out)) == len(out)  # 不重复


# ---------------------------------------------------------------------------
# 6. 招呼语模板池（每岗位随机一条，防内容指纹）
# ---------------------------------------------------------------------------


def test_pick_greeting_from_pool(monkeypatch, tmp_path):
    """池文件存在：只在池内随机挑，不再用固定单句。"""
    greetings_dir = tmp_path / "greetings"
    greetings_dir.mkdir()
    (greetings_dir / "liepin-greetings-pool.txt").write_text(
        "变体一\n\n变体二\n变体三\n", encoding="utf-8"
    )
    monkeypatch.setattr(liepin_driver, "ROOT", tmp_path)
    picks = {liepin_driver.pick_greeting("默认招呼") for _ in range(60)}
    assert picks <= {"变体一", "变体二", "变体三"}
    assert len(picks) >= 2  # 60 次抽样至少命中两个变体（随机性健在）


def test_pick_greeting_fallback_without_pool(monkeypatch, tmp_path):
    """池不存在：退回调用方默认招呼语（行为同旧，零回归）。"""
    monkeypatch.setattr(liepin_driver, "ROOT", tmp_path)
    assert liepin_driver.pick_greeting("默认招呼") == "默认招呼"


def test_liepin_default_daily_limit_lowered():
    """猎聘默认日限 100→50（封号复盘拍板）：防漂移守卫。"""
    from boss_zhipin.platforms.limits import DEFAULT_DAILY_LIMITS

    assert DEFAULT_DAILY_LIMITS["liepin"] == 50


# ---------------------------------------------------------------------------
# 4. 批次休息：连投 N 个后长休息
# ---------------------------------------------------------------------------


def test_batch_break_after_threshold(monkeypatch, tmp_path):
    """连投 5 个招呼（阈值钉死 5）→ 出现 3~8 分钟的长休息。"""
    sleeps: list[float] = []
    cards = [
        {
            "jobId": f"j{i}",
            "href": f"https://www.liepin.com/job/j{i}.shtml",
            "title": f"AI Agent 实习 {i} 号",
            "company": f"公司{chr(ord('A') + i)}",
            "salary": "20-30k",
            "location": "深圳",
        }
        for i in range(6)
    ]
    collected: list[tuple[str, dict]] = []

    async def fake_open_browser(url, headless=False):
        return _FakeTab()

    async def fake_is_logged_in(tab=None):
        return True

    async def fake_goto_search(tab, kw):
        return cards

    async def fake_open_detail(tab, href):
        pass

    async def fake_detail_company(tab):
        return ""

    async def fake_click_chat(tab, greeting=""):
        return "sent"

    async def rec_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(liepin_driver, "open_browser", fake_open_browser)
    monkeypatch.setattr(liepin_driver, "is_logged_in", fake_is_logged_in)
    monkeypatch.setattr(liepin_driver, "goto_search", fake_goto_search)
    monkeypatch.setattr(liepin_driver, "open_detail", fake_open_detail)
    monkeypatch.setattr(liepin_driver, "detail_company", fake_detail_company)
    monkeypatch.setattr(liepin_driver, "click_chat", fake_click_chat)
    monkeypatch.setattr(liepin_apply, "SENT_LOG", tmp_path / "sent.jsonl")
    monkeypatch.setattr(liepin_apply, "SEEN_LOG", tmp_path / "seen.jsonl")
    monkeypatch.setattr(
        liepin_apply.events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(liepin_apply.asyncio, "sleep", rec_sleep)
    # 阈值钉死 5：第 5 个招呼后必休息
    monkeypatch.setattr(liepin_apply.random, "randint", lambda a, b: 5)

    result = asyncio.run(liepin_apply.run(["AI Agent"], 10, GREETING))
    assert result == 6
    # 6 个招呼全部发出
    sent = [p for k, p in collected if k == "job_sent"]
    assert len(sent) == 6
    # 批次长休息发生了（180~480s；词间 40~100s 与节奏 15~45s 都不会到 180）
    assert any(180.0 <= s <= 480.0 for s in sleeps), f"未出现批次休息: {sleeps}"


# ---------------------------------------------------------------------------
# 7. 纯点击模式（2026-10-15 用户实测拍板：聊一聊已自动发默认招呼）
# ---------------------------------------------------------------------------


def test_message_sending_disabled_by_default(monkeypatch):
    """默认只点击不手发（LIEPIN_CLICK_ONLY 未设 = 开）；=0 才恢复手发。"""
    monkeypatch.delenv("LIEPIN_CLICK_ONLY", raising=False)
    assert liepin_driver._message_sending_disabled() is True
    monkeypatch.setenv("LIEPIN_CLICK_ONLY", "0")
    assert liepin_driver._message_sending_disabled() is False


def test_click_chat_click_only_skips_typing(monkeypatch):
    """纯点击路径：点完"聊一聊"即返回 sent，绝不找输入框/打字/点发送。"""
    monkeypatch.delenv("LIEPIN_CLICK_ONLY", raising=False)
    looked_up: list[str] = []

    class _FakeBtn:
        async def click(self):
            pass

    class _ClickTab:
        async def evaluate(self, _js):
            return ""  # 无封禁/验证码/限额文案

        async def find(self, text, best_match=False, timeout=10):
            looked_up.append(text)
            return _FakeBtn()

    async def rec_sleep(seconds):
        pass

    monkeypatch.setattr(liepin_driver.asyncio, "sleep", rec_sleep)
    result = asyncio.run(liepin_driver.click_chat(_ClickTab(), "您好"))
    assert result == "sent"
    assert "聊一聊" in looked_up
    # 没有进入手发分支（不找输入框、不找发送按钮）
    assert "请输入文字" not in looked_up
    assert "发送" not in looked_up


# ---------------------------------------------------------------------------
# 8. 单轮巡航上限默认（2026-10-15 用户拍板"一次巡航投多少就停"）
# ---------------------------------------------------------------------------


def test_env_run_max_defaults_and_overrides(monkeypatch):
    """未注入 → 保守默认（猎聘 15 / 51job 10）；保护模式注入的份额优先。"""
    from boss_zhipin.platforms.limits import (
        DEFAULT_DAILY_LIMITS,
        DEFAULT_RUN_MAX_LIMITS,
        env_run_max,
    )

    monkeypatch.delenv("LIEPIN_RUN_MAX", raising=False)
    monkeypatch.delenv("JOB51_RUN_MAX", raising=False)
    assert env_run_max("LIEPIN_RUN_MAX", "liepin") == 15
    assert env_run_max("JOB51_RUN_MAX", "job51") == 10
    # 保护模式注入的更小份额永远优先
    monkeypatch.setenv("LIEPIN_RUN_MAX", "5")
    assert env_run_max("LIEPIN_RUN_MAX", "liepin") == 5
    # 非法值回退默认
    monkeypatch.setenv("LIEPIN_RUN_MAX", "abc")
    assert env_run_max("LIEPIN_RUN_MAX", "liepin") == 15
    # 单一真相守卫
    assert DEFAULT_RUN_MAX_LIMITS == {"liepin": 15, "job51": 10}
    # BOSS 日限默认 150→100（2026-10-15 保号拍板）
    assert DEFAULT_DAILY_LIMITS["boss"] == 100
