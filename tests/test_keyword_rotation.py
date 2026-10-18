"""BOSS 多岗位关键词轮换测试（2026-10-15 + 2026-10-17 公平轮换升级）。

用户实测痛点：画像里写了多个岗位关键词（如"AI Agent实习，大模型实习，
算法实习"），但 API 直读流只扫入口 URL 的第一个词（300 岗里 279 个已投过）
就结束整轮巡航——用户明确诉求"我多写岗位就是让换着投递"。

行为规格（2026-10-17 公平轮换升级后的铁律）：
1. 单元配额轮换：每个 (城市×岗位词) 单元每次访问扫够配额（默认 12 个新
   岗位 / 投出 5 份，先到先轮换）或自然扫完就轮换——大城市/热门词不再
   吃光全局额度，长尾城市雨露均沾（PRD 核心诉求）；
2. 城市优先交错：同词先跨城（北京×AI → 上海×AI），本轮城走完才换词，
   词尽仍有存量则重洗城市序列开新一轮；
3. 全局停止不轮换：日限/风控/验证码触发的结束一律不换词不换城硬闯；
4. 单单元零回归：单城或单词时配额不启用，行为与旧版完全一致；
5. 轮换失败优雅降级：导航失败不炸整轮，正常收尾；
6. 「全国」意向自动展开为核心 Top 城市序列（IP 属地混合流 → 真实多城轮换）。
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


def _api_job(eid: str, name: str = "AI Agent 实习", city: str = "深圳") -> dict:
    return {
        "encryptJobId": eid,
        "jobName": name,
        "brandName": "某公司",
        "cityName": city,
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
    # 城市闭包状态（2026-10-17 公平轮换）：入口 URL 固定 city=深圳（101280600，
    # 与 ENTRY_URL 一致）；城市轮换桩按 values 环形推进——_current_city_name
    # 从 URL 反查城市名，桩必须让 URL 跟着城市走，否则单元追踪会失真。
    current_city = ["深圳"]
    city_codes = {"深圳": "101280600", "北京": "101010100", "上海": "101020100"}

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
    # human_pause（单元/页间高斯停顿）：配额测试会走到岗位级处理末尾，
    # 必须接管否则真睡 15~40s。
    monkeypatch.setattr(browser_session, "human_pause", fake_guard_sleep)

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
        code = city_codes.get(current_city[0], "101280600")
        return f"https://www.zhipin.com/web/geek/jobs?city={code}&query={quote(kw)}"

    monkeypatch.setattr(finding_jobs, "get_current_url", fake_get_current_url)

    async def fake_city_rotate(filters_for_click=None, emit_event=None):
        city_rotations.append(True)
        if not city_rotate_ok:
            return False
        # 模拟真实 rotate_next_city_batch：按城市列表环形推进到下一城
        values: list[str] = []
        if isinstance(filters_for_click, dict):
            cfg = filters_for_click.get("city")
            if isinstance(cfg, dict):
                values = [
                    str(v).strip() for v in cfg.get("values") or [] if str(v).strip()
                ]
        if len(values) < 2:
            return False
        try:
            idx = values.index(current_city[0])
        except ValueError:
            idx = -1
        current_city[0] = values[(idx + 1) % len(values)]
        return True

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
    # 无城市配置：每个单元推进前都会尝试一次城市推进（桩返回 False），
    # 第三个单元耗尽后全部单元扫完直接收工（2026-10-17 公平轮换语义）
    assert len(city_rotations) == 2
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
    # 尝试过换词（失败）；新引擎 ③ 兜底分支还会尝试词复位（也失败后优雅收尾）
    assert rotations == [KW_B, KW_A]
    # 失败后转入城市推进（无城市 → 结束），不是崩溃/报错中止
    summaries = _summaries(collected)
    assert len(summaries) == 1
    assert summaries[0]["stop_reason"] == "completed"


# ---------------------------------------------------------------------------
# 5. 城市优先交错轮换（2026-10-17 公平轮换新语义）
# ---------------------------------------------------------------------------


def test_city_major_interleave_covers_all_units(monkeypatch):
    """两城两词：同词先跨城（深圳A → 北京A），城尽换词（→ 深圳B → 北京B）。

    旧语义是词优先（城1 A→B 再换城），2026-10-17 PRD 拍板改为城市优先
    交错——城市多样性最大化，杜绝"第 1 城吃光日限、长尾城市饿死"。
    """
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

    # 城市优先交错：词A扫两城 → 词B扫两城（每城×每词全覆盖矩阵不变）
    assert page1_keywords == [KW_A, KW_A, KW_B, KW_B]
    # 词推进只发生一次（A→B；城尽才换词）
    assert rotations == [KW_B]
    # 城市推进：城A轮1次 + 换词时重启城市轮1次 + 城B轮1次
    assert len(city_rotations) == 3
    summaries = _summaries(collected)
    assert summaries[0]["stop_reason"] == "completed"
    assert summaries[0]["cities_done"] == 2
    assert summaries[0]["total_cities"] == 2


# ---------------------------------------------------------------------------
# 6. 单元配额轮换（2026-10-17 公平轮换核心）：扫够配额即轮换，
#    重取本页靠 seen 去重，整页扫完才翻页，空页=单元自然耗尽
# ---------------------------------------------------------------------------


def test_unit_quota_rotates_mid_page(monkeypatch):
    """两城一词×每城 30 个新岗位：每单元每次访问只扫 12 个新岗位即轮换。

    fetch 顺序的期望值（配额引擎的完整行为指纹）：
    深圳P1 → 北京P1 → 深圳P1(重取,12已投+12新) → 北京P1(重取) →
    深圳P1(重取,24已投+6新,整页完成→翻页) → 北京P1(同) →
    深圳P2(空,耗尽) → 北京P2(空,耗尽) → 圆满收工。
    """
    # 30 个新岗位/城（distinct eid，dry_run 路径：按钮"立即沟通"→记账不真发）
    city_codes = {"深圳": "101280600", "北京": "101010100"}
    code_city = {v: k for k, v in city_codes.items()}
    fetch_order: list[tuple[str, int]] = []
    monkeypatch.setattr(search_api_flow, "_read_seen_job_keys", lambda path: set())

    def _jobs_for(city: str) -> list:
        return [
            job_api.parse_api_job(_api_job(f"{city}-{i}", name="AI 实习", city=city))
            for i in range(30)
        ]

    async def fake_fetch(tab, query, page):
        params = dict(parse_qsl(query))
        city = code_city.get(params.get("city", ""), "深圳")
        fetch_order.append((city, page))
        if page == 1:
            return _jobs_for(city)
        return []

    collected, sleeps, rotations, city_rotations = _install_stubs(
        monkeypatch,
        fake_fetch,
        label="",  # 单词（入口词）：城市优先轮换的主场景
        city_values=["深圳", "北京"],
        city_rotate_ok=True,
    )
    # dry_run 全量放开限额：让 60 个岗位都走完配额引擎
    monkeypatch.setattr(search_api_flow, "_auto_send_max_sent", lambda: None)
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: None)
    monkeypatch.setattr(
        finding_jobs, "get_text_by_css",
        lambda selector, timeout=3: _ret("立即沟通"),
    )
    monkeypatch.setattr(
        search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _ret(True)
    )
    monkeypatch.setattr(
        search_api_flow, "_extract_detail_jd", lambda: _ret("岗位职责：负责AI应用开发。")
    )

    async def run():
        await search_api_flow._run_search_api_flow(
            usr_name="测试", url=ENTRY_URL, dry_run=True, scan_only=False,
            greeting=GREETING,
        )

    asyncio.run(run())

    # 配额引擎的完整行为指纹（见 docstring 推演）：
    # v1 深圳P1(12新,配额) → v2 北京P1(12新,配额) → 重洗开新轮 →
    # v3 深圳P1(12旧+12新,配额) → v4 北京P1(同) → 重洗 →
    # v5 深圳P1(24旧+6新,整页完成→P2空,耗尽) → v6 北京P1(同,P2空,耗尽)
    assert fetch_order == [
        ("深圳", 1), ("北京", 1), ("深圳", 1), ("北京", 1),
        ("深圳", 1), ("深圳", 2), ("北京", 1), ("北京", 2),
    ]
    summaries = _summaries(collected)
    assert summaries[0]["stop_reason"] == "completed"
    # 每城 30 个新岗位全部覆盖（12+12+6 三次访问），城市间绝对公平
    per_city = {c["city"]: c for c in summaries[0]["per_city"]}
    assert per_city["深圳"]["scanned"] == 66  # 12 + (12旧+12新) + (24旧+6新)
    assert per_city["北京"]["scanned"] == 66
    # 重取页的已投岗位靠 seen 去重（每城 36 次重复扫描）
    assert summaries[0]["skipped_duplicates"] == 72


def _ret(value):
    async def _impl(*args, **kwargs):
        return value

    return _impl()


# ---------------------------------------------------------------------------
# 7. 「全国」展开（2026-10-17）：IP 属地混合流 → 核心 Top 城市真实轮换
# ---------------------------------------------------------------------------


def test_expand_nationwide_cities_pure_function():
    """纯函数：全国 → 10 核心 Top 城市；混选去重；无全国零介入。"""
    from boss_zhipin.website_oper.core.page_filter_ctrl import (
        NATIONWIDE_DEFAULT_CITIES,
        expand_nationwide_cities,
    )

    assert expand_nationwide_cities(["全国"]) == list(NATIONWIDE_DEFAULT_CITIES)
    assert expand_nationwide_cities(["全国", "北京"]) == list(NATIONWIDE_DEFAULT_CITIES)
    assert expand_nationwide_cities(["深圳", "广州"]) == ["深圳", "广州"]
    assert expand_nationwide_cities([]) == []


def test_nationwide_expands_into_city_rotation(monkeypatch):
    """画像选「全国」：API 流把它当 10 个核心城市轮换（total_cities=10）。"""
    jobs = _seen_jobs(monkeypatch, ["e1"])
    page1_keywords: list[str] = []
    fetch_impl = _make_page1_recorder(jobs, page1_keywords)

    collected, sleeps, rotations, city_rotations = _install_stubs(
        monkeypatch,
        fetch_impl,
        label="",
        city_values=["全国"],
        city_rotate_ok=True,
    )
    _run_flow()

    summaries = _summaries(collected)
    # 全国 → 10 个核心城市进轮换矩阵（不再是单一 100010000 混合流）
    assert summaries[0]["total_cities"] == 10
    assert summaries[0]["stop_reason"] == "completed"
