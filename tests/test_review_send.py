"""Fixed greeting send modes.

Manual review mode pauses per matched job. Auto-send mode sends the fixed
greeting immediately after the hard job filter matches.
"""
from __future__ import annotations

import asyncio
import json
from inspect import signature

import pytest

from boss_zhipin.website_oper import write_response

FIXED_GREETING = "您好，我是一名计科专业的大三学生，熟悉Go后端和RAG应用开发。"


def test_auto_required_terms_can_be_empty(monkeypatch):
    monkeypatch.delenv("BOSS_AUTO_TITLE_REQUIRED_TERMS", raising=False)
    monkeypatch.delenv("BOSS_AUTO_REQUIRED_TERMS", raising=False)

    assert write_response._auto_required_terms() == []


def test_job_loop_no_longer_exposes_llm_or_resume_flow():
    removed = ("generate_letter", "should_apply", "current_provider_label")

    for name in removed:
        assert not hasattr(write_response, name)


def test_state_record_includes_local_timestamp():
    record = write_response._state_record(
        job=write_response.finding_jobs.JobPosting(
            title="AI开发实习生",
            description="负责 AI 应用开发",
        ),
        job_key="AI开发实习生",
        send_mode="auto",
        status="skipped",
    )

    assert "ts" in record
    assert "ts_local" in record
    assert len(record["ts_local"]) == len("2026-06-30 16:45:12")


def test_auto_send_event_includes_match_explanation(monkeypatch):
    async def scenario():
        events: list[tuple[str, dict]] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_text(selector: str):
            return "立即沟通"

        async def no_scroll():
            return False

        async def no_next_page():
            return False

        async def get_job(index: int):
            if index != 1:
                return None
            return write_response.finding_jobs.JobPosting(
                title="AI应用研究员（实习生）",
                description="负责 AI 应用开发",
            )

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "1")
        monkeypatch.setenv(
            "BOSS_PROFILE_FILTERS_JSON",
            '{"title":{"required":{"enabled":true,"scope":"title","keywords":["实习"]},"any":{"enabled":true,"scope":"title","keywords":["AI"]}}}',
        )
        monkeypatch.setattr(
            write_response.finding_jobs, "open_browser_with_options", noop
        )
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
        monkeypatch.setattr(write_response.finding_jobs, "click_next_page_if_present", no_next_page)
        monkeypatch.setattr(write_response, "click_contact_and_send_response", noop)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(
            write_response,
            "_emit_progress",
            lambda kind, **payload: events.append((kind, payload)),
        )

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        sent_events = [payload for kind, payload in events if kind == "letter_sent"]
        assert sent_events[0]["match_explanation"] == "只看岗位名称命中必须关键词「实习」，并命中方向关键词「AI」"

    import asyncio

    asyncio.run(scenario())

    params = signature(write_response.send_job_descriptions_to_chat).parameters
    forbidden = {
        "vectorstore",
        "resume_keywords",
        "resume_text",
        "min_keyword_match",
        "min_llm_score",
        "exclude_keywords",
    }
    assert forbidden.isdisjoint(params)


def test_sent_log_includes_match_explanation(tmp_path):
    sent_file = tmp_path / "sent_jobs.jsonl"
    details = {
        "explanation": "只看岗位名称命中必须关键词「实习」，并命中方向关键词「AI」",
        "stage": "profile_filter",
    }

    write_response._log_sent(
        sent_file,
        job=write_response.finding_jobs.JobPosting(
            title="AI应用研究员（实习生）",
            description="负责 AI 应用开发",
        ),
        job_key="AI应用研究员（实习生）",
        send_mode="auto",
        status="sent",
        details=details,
        sent=True,
    )

    record = json.loads(sent_file.read_text(encoding="utf-8").strip())

    assert record["match_explanation"] == details["explanation"]
    assert record["match"] == details


def test_send_loop_requires_explicit_mode(monkeypatch):
    async def scenario():
        async def open_browser(*args, **kwargs):
            pytest.fail("未选择运行模式时不应打开浏览器")

        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", open_browser)

        with pytest.raises(RuntimeError, match="运行模式"):
            await write_response.send_job_descriptions_to_chat(
                usr_name="测试",
                url="https://example.test",
                browser_type="chrome",
                label="",
                dry_run=True,
            )

    asyncio.run(scenario())


def _patch_browser(monkeypatch, *, get_jd, sent, sleeps):
    async def noop(*args, **kwargs):
        return None

    async def fast_sleep(delay: float):
        sleeps.append(delay)

    async def get_text(selector: str):
        return "立即沟通"

    async def click_contact(xpath: str, timeout: float = 10):
        return True

    async def wait_for_chat(selector: str, timeout: float = 50):
        return True

    async def stay_on_page(timeout: float = 3):
        return False

    async def send_chat(text: str):
        sent.append(text)

    async def return_to_list(*args, **kwargs):
        return True

    async def no_scroll():
        return False

    async def no_next_page():
        return False

    async def get_job(index: int):
        description = await get_jd(index)
        if description is None:
            return None
        title = description.split(maxsplit=1)[0] if description else ""
        return write_response.finding_jobs.JobPosting(title=title, description=description)

    monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
    monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
    monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
    monkeypatch.setattr(write_response.finding_jobs, "get_job_description_by_index", get_jd)
    monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
    monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
    monkeypatch.setattr(write_response.finding_jobs, "click_by_xpath", click_contact)
    monkeypatch.setattr(write_response.finding_jobs, "click_stay_on_page_if_present", stay_on_page)
    monkeypatch.setattr(write_response.finding_jobs, "wait_for_css", wait_for_chat)
    monkeypatch.setattr(write_response.finding_jobs, "send_chat_message", send_chat)
    monkeypatch.setattr(write_response.finding_jobs, "navigate_back", noop)
    monkeypatch.setattr(write_response.finding_jobs, "return_to_job_list", return_to_list)
    monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
    monkeypatch.setattr(write_response.finding_jobs, "click_next_page_if_present", no_next_page)
    monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)


def _patch_job_postings(monkeypatch, postings: dict[int, tuple[str, str]]) -> None:
    async def get_job(index: int):
        posting = postings.get(index)
        if posting is None:
            return None
        title, description = posting
        return write_response.finding_jobs.JobPosting(title=title, description=description)

    monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)


def test_review_mode_sends_fixed_greeting_after_approval(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        audit_records: list[dict] = []
        prompts: list[str] = []

        async def get_jd(index: int):
            return "广州 后端开发实习 Go RAG AI应用开发" if index == 1 else None

        monkeypatch.setenv("BOSS_REVIEW_BEFORE_SEND", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: audit_records.append(kwargs))
        monkeypatch.setattr("builtins.input", lambda prompt="": prompts.append(prompt) or "y")

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert sent == [FIXED_GREETING]
        assert audit_records[0]["sent"] is True
        assert audit_records[0]["dry_run"] is False
        assert audit_records[0]["letter"] == sent[0]
        assert any("发送" in prompt for prompt in prompts)

    asyncio.run(scenario())


def test_review_mode_skip_does_not_send(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        audit_records: list[dict] = []

        async def get_jd(index: int):
            return "深圳 AI应用开发实习 RAG LangChain" if index == 1 else None

        monkeypatch.setenv("BOSS_REVIEW_BEFORE_SEND", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: audit_records.append(kwargs))
        monkeypatch.setattr("builtins.input", lambda prompt="": "n")

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="AI应用开发",
            dry_run=False,
        )

        assert sent == []
        assert audit_records == []

    asyncio.run(scenario())


def test_review_mode_required_terms_skip_before_prompt(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        events: list[tuple[str, dict]] = []

        async def get_jd(index: int):
            return "广州 后端开发 Go RAG AI应用开发" if index == 1 else None

        monkeypatch.setenv("BOSS_REVIEW_BEFORE_SEND", "1")
        monkeypatch.setenv("BOSS_REVIEW_REQUIRED_TERMS", "实习")
        monkeypatch.setenv("BOSS_REVIEW_LOCATIONS", "广州,深圳")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        monkeypatch.setattr("builtins.input", lambda prompt="": pytest.fail("must skip before prompting"))
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert sent == []
        assert any(kind == "job_skipped" and payload["reason"] == "required_terms" for kind, payload in events)

    asyncio.run(scenario())


def test_review_mode_requires_fixed_greeting(monkeypatch):
    async def scenario():
        async def noop(*args, **kwargs):
            return None

        async def get_jd(index: int):
            return "广州 后端开发实习 Go"

        async def get_text(selector: str):
            return "立即沟通"

        monkeypatch.setenv("BOSS_REVIEW_BEFORE_SEND", "1")
        monkeypatch.delenv("BOSS_FIXED_GREETING", raising=False)
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_description_by_index", get_jd)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)

        with pytest.raises(RuntimeError, match="BOSS_FIXED_GREETING"):
            await write_response.send_job_descriptions_to_chat(
                usr_name="测试",
                url="https://example.test",
                browser_type="chrome",
                label="后端开发",
                dry_run=False,
            )

    asyncio.run(scenario())


def test_auto_send_sends_without_prompt_and_waits_random_delay(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        audit_records: list[dict] = []
        events: list[tuple[str, dict]] = []

        async def get_jd(index: int):
            return postings.get(index, ("", ""))[1] if index in postings else None

        postings = {
            1: ("AI应用开发实习", "上海 RAG LangChain 大模型应用"),
            2: ("后端开发实习", "北京 Go Redis MySQL"),
        }

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "2")
        monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MIN", "10")
        monkeypatch.setenv("BOSS_AUTO_SEND_DELAY_MAX", "60")
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        _patch_job_postings(monkeypatch, postings)
        monkeypatch.setattr("builtins.input", lambda prompt="": pytest.fail("auto-send must not prompt"))
        monkeypatch.setattr(write_response.random, "uniform", lambda low, high: 23.5)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: audit_records.append(kwargs))
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        assert sent == [FIXED_GREETING, FIXED_GREETING]
        assert all(record["sent"] is True for record in audit_records)
        assert 23.5 in sleeps
        assert any(kind == "feed_exhausted" for kind, _ in events)

    asyncio.run(scenario())


def test_auto_send_stops_when_daily_limit_already_reached(monkeypatch, tmp_path):
    async def scenario():
        from datetime import datetime
        import json

        sent_file = tmp_path / "sent.jsonl"
        sent_file.write_text(
            json.dumps(
                {
                    "ts": datetime.now().isoformat(),
                    "profile": "backend",
                    "status": "sent",
                    "sent": True,
                },
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )

        async def noop(*args, **kwargs):
            return None

        async def get_job(index: int):
            pytest.fail("daily limit should stop before reading jobs")

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_DAILY_LIMIT", "1")
        monkeypatch.setenv("BOSS_PROFILE_NAME", "backend")
        monkeypatch.setenv("BOSS_SENT_LOG_FILE", str(sent_file))
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

    asyncio.run(scenario())


def test_stop_on_captcha_raises_before_job_loop(monkeypatch):
    async def scenario():
        async def noop(*args, **kwargs):
            return None

        async def captcha_visible():
            return True

        async def get_job(index: int):
            pytest.fail("captcha should stop before reading jobs")

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_STOP_ON_CAPTCHA", "1")
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "captcha_visible", captcha_visible)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)

        with pytest.raises(RuntimeError, match="验证码"):
            await write_response.send_job_descriptions_to_chat(
                usr_name="测试",
                url="https://example.test",
                browser_type="chrome",
                label="",
                dry_run=False,
            )

    asyncio.run(scenario())


def test_auto_send_clicks_stay_on_page_before_chat_input(monkeypatch):
    async def scenario():
        calls: list[str] = []
        sleeps: list[float] = []
        audit_records: list[dict] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            sleeps.append(delay)

        async def get_jd(index: int):
            return "深圳 Go Redis MySQL" if index == 1 else None

        async def get_text(selector: str):
            return "立即沟通"

        async def click_contact(xpath: str, timeout: float = 10):
            calls.append("click_contact")
            return True

        async def stay_on_page(timeout: float = 3):
            calls.append("stay_on_page")
            return True

        async def wait_for_chat(selector: str, timeout: float = 50):
            calls.append("wait_chat")
            return True

        async def return_to_list(*args, **kwargs):
            return True

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "1")
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_description_by_index", get_jd)
        _patch_job_postings(monkeypatch, {1: ("后端开发实习", "深圳 Go Redis MySQL")})
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.finding_jobs, "click_by_xpath", click_contact)
        monkeypatch.setattr(write_response.finding_jobs, "click_stay_on_page_if_present", stay_on_page)
        monkeypatch.setattr(write_response.finding_jobs, "wait_for_css", wait_for_chat)
        monkeypatch.setattr(write_response.finding_jobs, "return_to_job_list", return_to_list)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: audit_records.append(kwargs))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        assert calls == ["click_contact", "stay_on_page"]
        assert audit_records[0]["sent"] is True
        assert audit_records[0]["letter"] == FIXED_GREETING

    asyncio.run(scenario())


def test_send_response_returns_to_job_list(monkeypatch):
    async def scenario():
        calls: list[str] = []

        async def send_chat(text: str):
            calls.append(f"send:{text}")

        async def fast_sleep(delay: float):
            calls.append(f"sleep:{delay}")

        async def return_to_list():
            calls.append("return_to_list")
            return True

        monkeypatch.setattr(write_response.finding_jobs, "send_chat_message", send_chat)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response.finding_jobs, "return_to_job_list", return_to_list)

        await write_response.send_response_and_go_back("hello")

        assert calls == ["send:hello", "sleep:10", "return_to_list"]

    asyncio.run(scenario())


def test_click_contact_treats_stay_on_page_confirmation_as_sent(monkeypatch):
    async def scenario():
        calls: list[str] = []

        async def click_contact(xpath: str, timeout: float = 10):
            calls.append("click_contact")
            return True

        async def stay_on_page(timeout: float = 3):
            calls.append("stay_on_page")
            return True

        async def wait_for_chat(selector: str, timeout: float = 50):
            calls.append("wait_chat")
            return True

        monkeypatch.setattr(write_response.finding_jobs, "click_by_xpath", click_contact)
        monkeypatch.setattr(write_response.finding_jobs, "click_stay_on_page_if_present", stay_on_page)
        monkeypatch.setattr(write_response.finding_jobs, "wait_for_css", wait_for_chat)

        await write_response.click_contact_and_send_response("hello")

        assert calls == ["click_contact", "stay_on_page"]

    asyncio.run(scenario())


def test_click_contact_uses_chat_input_when_no_confirmation(monkeypatch):
    async def scenario():
        calls: list[str] = []

        async def click_contact(xpath: str, timeout: float = 10):
            calls.append("click_contact")
            return True

        async def stay_on_page(timeout: float = 3):
            calls.append("stay_on_page")
            return False

        async def wait_for_chat(selector: str, timeout: float = 50):
            calls.append("wait_chat")
            return True

        async def send_response(response: str):
            calls.append(f"send:{response}")

        monkeypatch.setattr(write_response.finding_jobs, "click_by_xpath", click_contact)
        monkeypatch.setattr(write_response.finding_jobs, "click_stay_on_page_if_present", stay_on_page)
        monkeypatch.setattr(write_response.finding_jobs, "wait_for_css", wait_for_chat)
        monkeypatch.setattr(write_response, "send_response_and_go_back", send_response)

        await write_response.click_contact_and_send_response("hello")

        assert calls == ["click_contact", "stay_on_page", "wait_chat", "send:hello"]

    asyncio.run(scenario())


def test_send_response_raises_when_return_to_list_fails(monkeypatch):
    async def scenario():
        async def send_chat(text: str):
            return None

        async def fast_sleep(delay: float):
            return None

        async def return_to_list():
            return False

        monkeypatch.setattr(write_response.finding_jobs, "send_chat_message", send_chat)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response.finding_jobs, "return_to_job_list", return_to_list)

        with pytest.raises(RuntimeError, match="返回岗位列表"):
            await write_response.send_response_and_go_back("hello")

    asyncio.run(scenario())


def test_auto_send_skips_wrong_direction_without_required_terms(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        events: list[tuple[str, dict]] = []

        postings = {
            1: ("产品经理", "广州 实习 用户研究"),
            2: ("销售实习", "深圳 电话销售"),
            3: ("后端开发", "杭州 Java Spring"),
        }

        async def get_jd(index: int):
            return postings.get(index, ("", ""))[1] if index in postings else None

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "1")
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        _patch_job_postings(monkeypatch, postings)
        monkeypatch.setattr(write_response.random, "uniform", lambda low, high: 10)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        assert sent == [FIXED_GREETING]
        skipped_details = [payload["detail"] for kind, payload in events if kind == "job_skipped"]
        assert len(skipped_details) == 2
        assert all("后端开发/ai" in detail for detail in skipped_details)

    asyncio.run(scenario())


def test_auto_send_uses_profile_filters_when_configured(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        events: list[tuple[str, dict]] = []

        postings = {
            1: ("后端开发实习", "广州 Go Redis MySQL"),
            2: ("AI应用开发实习", "深圳 RAG LangChain"),
        }

        async def get_jd(index: int):
            return postings.get(index, ("", ""))[1] if index in postings else None

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "1")
        monkeypatch.setenv(
            "BOSS_PROFILE_FILTERS_JSON",
            (
                '{"title": {'
                '"required": {"enabled": true, "keywords": ["实习"]},'
                '"any": {"enabled": true, "keywords": ["AI应用开发"]}'
                "}}"
            ),
        )
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        _patch_job_postings(monkeypatch, postings)
        monkeypatch.setattr(write_response.random, "uniform", lambda low, high: 10)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        assert sent == [FIXED_GREETING]
        skipped = [payload for kind, payload in events if kind == "job_skipped"]
        assert skipped[0]["reason"] == "profile_filter"
        assert "AI应用开发" in skipped[0]["detail"]

    asyncio.run(scenario())


def test_profile_filters_can_match_location_field(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        events: list[tuple[str, dict]] = []

        postings = {
            1: write_response.finding_jobs.JobPosting(
                title="AI应用开发实习",
                description="RAG LangChain",
                location="吉安",
            ),
            2: write_response.finding_jobs.JobPosting(
                title="AI应用开发实习",
                description="RAG LangChain",
                location="深圳",
            ),
        }

        async def get_jd(index: int):
            posting = postings.get(index)
            return posting.description if posting else None

        async def get_job(index: int):
            return postings.get(index)

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "1")
        monkeypatch.setenv(
            "BOSS_PROFILE_FILTERS_JSON",
            (
                '{"title": {"required": {"enabled": true, "keywords": ["实习"]}},'
                '"location": {"any": {"enabled": true, "keywords": ["深圳"]}}}'
            ),
        )
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.random, "uniform", lambda low, high: 10)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        assert sent == [FIXED_GREETING]
        skipped = [payload for kind, payload in events if kind == "job_skipped"]
        assert skipped[0]["reason"] == "profile_filter"
        assert "深圳" in skipped[0]["detail"]

    asyncio.run(scenario())


def test_page_boss_active_values_are_used_as_local_or_filter(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        events: list[tuple[str, dict]] = []
        page_filters_seen: list[dict] = []

        postings = {
            1: write_response.finding_jobs.JobPosting(
                title="AI应用开发实习",
                description="RAG LangChain\n张先生\n3日内活跃",
                boss_active_status="3日内活跃",
            ),
            2: write_response.finding_jobs.JobPosting(
                title="AI应用开发实习",
                description="RAG LangChain\n王先生\n3月内活跃",
                boss_active_status="3月内活跃",
            ),
        }

        async def get_jd(index: int):
            posting = postings.get(index)
            return posting.description if posting else None

        async def get_job(index: int):
            return postings.get(index)

        async def apply_page_filters(filters, *, emit_event=None):
            page_filters_seen.append(filters)

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "1")
        monkeypatch.setenv(
            "BOSS_PROFILE_FILTERS_JSON",
            '{"title": {"required": {"enabled": true, "keywords": ["实习"]}}}',
        )
        monkeypatch.setenv(
            "BOSS_PAGE_FILTERS_JSON",
            (
                '{"strict": false,'
                '"boss_active": {"enabled": true,'
                '"values": ["今日活跃", "3日内活跃", "本周活跃"]}}'
            ),
        )
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", apply_page_filters)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.random, "uniform", lambda low, high: 10)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        assert sent == [FIXED_GREETING]
        assert page_filters_seen[0]["boss_active"]["enabled"] is False
        sent_events = [payload for kind, payload in events if kind == "letter_sent"]
        assert "BOSS 信息" in sent_events[0]["match_explanation"]
        assert "3日内活跃" in sent_events[0]["match_explanation"]

    asyncio.run(scenario())


def test_missing_boss_active_status_does_not_block_title_match(monkeypatch):
    async def scenario():
        sent: list[str] = []
        sleeps: list[float] = []
        events: list[tuple[str, dict]] = []

        async def get_jd(index: int):
            if index == 1:
                return "负责 RAG 和 LangChain 应用开发"
            return None

        async def get_job(index: int):
            if index != 1:
                return None
            return write_response.finding_jobs.JobPosting(
                title="AI应用开发实习",
                description="负责 RAG 和 LangChain 应用开发",
                company="B智能",
                location="深圳",
            )

        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setenv("BOSS_AUTO_SEND_MAX_SENT", "1")
        monkeypatch.setenv(
            "BOSS_PROFILE_FILTERS_JSON",
            (
                '{"title": {'
                '"required": {"enabled": true, "scope": "title", "keywords": ["实习"]},'
                '"any": {"enabled": true, "scope": "title", "keywords": ["AI"]}}}'
            ),
        )
        monkeypatch.setenv(
            "BOSS_PAGE_FILTERS_JSON",
            '{"boss_active": {"enabled": true, "values": ["今日活跃", "刚刚活跃"]}}',
        )
        _patch_browser(monkeypatch, get_jd=get_jd, sent=sent, sleeps=sleeps)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.random, "uniform", lambda low, high: 10)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        assert sent == [FIXED_GREETING]
        sent_events = [payload for kind, payload in events if kind == "letter_sent"]
        assert sent_events[0]["match_details"]["boss_active_note"].startswith("页面未采集到")
        assert "只看岗位名称" in sent_events[0]["match_explanation"]

    asyncio.run(scenario())


def test_boss_active_page_filter_is_disabled_for_page_clicks():
    page_filters = {
        "strict": False,
        "city": {"enabled": True, "values": ["深圳"]},
        "boss_active": {
            "enabled": True,
            "values": ["今日活跃", "3日内活跃", "本周活跃"],
        },
    }

    click_filters = write_response._page_filters_for_click(page_filters)
    merged_filters = write_response._merge_boss_active_filter({}, page_filters)

    assert click_filters["city"]["enabled"] is True
    assert click_filters["boss_active"]["enabled"] is False
    assert merged_filters["boss_active"]["any"]["scope"] == "boss"
    assert merged_filters["boss_active"]["any"]["keywords"] == [
        "今日活跃",
        "3日内活跃",
        "本周活跃",
    ]


def test_boss_active_filter_does_not_override_title_rules():
    filters = write_response._merge_boss_active_filter(
        {
            "title": {
                "required": {"enabled": True, "scope": "title", "keywords": ["实习"]},
                "any": {"enabled": True, "scope": "title", "keywords": ["AI"]},
            }
        },
        {
            "boss_active": {
                "enabled": True,
                "values": ["今日活跃", "刚刚活跃"],
            }
        },
    )
    posting = write_response.FilterJobPosting(
        title="AI开发实习生",
        boss_active_status="刚刚活跃",
    )

    match = write_response.match_posting(posting, filters)
    explanation = write_response.explain_posting_match(posting, filters)

    assert match.matched is True
    assert "实习" in explanation["explanation"]
    assert "刚刚活跃" in explanation["explanation"]


def test_matches_auto_send_job_accepts_intern_ai_or_backend():
    assert write_response._matches_auto_send_job(title="AI应用开发实习", description="RAG")[0] is True
    assert write_response._matches_auto_send_job(title="ai应用开发实习", description="RAG")[0] is True
    assert write_response._matches_auto_send_job(title="后端开发实习", description="Go Redis")[0] is True
    assert write_response._matches_auto_send_job(title="后端开发", description="实习 Go Redis")[0] is True
    assert write_response._matches_auto_send_job(title="销售实习", description="后端开发")[0] is False


def test_auto_send_policy_matches_title_not_description():
    policy = write_response.KeywordPolicy(
        required_terms=["实习"],
        any_groups=[["后端开发", "ai"]],
        scope="title",
    )

    assert policy.match(title="后端开发实习生", description="岗位职责：Go Redis")[0] is True
    assert policy.match(title="AI应用开发实习", description="岗位职责：RAG")[0] is True
    assert policy.match(title="后端开发", description="岗位职责：实习生")[0] is False
    assert policy.match(title="销售实习", description="岗位职责：后端开发")[0] is False
