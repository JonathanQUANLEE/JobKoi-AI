"""BOSS 详情页风控降级早停测试（2026-10-17 二次实测事故）。

事故回放：巡航 4 分钟后详情页开始连续返回无内容页面（JD 全取不到），
旧代码毫无感知继续硬扫——每个空烧 ~90s（30s 导航 + 阅读 + 选择器等待 +
岗位间停顿），5 个岗位空烧 7.5 分钟且持续给风控升温，直到下一次 wapi
调用也被拒才停止。降级开始时间比首次城市轮换早 7 分钟，证明是账号/会话
级风控而非轮换导航的锅。

行为规格：
1. 连续 3 个详情页无 JD → 只读探测验证码页（captcha_visible，不受
   BOSS_STOP_ON_CAPTCHA 门控——这是实锤风控页后的保号停机）；
   命中 → captcha 停机；
2. 连续 5 个详情页无 JD（无验证码页）→ 按风控降级停机（page_degraded），
   广播 agent_intervene，结束汇总给人话建议；
3. 成功取到 JD 即复位计数（1~2 次偶发失效不误伤——继续按标题筛选）；
4. XHR 透视：同步 XHR 的 JS 异常/HTTP 状态码以结构化 JSON 带回
   （code=xhr_error / http_XXX），不再是无有效响应的盲盒。
"""

from __future__ import annotations

import asyncio
import json

import pytest

from boss_zhipin.gui import events as gui_events
from boss_zhipin.website_oper import finding_jobs, job_api
from boss_zhipin.website_oper.dispatch import search_api_flow

GREETING = "您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流，期待您的回复！"


def _api_job(eid: str, name: str = "AI 应用工程师") -> dict:
    return {
        "encryptJobId": eid,
        "jobName": name,
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
# 1/2/3. 岗位级：jd_health 计数与停机阈值
# ---------------------------------------------------------------------------


def _run_single_job(monkeypatch, *, jd_text: str, jd_health: dict, captcha: bool):
    """直调 _process_single_api_job：JD 提取结果与验证码探测结果可控。"""
    collected: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        gui_events, "emit", lambda kind, **payload: collected.append((kind, payload))
    )
    monkeypatch.setattr(
        finding_jobs, "get_text_by_css", lambda selector, timeout=3: _ret("立即沟通")
    )
    monkeypatch.setattr(
        search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _ret("ok")
    )
    monkeypatch.setattr(search_api_flow, "_extract_detail_jd", lambda: _ret(jd_text))
    monkeypatch.setattr(finding_jobs, "captcha_visible", lambda: _ret(captcha))
    from boss_zhipin.website_oper.core import browser_session

    monkeypatch.setattr(browser_session, "human_pause", lambda a, b: _ret(None))

    async def run():
        return await search_api_flow._process_single_api_job(
            api_job=job_api.parse_api_job(_api_job("e-degraded")),
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
            jd_health=jd_health,
        )

    return asyncio.run(run()), collected


def test_three_missing_with_captcha_stops_as_captcha(monkeypatch):
    """连续第 3 个无 JD 详情页 + 探测到验证码页 → captcha 保号停机。"""
    jd_health = {"consecutive_missing": 2}  # 前两个岗位已连续失效
    (status, _, _), collected = _run_single_job(
        monkeypatch, jd_text="", jd_health=jd_health, captcha=True
    )

    assert status == "captcha"
    assert jd_health["consecutive_missing"] == 3
    assert any(kind == "captcha_stopped" for kind, _ in collected)


def test_five_missing_without_captcha_stops_as_degraded(monkeypatch):
    """连续第 5 个无 JD 详情页（非验证码页）→ 风控降级停机 + 守护事件。"""
    jd_health = {"consecutive_missing": 4}
    (status, _, _), collected = _run_single_job(
        monkeypatch, jd_text="", jd_health=jd_health, captcha=False
    )

    assert status == "page_degraded"
    interventions = [p for k, p in collected if k == "agent_intervene"]
    assert len(interventions) == 1
    assert interventions[0]["action"] == "风控降级停止"


def test_few_missing_still_processes_by_title(monkeypatch):
    """1~2 次偶发 JD 失效不误伤：岗位继续按标题筛选（dry_run 正常走完）。"""
    jd_health = {"consecutive_missing": 1}  # 第 2 次失效：未达 3 不探测
    (status, _, _), collected = _run_single_job(
        monkeypatch, jd_text="", jd_health=jd_health, captcha=True
    )

    assert status == "dry_run"  # 正常处理完毕（没触发停机）
    assert jd_health["consecutive_missing"] == 2
    assert not any(kind == "captcha_stopped" for kind, _ in collected)


def test_jd_success_resets_counter(monkeypatch):
    """取到 JD 即复位：失效-成功-失效-失效-失效 不触发（累计被打断）。"""
    # miss（计 1）→ success（复位 0）→ miss ×2（计 2）→ 第 3 个 miss 才探测
    jd_health = {}
    _run_single_job(monkeypatch, jd_text="", jd_health=jd_health, captcha=False)
    assert jd_health["consecutive_missing"] == 1
    _run_single_job(monkeypatch, jd_text="岗位职责：负责AI应用开发。", jd_health=jd_health, captcha=False)
    assert jd_health["consecutive_missing"] == 0
    _run_single_job(monkeypatch, jd_text="", jd_health=jd_health, captcha=True)
    _run_single_job(monkeypatch, jd_text="", jd_health=jd_health, captcha=True)
    (status, _, _), _ = _run_single_job(
        monkeypatch, jd_text="", jd_health=jd_health, captcha=True
    )
    # 复位后只累计到 3：触发验证码探测（captcha=True → captcha 停机）
    assert status == "captcha"
    assert jd_health["consecutive_missing"] == 3


# ---------------------------------------------------------------------------
# 4. 流程级：连续降级触发整轮保号停机
# ---------------------------------------------------------------------------


def test_flow_halts_on_consecutive_degraded_pages(monkeypatch):
    """一页 5 个岗位全部无 JD → 第 5 个触发 page_degraded，整轮安全收尾。"""
    collected: list[tuple[str, dict]] = []
    jobs = [job_api.parse_api_job(_api_job(f"e-{i}")) for i in range(5)]

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
    monkeypatch.setattr(search_api_flow, "_auto_send_max_sent", lambda: None)
    monkeypatch.setattr(search_api_flow, "_auto_send_daily_limit", lambda: None)
    monkeypatch.setattr(search_api_flow, "_read_seen_job_keys", lambda path: set())
    monkeypatch.setattr(search_api_flow, "_open_job_detail_page", lambda url, timeout=30: _ret("ok"))
    # 全部详情页取不到 JD（模拟风控降级），验证码探测不命中
    monkeypatch.setattr(search_api_flow, "_extract_detail_jd", lambda: _ret(""))
    monkeypatch.setattr(finding_jobs, "captcha_visible", lambda: _ret(False))
    monkeypatch.setattr(finding_jobs, "get_text_by_css", lambda s, timeout=3: _ret("立即沟通"))
    monkeypatch.delenv("BOSS_LABEL", raising=False)

    from boss_zhipin.website_oper.core import browser_session

    monkeypatch.setattr(browser_session, "sleep_with_browser_guard", lambda s, chunk=2.0: _ret(None))
    monkeypatch.setattr(browser_session, "human_pause", lambda a, b: _ret(None))

    asyncio.run(
        search_api_flow._run_search_api_flow(
            usr_name="测试",
            url="https://www.zhipin.com/web/geek/jobs?query=AI",
            dry_run=True,
            scan_only=False,
            greeting=GREETING,
        )
    )

    summaries = [p for k, p in collected if k == "api_flow_finished"]
    assert len(summaries) == 1
    assert summaries[0]["stop_reason"] == "page_degraded"
    # 结束汇总是人话：告诉用户是疑似风控降级、该怎么做
    assert "风控降级" in summaries[0]["message"]
    # 守护面板收到降级停机直播
    interventions = [p for k, p in collected if k == "agent_intervene"]
    assert any(i["action"] == "风控降级停止" for i in interventions)
    # 前 4 个岗位正常处理（dry_run），第 5 个触发停机：扫描计数 = 5
    assert summaries[0]["scanned"] == 5


# ---------------------------------------------------------------------------
# 5. XHR 透视：异常与状态码结构化带回
# ---------------------------------------------------------------------------


class _FakeTab:
    def __init__(self, payload):
        self._payload = payload

    async def evaluate(self, _js):
        return self._payload


def test_xhr_js_exception_surfaces_real_error():
    """网络层被拒（XHR 抛异常）→ code=xhr_error + 真实异常文本，不再是盲盒。"""
    payload = json.dumps({"code": "xhr_error", "message": "NetworkError: Failed to fetch", "status": 0})
    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(_FakeTab(payload), "query=x", page=1))
    assert "xhr_error" in str(exc_info.value)
    assert "NetworkError" in str(exc_info.value)


def test_http_error_status_surfaces_code():
    """HTTP 状态码异常 → code=http_403 直读。"""
    payload = json.dumps({"code": "http_403", "message": "HTTP 状态码异常"})
    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(job_api.fetch_search_page(_FakeTab(payload), "query=x", page=1))
    assert "http_403" in str(exc_info.value)
