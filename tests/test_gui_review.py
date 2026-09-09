from __future__ import annotations

import asyncio

import pytest

from boss_zhipin.gui import review_control
from boss_zhipin.website_oper import write_response

FIXED_GREETING = "您好，我是一名计科专业的大三学生，熟悉Go后端和RAG应用开发。"


@pytest.fixture(autouse=True)
def reset_review_control():
    review_control.reset()
    yield
    review_control.reset()


def test_gui_review_waits_for_decision():
    async def scenario():
        pending = {
            "index": 3,
            "job": {"title": "后端开发实习", "company": "测试公司", "location": "深圳"},
            "details": {"reason": "命中本地规则"},
            "greeting": FIXED_GREETING,
        }

        waiter = asyncio.create_task(review_control.request_review(pending))
        await asyncio.sleep(0)

        assert review_control.get_state()["pending"]["index"] == 3
        assert review_control.decide("send") == {
            "status": "accepted",
            "decision": "send",
        }
        assert await asyncio.wait_for(waiter, timeout=1) == "send"
        assert review_control.get_state()["pending"] is None

    asyncio.run(scenario())


def test_gui_review_rejects_decision_when_idle():
    with pytest.raises(RuntimeError, match="没有待审核岗位"):
        review_control.decide("skip")


def test_review_mode_uses_gui_decision_without_terminal_input(monkeypatch):
    async def scenario():
        sent: list[str] = []
        events: list[tuple[str, dict]] = []
        review_started = asyncio.Event()

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_text(selector: str):
            return "立即沟通"

        async def get_job(index: int):
            if index != 1:
                return None
            return write_response.finding_jobs.JobPosting(
                title="后端开发实习",
                description="深圳 后端开发实习 Go Redis",
                company="测试公司",
                location="深圳",
            )

        async def click_contact(xpath: str, timeout: float = 10):
            return True

        async def stay_on_page(timeout: float = 3):
            return False

        async def wait_for_chat(selector: str, timeout: float = 50):
            return True

        async def send_chat(text: str):
            sent.append(text)

        async def return_to_list(*args, **kwargs):
            return True

        def emit(kind: str, **payload):
            events.append((kind, payload))
            if kind == "review_requested":
                review_started.set()

        monkeypatch.setenv("BOSS_REVIEW_BEFORE_SEND", "1")
        monkeypatch.setenv("BOSS_GUI_REVIEW", "1")
        monkeypatch.setenv("BOSS_FIXED_GREETING", FIXED_GREETING)
        monkeypatch.setattr(
            write_response.finding_jobs, "open_browser_with_options", noop
        )
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(
            write_response.finding_jobs, "click_by_xpath", click_contact
        )
        monkeypatch.setattr(
            write_response.finding_jobs, "click_stay_on_page_if_present", stay_on_page
        )
        monkeypatch.setattr(write_response.finding_jobs, "wait_for_css", wait_for_chat)
        monkeypatch.setattr(write_response.finding_jobs, "send_chat_message", send_chat)
        monkeypatch.setattr(
            write_response.finding_jobs, "return_to_job_list", return_to_list
        )
        monkeypatch.setattr(
            write_response.finding_jobs, "scroll_to_load_more_jobs", lambda: noop()
        )
        monkeypatch.setattr(
            write_response.finding_jobs, "click_next_page_if_present", lambda: noop()
        )
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "log_attempt", lambda **kwargs: None)
        monkeypatch.setattr(write_response, "_emit_progress", emit)
        monkeypatch.setattr(
            "builtins.input",
            lambda prompt="": pytest.fail("GUI review must not read terminal input"),
        )

        task = asyncio.create_task(
            write_response.send_job_descriptions_to_chat(
                usr_name="测试",
                url="https://example.test",
                browser_type="chrome",
                label="",
                dry_run=False,
            )
        )
        await asyncio.wait_for(review_started.wait(), timeout=1)
        review_control.decide("send")
        await asyncio.wait_for(task, timeout=2)

        assert sent == [FIXED_GREETING]
        requested = [payload for kind, payload in events if kind == "review_requested"]
        assert requested[0]["job"]["title"] == "后端开发实习"
        assert requested[0]["greeting"] == FIXED_GREETING
        assert any(kind == "review_cleared" for kind, _ in events)

    asyncio.run(scenario())
