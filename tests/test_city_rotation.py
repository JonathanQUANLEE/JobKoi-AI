"""城市随机逐城推进 + URL 直填筛选单测（Fisher-Yates 洗牌 + 单城推进）。

背景（2026-10-12 三轮 probe 实证）：
1. DOM 点击城市 chips 不可行（面板城市不是可 find 的文本节点）→ URL 直填；
2. wapi 只接受**单城** city 参数（多城逗号 code=19，probe_wapi_city.py）→
   城市调度从「批次」改为「逐城」：洗牌出随机顺序，一城一搜索，扫完自动切；
3. 用户拍板：多个意向城市时**随机**轮换着投，每个城市都必须投到（不饿死）。
"""

import asyncio

from boss_zhipin.website_oper.core import page_filter_ctrl
from boss_zhipin.website_oper.finding_jobs import (
    BOSS_MAX_CITIES_PER_BATCH,
    _build_city_url,
    _city_rotation_state,
    apply_page_filters,
    build_shuffled_city_batches,
    build_shuffled_city_sequence,
    get_platform_city_chunks,
    rotate_next_city_batch,
)

CITIES_10 = [
    "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京", "西安", "苏州",
]


def _reset_rotation_state() -> None:
    _city_rotation_state["city_sequence"] = []
    _city_rotation_state["city_cursor"] = 0
    _city_rotation_state["active_batch"] = []


def _patch_fast_sleep(monkeypatch) -> None:
    """推进等待拨成 0，测试秒级跑完。"""

    async def fast_sleep(_s):
        return None

    monkeypatch.setattr(page_filter_ctrl.asyncio, "sleep", fast_sleep)


def _patch_url_filter_recorder(monkeypatch, result: bool = True) -> list[list[str]]:
    """记录 apply_city_url_filter 收到的城市（城市筛选的唯一落地动作）。"""
    calls: list[list[str]] = []

    async def fake_url_filter(cities):
        calls.append(list(cities))
        return result

    monkeypatch.setattr(page_filter_ctrl, "apply_city_url_filter", fake_url_filter)
    return calls


# ---------- 纯函数：分块与洗牌 ----------


def test_apply_city_url_filter_rebuilds_canonical_on_seo_base(monkeypatch):
    """2026-10-20 打包版实测事故：搜索页被平台重定向到 SEO 落地页
    （/shenzhen/?city=...&seoRefer=index）时，换城绝不能在错误基地上做
    参数手术——必须用画像词重建规范搜索页（/web/geek/jobs?query=...）。
    """
    from boss_zhipin.website_oper import finding_jobs

    _reset_rotation_state()
    _city_rotation_state["search_url"] = ""  # 无历史基准（新装用户形态）
    monkeypatch.setenv("BOSS_LABEL", "AI应用工程师，全栈开发")

    navigated: list[str] = []

    class _FakeTab:
        async def get(self, u):
            navigated.append(u)
            return None

    async def fake_wait_stable(stable_for=1.5, timeout=20):
        return True

    monkeypatch.setattr(finding_jobs, "_tab", _FakeTab())
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: _FakeTab())
    monkeypatch.setattr(
        finding_jobs,
        "get_current_url",
        lambda: "https://www.zhipin.com/shenzhen/?city=101280600&seoRefer=index",
    )
    monkeypatch.setattr(finding_jobs, "_wait_url_stable", fake_wait_stable)

    ok = asyncio.run(
        page_filter_ctrl.apply_city_url_filter(["苏州", "昆山"])
    )

    assert ok is True
    assert len(navigated) == 1
    # 规范搜索页基地 + 画像首词 + 苏州码；昆山（不在代码表）不进 URL
    assert "/web/geek/jobs" in navigated[0]
    assert "city=101190400" in navigated[0]
    assert "query=" in navigated[0]
    assert "shenzhen" not in navigated[0], "绝不能在 SEO 落地页基地上拼 URL"
    # 成功后记录的基准也是规范搜索页（后续换城的锚点）
    assert "/web/geek/jobs" in _city_rotation_state["search_url"]





def test_get_platform_city_chunks():
    cities_small = ["北京", "上海", "广州"]
    chunks_small = get_platform_city_chunks(cities_small, BOSS_MAX_CITIES_PER_BATCH)
    assert len(chunks_small) == 1
    assert chunks_small[0] == ["北京", "上海", "广州"]

    chunks_large = get_platform_city_chunks(CITIES_10, BOSS_MAX_CITIES_PER_BATCH)
    assert len(chunks_large) == 3
    assert chunks_large[2] == CITIES_10[8:10]


def test_shuffled_sequence_covers_all_exactly_once():
    """全覆盖铁律：洗牌后每城恰好一次。"""
    seq = build_shuffled_city_sequence(CITIES_10)
    assert sorted(seq) == sorted(CITIES_10)
    assert len(seq) == len(set(seq))


def test_shuffled_sequence_is_actually_random():
    """洗牌必须真随机：30 次洗牌至少 3 种不同顺序。"""
    orders = {tuple(build_shuffled_city_sequence(CITIES_10)) for _ in range(30)}
    assert len(orders) >= 3
    # 第 5/6 个城市有机会排第一（用户核心诉求：不只前几个城市先投）
    assert any(seq[0] in CITIES_10[4:] for seq in
               [build_shuffled_city_sequence(CITIES_10) for _ in range(30)])


def test_build_shuffled_city_batches_still_chunks():
    """兼容函数：批次版仍按上限切批（DOM 流页面端多城有效）。"""
    batches = build_shuffled_city_batches(CITIES_10)
    flat = [c for b in batches for c in b]
    assert sorted(flat) == sorted(CITIES_10)
    assert all(len(b) <= BOSS_MAX_CITIES_PER_BATCH for b in batches)


# ---------- 纯函数：URL 直填 ----------


def test_build_city_url_replaces_existing_city_param():
    """换城语义核心：旧 city 参数被整体替换（无叠加残留），其他参数保留。"""
    url, unknown = _build_city_url(
        "https://www.zhipin.com/web/geek/jobs?query=AI+实习&city=101010100&degree=203",
        ["郑州"],
    )
    assert unknown == []
    assert "city=101180100" in url
    assert "city=101010100" not in url
    assert "query=AI" in url
    assert "degree=203" in url


def test_build_city_url_tracks_unknown_cities():
    url, unknown = _build_city_url("https://www.zhipin.com/web/geek/jobs?query=AI", ["郑州", "昆山"])
    assert unknown == ["昆山"]
    assert "city=101180100" in url


# ---------- 流程：入口洗牌 + 逐城推进（URL 直填落地） ----------


def test_rotate_returns_false_for_single_city():
    """单城无需推进。"""
    url_calls = None

    async def _run():
        _reset_rotation_state()
        filters = {"city": {"enabled": True, "values": ["北京"]}}
        assert await rotate_next_city_batch(filters) is False

    asyncio.run(_run())
    assert url_calls is None


def test_rotate_disabled_city_never_advances():
    """城市组被禁用时绝不推进（与 apply_page_filters 的 enabled 检查对齐）。"""

    async def _run():
        _reset_rotation_state()
        filters = {"city": {"enabled": False, "values": CITIES_10}}
        assert await rotate_next_city_batch(filters) is False

    asyncio.run(_run())


def test_apply_shuffles_and_fills_first_city_by_url(monkeypatch):
    """入口 ≥2 城：洗牌出随机顺序、URL 直填只应用第 1 城、状态写盘。"""
    _patch_fast_sleep(monkeypatch)
    url_calls = _patch_url_filter_recorder(monkeypatch)

    async def _run():
        _reset_rotation_state()
        filters = {"city": {"enabled": True, "values": CITIES_10[:6]}}
        await apply_page_filters(filters)
        seq = _city_rotation_state["city_sequence"]
        assert sorted(seq) == sorted(CITIES_10[:6])
        assert _city_rotation_state["city_cursor"] == 0
        # URL 直填的是洗牌序列的第 1 城（单城）
        assert url_calls == [[seq[0]]]
        assert _city_rotation_state["active_batch"] == [seq[0]]

    asyncio.run(_run())


def test_apply_single_city_clears_state(monkeypatch):
    """单城入口：URL 直填该城 + 清掉残留推进状态（防上一轮序列串台）。"""
    _patch_fast_sleep(monkeypatch)
    url_calls = _patch_url_filter_recorder(monkeypatch)
    _reset_rotation_state()
    _city_rotation_state["city_sequence"] = ["旧城1", "旧城2"]
    _city_rotation_state["active_batch"] = ["旧城1"]

    async def _run():
        filters = {"city": {"enabled": True, "values": ["北京"]}}
        await apply_page_filters(filters)
        assert _city_rotation_state["city_sequence"] == []
        assert _city_rotation_state["city_cursor"] == 0
        assert url_calls == [["北京"]]

    asyncio.run(_run())


def test_apply_then_advance_full_cycle_covers_all_then_stops(monkeypatch):
    """生产主链路：入口直填第 1 城 → 逐城推进直填后续 → 全部城市轮完自然结束。"""
    _patch_fast_sleep(monkeypatch)
    url_calls = _patch_url_filter_recorder(monkeypatch)
    cities = CITIES_10[:6]

    async def _run():
        _reset_rotation_state()
        filters = {"city": {"enabled": True, "values": cities}}
        await apply_page_filters(filters)
        seq = _city_rotation_state["city_sequence"]
        assert url_calls == [[seq[0]]]

        # 逐城推进：第 2..6 城，每城一次单城 URL 直填
        for i in range(1, len(seq)):
            assert await rotate_next_city_batch(filters) is True
        assert url_calls == [[c] for c in seq]  # 覆盖全部 6 城，顺序随机
        # 一轮投完：再推进返回 False 自然结束
        assert await rotate_next_city_batch(filters) is False
        assert len(url_calls) == len(seq)

    asyncio.run(_run())


def test_advance_from_cold_state_applies_first_city(monkeypatch):
    """入口被跳过（use_current_page）后直接推进：从洗牌后的第 1 城开始。"""
    _patch_fast_sleep(monkeypatch)
    url_calls = _patch_url_filter_recorder(monkeypatch)

    async def _run():
        _reset_rotation_state()
        filters = {"city": {"enabled": True, "values": CITIES_10}}
        assert await rotate_next_city_batch(filters) is True
        seq = _city_rotation_state["city_sequence"]
        assert _city_rotation_state["city_cursor"] == 0  # 第 1 城，不跳城
        assert url_calls == [[seq[0]]]

    asyncio.run(_run())


def test_advance_rebuilds_sequence_when_city_list_changed(monkeypatch):
    """用户两轮巡航之间改了城市列表：旧序列作废，按当前城市重新洗牌。"""
    _patch_fast_sleep(monkeypatch)
    url_calls = _patch_url_filter_recorder(monkeypatch)
    _reset_rotation_state()
    _city_rotation_state["city_sequence"] = ["旧城1", "旧城2", "旧城3", "旧城4", "旧城5"]
    _city_rotation_state["city_cursor"] = 1

    new_cities = CITIES_10[:6]
    filters = {"city": {"enabled": True, "values": new_cities}}

    async def _run():
        assert await rotate_next_city_batch(filters) is True
        seq = _city_rotation_state["city_sequence"]
        # 旧序列作废：新序列覆盖且仅覆盖新城市；从新第 1 城开始（不跳城）
        assert sorted(seq) == sorted(new_cities)
        assert _city_rotation_state["city_cursor"] == 0
        # URL 直填天然免疫 stale 状态：只直填新第 1 城，不碰旧城市名
        assert url_calls == [[seq[0]]]
        assert "旧城" not in url_calls[0][0]

    asyncio.run(_run())
