"""BOSS 多岗位关键词轮换测试（2026-10-15）。

用户实测痛点：画像里写了多个岗位关键词（如"AI Agent实习，大模型实习，
算法实习"），但 API 直读流只扫入口 URL 的第一个词（300 岗里 279 个已投过）
就结束整轮巡航——用户明确诉求"我多写岗位就是让换着投递"。

行为规格（与城市推进同一套铁律）：
1. 多词轮换：当前词在该城自然扫完 → 切换下一个词翻回第 1 页重扫，
   词表用尽才推进下一城（每城×每词全覆盖）；
2. 换城复位：新城市从词表第一个词重新扫起；
3. 单词零回归：只写一个词时轮换逻辑零介入，行为与旧版完全一致；
4. 全局停止不换词：日限/风控/验证码触发的结束一律不换词硬闯（保号优先）；
5. 轮换失败优雅降级：导航失败不炸整轮，转入城市推进正常收尾。
"""

from __future__ import annotations

import asyncio
from urllib.parse import parse_qsl, quote

from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.dispatch import search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"

KW_A = "AI Agent实习"
KW_B = "大模型实习"
KW_C = "算法实习"
# 入口 URL 带第一个词（与 cli.py 首词 URL 构造一致，空格预编码）
ENTRY_URL = "https://www.zhipin.com/web/geek/jobs?query=AI%20Agent%E5%AE%9E%E4%B9%A0"


def _api_job(eid: str, name: str = "AI Agent 实习") -> dict:
    return {
        "encryptJobId": eid,
        "jobName": name,
        "brandName": "某公司",
        "cityName": "深圳",
        "salaryDesc": "200-300/天",
        "jobDegree": "本科",
    }


def _seen_jobs(monkeypatch, eids: list[str]):
    """预置历史已投岗位：让每个岗位走 seen 秒跳路径，不碰浏览器交互。"""
    jobs = [job_api.parse_api_job(_api_job(eid)) for eid in eids]
    seen_keys = {finding_jobs.job_key(job_api.to_job_posting(j)) for j in jobs}
    monkeypatch.setattr(search_api_flow, "_read_seen_job_keys", lambda path: seen_keys)
    return jobs


def _install_stubs(
    monkeypatch,
    fetch_impl,
    *,
    label: str = "",
    rotate_ok: bool = True,
    city_values: list[str] | None = None,
    city_rotate_ok: bool = False,
):
    """公共桩（模式同 test_api_rate_limit）：事件/睡眠/轮换原语全部接管。

    - ``label``：注入 BOSS_LABEL（用户画像的多关键词原文）；
    - ``rotate_ok``：finding_jobs.rotate_to_keyword 的返回值（False 演导航失败）；
    - ``city_values``：城市筛选配置（None = 无城市 → 城市推进永远失败）；
    - ``city_rotate_ok``：rotate_next_city_batch 的返回值。
    返回 (事件, 睡眠, 关键词轮换调用记录, 城市轮换调用记录)。
    """
    collected: list[tuple[str, dict]] = []
    sleeps: list[float] = []
    rotations: list[str] = []
    city_rotations: list[bool] = []
    current_keyword = [KW_A]  # get_current_url 闭包状态：轮换后指向新词

    monkeypatch.delenv("BOSS_LABEL", raising=False)
    if label:
        monkeypatch.setenv("BOSS_LABEL", label)

    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(job_api, "fetch_search_page", fetch_impl)
    monkeypatch.setattr(finding_jobs, "get_tab", lambda: object())
    monkeypatch.setattr(search_api_flow, "_state_path", lambda name: None)
    monkeypatch.setattr(search_api_flow, "_profile_filters", lambda: {})
    monkeypatch.setattr(search_api_flow, "_sent_today_count", lambda path, profile: 0)
    monkeypatch.setattr(search_api_flow, "_auto_send_max_sent", lambda: 5)
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: 10)
    if city_values is None:
        monkeypatch.setattr(search_api_flow, "_page_filters", lambda: {})
    else:
        monkeypatch.setattr(
            search_api_flow,
            "_page_filters",
            lambda: {"city": {"enabled": True, "values": city_values}},
        )

    async def rec_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(search_api_flow.asyncio, "sleep", rec_sleep)

    # 词间/城间/页间隔 2026-10-15 起走 human_pause → sleep_with_browser_guard
    # （带站岗）：必须接管，否则测试会真睡 15~40s、甚至因假 browser 触发
    # "浏览器已关闭"误抛。
    from boss_zhipin.website_oper.core import browser_session

    async def fake_guard_sleep(seconds: float, chunk: float = 2.0):
        sleeps.append(seconds)

    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", fake_guard_sleep)

    async def fake_rotate_kw(keyword, emit_event=None):
        rotations.append(keyword)
        if not rotate_ok:
            return False
        current_keyword[0] = keyword
        if emit_event:
            emit_event(
                {
                    "group": "keyword_rotation",
                    "keyword": keyword,
                    "status": "rotated",
                    "message": f"岗位关键词轮换：切换到「{keyword}」继续投递",
                }
            )
        return True

    monkeypatch.setattr(finding_jobs, "rotate_to_keyword", fake_rotate_kw)

    def fake_get_current_url():
        kw = current_keyword[0]
        return f"https://www.zhipin.com/web/geek/jobs?city=101280600&query={quote(kw)}"

    monkeypatch.setattr(finding_jobs, "get_current_url", fake_get_current_url)

    async def fake_city_rotate(filters_for_click=None, emit_event=None):
        city_rotations.append(True)
        return city_rotate_ok

    monkeypatch.setattr(finding_jobs, "rotate_next_city_batch", fake_city_rotate)
    return collected, sleeps, rotations, city_rotations


def _run_flow():
    asyncio.run(
        search_api_flow._run_search_api_flow(
            usr_name="测试",
            url=ENTRY_URL,
            dry_run=False,
            scan_only=False,
            greeting=GREETING,
        )
    )


def _make_page1_recorder(jobs, page1_keywords: list[str]):
    """fetch 桩：第 1 页返回预置岗位（记录当时搜的词），第 2 页取完。"""

    async def fake_fetch(tab, query, page):
        if page == 1:
            page1_keywords.append(dict(parse_qsl(query)).get("query", ""))
            return jobs
        return []

    return fake_fetch


def _summaries(collected):
    return [payload for kind, payload in collected if kind == "api_flow_finished"]


# ---------------------------------------------------------------------------
# 1. 多词轮换：词表逐个扫完，词尽才推进城市
# ---------------------------------------------------------------------------


def test_multi_keyword_rotates_through_all_words(monkeypatch):
    """三个词：入口词扫完 → 换第二个 → 再换第三个 → 词表用尽自然收尾。"""
    jobs = _seen_jobs(monkeypatch, ["e1", "e2"])
    page1_keywords: list[str] = []
    fetch_impl = _make_page1_recorder(jobs, page1_keywords)

    collected, sleeps, rotations, city_rotations = _install_stubs(
        monkeypatch, fetch_impl, label=f"{KW_A}，{KW_B}，{KW_C}"
    )
    _run_flow()

    # 三个词都在第 1 页各扫过一遍（入口词优先，再按 BOSS_LABEL 切分序）
    assert page1_keywords == [KW_A, KW_B, KW_C]
    # 轮换原语调用两次（A→B、B→C；第三个词后词表用尽不再换）
    assert rotations == [KW_B, KW_C]
    # 无城市配置：词尽后城市推进失败即收尾，不重复扫
    assert city_rotations == [True]  # 尝试过一次城市推进（桩返回 False）
    # 前端能看到人话轮换事件（实时动态里"切换到「大模型实习」"）
    rotation_events = [
        payload
        for kind, payload in collected
        if kind == "page_filter" and payload.get("group") == "keyword_rotation"
    ]
    assert [e["keyword"] for e in rotation_events] == [KW_B, KW_C]
    # 自然扫完收尾（completed），不是报错中止
    summaries = _summaries(collected)
    assert len(summaries) == 1
    assert summaries[0]["stop_reason"] == "completed"


# ---------------------------------------------------------------------------
# 2. 单词零回归：轮换逻辑零介入
# ---------------------------------------------------------------------------


def test_single_keyword_never_rotates(monkeypatch):
    """只写一个词（或与入口词重复）：不调轮换原语、行为与旧版完全一致。"""
    jobs = _seen_jobs(monkeypatch, ["e1"])
    page1_keywords: list[str] = []
    fetch_impl = _make_page1_recorder(jobs, page1_keywords)

    collected, sleeps, rotations, city_rotations = _install_stubs(
        monkeypatch, fetch_impl, label=KW_A  # 与入口 URL 同词 → 去重后表长 1
    )
    _run_flow()

    assert page1_keywords == [KW_A]
    assert rotations == []
    assert _summaries(collected)[0]["stop_reason"] == "completed"


def test_empty_label_still_scans_url_keyword(monkeypatch):
    """BOSS_LABEL 为空：轮换表退化为 [入口词]，同样零介入。"""
    jobs = _seen_jobs(monkeypatch, ["e1"])
    page1_keywords: list[str] = []
    fetch_impl = _make_page1_recorder(jobs, page1_keywords)

    collected, sleeps, rotations, _ = _install_stubs(monkeypatch, fetch_impl, label="")
    _run_flow()

    assert page1_keywords == [KW_A]
    assert rotations == []
    assert _summaries(collected)[0]["stop_reason"] == "completed"


# ---------------------------------------------------------------------------
# 3. 全局停止不换词：日限满直接安全停止
# ---------------------------------------------------------------------------


def test_daily_limit_blocks_keyword_rotation(monkeypatch):
    """日限已满：一页都不扫、绝不换词硬闯（误投风险 > 漏投风险）。"""
    _seen_jobs(monkeypatch, ["e1"])
    page1_keywords: list[str] = []
    fetch_impl = _make_page1_recorder([], page1_keywords)

    collected, sleeps, rotations, city_rotations = _install_stubs(
        monkeypatch, fetch_impl, label=f"{KW_A}，{KW_B}"
    )
    # 日限 0：进入翻页循环即满额
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: 0)
    _run_flow()

    assert page1_keywords == []
    assert rotations == []
    summaries = _summaries(collected)
    assert summaries[0]["stop_reason"] == "daily_limit"
    # 前端常驻横幅提醒"今日已投满"
    assert any(kind == "platform_limit_reached" for kind, _ in collected)


# ---------------------------------------------------------------------------
# 4. 轮换失败优雅降级：不炸整轮，转入城市推进
# ---------------------------------------------------------------------------


def test_rotation_failure_falls_back_gracefully(monkeypatch):
    """关键词导航失败：跳过该词转入城市推进，本轮仍优雅收尾不报错。"""
    jobs = _seen_jobs(monkeypatch, ["e1"])
    page1_keywords: list[str] = []
    fetch_impl = _make_page1_recorder(jobs, page1_keywords)

    collected, sleeps, rotations, city_rotations = _install_stubs(
        monkeypatch, fetch_impl, label=f"{KW_A}，{KW_B}", rotate_ok=False
    )
    _run_flow()

    # 第二个词导航失败，没有扫成
    assert page1_keywords == [KW_A]
    assert rotations == [KW_B]  # 尝试过换词（失败）
    # 失败后转入城市推进（无城市 → 结束），不是崩溃/报错中止
    summaries = _summaries(collected)
    assert len(summaries) == 1
    assert summaries[0]["stop_reason"] == "completed"


# ---------------------------------------------------------------------------
# 5. 换城复位：每城×每词全覆盖
# ---------------------------------------------------------------------------


def test_city_advance_resets_to_first_keyword(monkeypatch):
    """两城两词：城1 扫 A→B，换城后复位到 A 再扫 A→B（全覆盖矩阵）。"""
    jobs = _seen_jobs(monkeypatch, ["e1"])
    page1_keywords: list[str] = []
    fetch_impl = _make_page1_recorder(jobs, page1_keywords)

    collected, sleeps, rotations, city_rotations = _install_stubs(
        monkeypatch,
        fetch_impl,
        label=f"{KW_A}，{KW_B}",
        city_values=["深圳", "北京"],
        city_rotate_ok=True,
    )
    _run_flow()

    # 每城×每词：城1 (A, B) → 换城复位 → 城2 (A, B)
    assert page1_keywords == [KW_A, KW_B, KW_A, KW_B]
    # 轮换序列：城1 A→B；换城复位 A；城2 A→B
    assert rotations == [KW_B, KW_A, KW_B]
    # 城市推进恰好一次（第 2 城后 cities_done >= total_cities 结束）
    assert len(city_rotations) == 1
    summaries = _summaries(collected)
    assert summaries[0]["stop_reason"] == "completed"
    assert summaries[0]["cities_done"] == 2
    assert summaries[0]["total_cities"] == 2
