"""Scan-only mode for the job loop.

The mode is for previewing matching jobs without generating or sending a
greeting. It should still run the existing filters so the preview reflects the
same job-selection logic used by the normal flow.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from boss_zhipin.website_oper import write_response


def _patch_job_description(monkeypatch, get_jd) -> None:
    async def get_job(index: int):
        description = await get_jd(index)
        if description is None:
            return None
        title = description.split(maxsplit=1)[0] if description else ""
        return write_response.finding_jobs.JobPosting(title=title, description=description)

    monkeypatch.setattr(write_response.finding_jobs, "get_job_description_by_index", get_jd)
    monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)


def _patch_no_scroll(monkeypatch) -> None:
    async def no_scroll():
        return False

    async def no_next_page():
        return False

    monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
    monkeypatch.setattr(write_response.finding_jobs, "click_next_page_if_present", no_next_page)


def test_scan_only_does_not_generate_or_send(monkeypatch):
    async def scenario():
        calls: list[str] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_jd(index: int):
            return (
                "广州 后端开发 AI应用开发 Python FastAPI 大模型应用 RAG"
                if index == 1
                else None
            )

        async def get_text(selector: str):
            calls.append("get_text")
            return "立即沟通"

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        _patch_no_scroll(monkeypatch)
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        _patch_job_description(monkeypatch, get_jd)
        monkeypatch.setattr(
            write_response.finding_jobs,
            "get_text_by_css",
            get_text,
        )
        monkeypatch.setattr(
            write_response.finding_jobs,
            "click_by_xpath",
            lambda *args, **kwargs: pytest.fail("scan-only must not click contact"),
        )
        monkeypatch.setattr(
            write_response.finding_jobs,
            "send_chat_message",
            lambda *args, **kwargs: pytest.fail("scan-only must not send chat messages"),
        )

        events = []
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert any(
            kind == "job_found"
            and payload["index"] == 1
            and payload["jd_preview"] == "广州 后端开发 AI应用开发 Python FastAPI 大模型应用 RAG"
            for kind, payload in events
        )
        assert any(kind == "job_matched" and payload["status"] == "scan_only" for kind, payload in events)
        assert "get_text" in calls

    asyncio.run(scenario())


def test_scan_only_stops_at_max_jobs(monkeypatch):
    async def scenario():
        seen_indexes: list[int] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_jd(index: int):
            seen_indexes.append(index)
            return f"岗位{index} 深圳 后端开发 AI应用开发 Go RAG"

        async def get_text(selector: str):
            return "立即沟通"

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "2")
        _patch_no_scroll(monkeypatch)
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        _patch_job_description(monkeypatch, get_jd)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "_log_scan_match", lambda **kwargs: None)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert seen_indexes == [1, 2]

    asyncio.run(scenario())


def test_scan_only_scrolls_when_current_loaded_jobs_end(monkeypatch):
    async def scenario():
        seen_indexes: list[int] = []
        scrolls: list[str] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_jd(index: int):
            seen_indexes.append(index)
            if index == 1:
                return "深圳 后端开发实习 Go RAG"
            if index == 2 and scrolls:
                return "广州 AI应用开发实习 RAG"
            return None

        async def get_text(selector: str):
            return "立即沟通"

        async def scroll_more():
            scrolls.append("scroll")
            return True

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "2")
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        _patch_job_description(monkeypatch, get_jd)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", scroll_more)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "_log_scan_match", lambda **kwargs: None)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert scrolls == ["scroll"]
        assert seen_indexes == [1, 2, 2]

    asyncio.run(scenario())


def test_scan_only_retries_sixteenth_card_after_scroll_loads_more(monkeypatch):
    async def scenario():
        seen_indexes: list[int] = []
        scrolls: list[str] = []
        matched: list[dict] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_text(selector: str):
            return "立即沟通"

        async def scroll_more():
            scrolls.append("scroll")
            return len(scrolls) == 1

        async def get_job(index: int):
            seen_indexes.append(index)
            if 1 <= index <= 15:
                return write_response.finding_jobs.JobPosting(
                    title=f"销售实习{index}",
                    description="销售 客服",
                    company="A科技",
                    location="深圳",
                )
            if index == 16 and scrolls:
                return write_response.finding_jobs.JobPosting(
                    title="AI应用开发实习",
                    description="广州 RAG LangChain",
                    company="B智能",
                    location="广州",
                )
            return None

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "16")
        monkeypatch.setenv("BOSS_SCAN_REQUIRED_TERMS", "AI")
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", scroll_more)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "_log_scan_match", lambda **kwargs: matched.append(kwargs))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert scrolls == ["scroll"]
        assert seen_indexes == [*range(1, 17), 16]
        assert [item["job_description"] for item in matched] == [
            "广州 RAG LangChain",
        ]

    asyncio.run(scenario())


def test_scan_only_waits_at_loaded_boundary_instead_of_skipping_to_next_index(monkeypatch):
    async def scenario():
        seen_indexes: list[int] = []
        loaded_counts = [20, 20, 20, 21]
        boundary_attempts = 0
        matched: list[dict] = []

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

        async def get_loaded_count():
            return loaded_counts.pop(0) if loaded_counts else 21

        async def get_job(index: int):
            nonlocal boundary_attempts
            seen_indexes.append(index)
            if 1 <= index <= 20:
                return write_response.finding_jobs.JobPosting(
                    title=f"销售实习{index}",
                    description="销售 客服",
                    company="A科技",
                    location="深圳",
                )
            if index == 21:
                boundary_attempts += 1
            if index == 21 and boundary_attempts >= 3:
                return write_response.finding_jobs.JobPosting(
                    title="AI应用开发实习",
                    description="广州 RAG LangChain",
                    company="B智能",
                    location="广州",
                )
            return None

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "21")
        monkeypatch.setenv("BOSS_SCAN_REQUIRED_TERMS", "AI")
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.finding_jobs, "get_loaded_job_count", get_loaded_count)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
        monkeypatch.setattr(write_response.finding_jobs, "click_next_page_if_present", no_next_page)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "_log_scan_match", lambda **kwargs: matched.append(kwargs))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert seen_indexes == [*range(1, 21), 21, 21, 21]
        assert [item["job_description"] for item in matched] == [
            "广州 RAG LangChain",
        ]

    asyncio.run(scenario())


def test_start_url_skips_label_selection_to_preserve_manual_filters(monkeypatch):
    async def scenario():
        selected_labels: list[str] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def select_label(label: str):
            selected_labels.append(label)

        async def get_job(index: int):
            return None

        async def no_scroll():
            return False

        async def no_next_page():
            return False

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", select_label)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
        monkeypatch.setattr(write_response.finding_jobs, "click_next_page_if_present", no_next_page)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://www.zhipin.com/web/geek/jobs?query=AI",
            browser_type="chrome",
            label="AI应用开发实习",
            dry_run=False,
        )

        assert selected_labels == []

    asyncio.run(scenario())


def test_use_current_page_skips_open_url_and_page_filters(monkeypatch):
    async def scenario():
        calls: list[str] = []
        requested_indexes: list[int] = []

        async def open_browser(*args, **kwargs):
            calls.append("open_browser")

        async def ensure_current_tab():
            calls.append("ensure_current_tab")

        async def get_selected_job_index():
            calls.append("get_selected_job_index")
            return 7

        async def apply_filters(*args, **kwargs):
            calls.append("apply_filters")

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_job(index: int):
            requested_indexes.append(index)
            return None

        async def get_loaded_job_count():
            return 0

        async def no_scroll():
            return False

        async def no_next_page():
            return False

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        monkeypatch.setenv(
            "BOSS_PAGE_FILTERS_JSON",
            '{"city":{"enabled":true,"values":["深圳"]}}',
        )
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", open_browser)
        monkeypatch.setattr(write_response.finding_jobs, "ensure_current_tab", ensure_current_tab)
        monkeypatch.setattr(write_response.finding_jobs, "get_selected_job_index", get_selected_job_index)
        monkeypatch.setattr(write_response.finding_jobs, "get_current_url", lambda: "https://www.zhipin.com/web/geek/jobs")
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", apply_filters)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_loaded_job_count", get_loaded_job_count)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
        monkeypatch.setattr(write_response.finding_jobs, "click_next_page_if_present", no_next_page)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test/start",
            browser_type="chrome",
            label="后端开发实习",
            dry_run=False,
            use_current_page=True,
        )

        assert calls == ["ensure_current_tab", "get_selected_job_index"]
        assert requested_indexes == [7]

    asyncio.run(scenario())


def test_already_contacted_job_is_logged_with_button_state(monkeypatch, tmp_path):
    async def scenario():
        skipped_file = tmp_path / "skipped.jsonl"
        events: list[tuple[str, dict]] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_job(index: int):
            if index == 1:
                return write_response.finding_jobs.JobPosting(
                    title="后端开发",
                    description="深圳 Go Redis",
                    company="某某科技",
                )
            return None

        async def get_text(selector: str):
            return "继续沟通"

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        monkeypatch.setenv("BOSS_SKIPPED_LOG_FILE", str(skipped_file))
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_current_url", lambda: "")
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
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

        skipped = [
            json.loads(line)
            for line in skipped_file.read_text(encoding="utf-8").splitlines()
        ]
        assert skipped[0]["reason"] == "already_contacted"
        assert skipped[0]["match"]["button_text"] == "继续沟通"
        assert any(
            kind == "job_skipped"
            and payload["reason"] == "already_contacted"
            and "此前已沟通" in payload["detail"]
            for kind, payload in events
        )

    asyncio.run(scenario())


def test_scan_only_skips_duplicate_job_keys(monkeypatch):
    async def scenario():
        matched: list[dict] = []
        events: list[tuple[str, dict]] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_text(selector: str):
            return "立即沟通"

        async def no_scroll():
            return False

        async def get_job(index: int):
            if index in (1, 2):
                return write_response.finding_jobs.JobPosting(
                    title="后端开发实习",
                    description="深圳 Go Redis",
                    company="某某科技",
                    location="深圳",
                    boss_name="李女士",
                )
            return None

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "2")
        monkeypatch.setenv("BOSS_SCAN_REQUIRED_TERMS", "Go")
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "_log_scan_match", lambda **kwargs: matched.append(kwargs))
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert len(matched) == 1
        assert any(kind == "job_skipped" and payload["reason"] == "duplicate" for kind, payload in events)

    asyncio.run(scenario())


def test_scan_max_jobs_defaults_to_50(monkeypatch):
    monkeypatch.delenv("BOSS_SCAN_MAX_JOBS", raising=False)
    assert write_response._scan_max_jobs() == 50


def test_stable_job_identity_requires_card_metadata():
    assert (
        write_response._has_stable_job_identity(
            write_response.finding_jobs.JobPosting(title="", description="只有 JD")
        )
        is False
    )
    assert (
        write_response._has_stable_job_identity(
            write_response.finding_jobs.JobPosting(title="后端开发实习", description="JD")
        )
        is True
    )


def test_matches_all_groups_requires_each_group():
    ok, reason = write_response._matches_all_groups(
        "广州 AI应用开发实习 后端开发",
        [["实习"], ["广州", "深圳"]],
    )
    assert ok is True
    assert "命中扫描条件" in reason


def test_matches_all_groups_rejects_missing_location():
    ok, reason = write_response._matches_all_groups(
        "广州 AI应用开发 后端开发",
        [["实习"], ["广州", "深圳"]],
    )
    assert ok is False
    assert "实习" in reason or "广州" in reason


def test_scan_only_skips_when_conditions_do_not_match(monkeypatch):
    async def scenario():
        logged_matches: list[dict] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def get_jd(index: int):
            return "深圳 门店销售 电话销售"

        async def get_text(selector: str):
            return "立即沟通"

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_KEYWORDS", "后端开发,AI应用开发")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        _patch_no_scroll(monkeypatch)
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        _patch_job_description(monkeypatch, get_jd)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "_log_scan_match", lambda **kwargs: logged_matches.append(kwargs))
        events = []
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="后端开发",
            dry_run=False,
        )

        assert logged_matches == []
        assert any(kind == "job_skipped" and payload["reason"] == "scan_only" for kind, payload in events)
        assert not any(kind == "job_matched" for kind, _ in events)

    asyncio.run(scenario())


def test_profile_state_skips_seen_job_and_logs_skip(monkeypatch, tmp_path):
    async def scenario():
        seen_file = tmp_path / "seen.jsonl"
        skipped_file = tmp_path / "skipped.jsonl"
        seen_file.write_text(
            json.dumps({"job_key": "后端开发实习|某某科技|深圳|李女士"}, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        events: list[tuple[str, dict]] = []

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def no_scroll():
            return False

        async def get_job(index: int):
            if index == 1:
                return write_response.finding_jobs.JobPosting(
                    title="后端开发实习",
                    description="深圳 Go Redis",
                    company="某某科技",
                    location="深圳",
                    boss_name="李女士",
                )
            return None

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        monkeypatch.setenv("BOSS_PROFILE_NAME", "backend")
        monkeypatch.setenv("BOSS_SEEN_JOBS_FILE", str(seen_file))
        monkeypatch.setenv("BOSS_SKIPPED_LOG_FILE", str(skipped_file))
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)
        monkeypatch.setattr(write_response, "_emit_progress", lambda kind, **payload: events.append((kind, payload)))

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        skipped = [json.loads(line) for line in skipped_file.read_text(encoding="utf-8").splitlines()]
        assert skipped[0]["profile"] == "backend"
        assert skipped[0]["job_key"] == "后端开发实习|某某科技|深圳|李女士"
        assert skipped[0]["reason"] == "duplicate"
        assert any(kind == "job_skipped" and payload["reason"] == "duplicate" for kind, payload in events)

    asyncio.run(scenario())


def test_profile_state_logs_seen_and_scan_match(monkeypatch, tmp_path):
    async def scenario():
        seen_file = tmp_path / "seen.jsonl"
        sent_file = tmp_path / "sent.jsonl"

        async def noop(*args, **kwargs):
            return None

        async def fast_sleep(delay: float):
            return None

        async def no_scroll():
            return False

        async def get_text(selector: str):
            return "立即沟通"

        async def get_job(index: int):
            if index == 1:
                return write_response.finding_jobs.JobPosting(
                    title="后端开发实习",
                    description="深圳 Go Redis",
                    company="某某科技",
                    location="深圳",
                    boss_name="李女士",
                )
            return None

        monkeypatch.setenv("BOSS_SCAN_ONLY", "1")
        monkeypatch.setenv("BOSS_SCAN_MAX_JOBS", "1")
        monkeypatch.setenv("BOSS_PROFILE_NAME", "backend")
        monkeypatch.setenv("BOSS_SEEN_JOBS_FILE", str(seen_file))
        monkeypatch.setenv("BOSS_SENT_LOG_FILE", str(sent_file))
        monkeypatch.setattr(write_response.finding_jobs, "open_browser_with_options", noop)
        monkeypatch.setattr(write_response.finding_jobs, "log_in", noop)
        monkeypatch.setattr(write_response.finding_jobs, "select_dropdown_option", noop)
        monkeypatch.setattr(write_response.finding_jobs, "apply_page_filters", noop)
        monkeypatch.setattr(write_response.finding_jobs, "get_job_by_index", get_job)
        monkeypatch.setattr(write_response.finding_jobs, "get_text_by_css", get_text)
        monkeypatch.setattr(write_response.finding_jobs, "scroll_to_load_more_jobs", no_scroll)
        monkeypatch.setattr(write_response.asyncio, "sleep", fast_sleep)

        await write_response.send_job_descriptions_to_chat(
            usr_name="测试",
            url="https://example.test",
            browser_type="chrome",
            label="",
            dry_run=False,
        )

        seen = [json.loads(line) for line in seen_file.read_text(encoding="utf-8").splitlines()]
        sent = [json.loads(line) for line in sent_file.read_text(encoding="utf-8").splitlines()]
        assert seen[0]["job_key"] == "后端开发实习|某某科技|深圳|李女士"
        assert sent[0]["status"] == "scan_only"
        assert sent[0]["send_mode"] == "scan"
        assert sent[0]["job"]["title"] == "后端开发实习"

    asyncio.run(scenario())
