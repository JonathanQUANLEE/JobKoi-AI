"""finding_jobs 的纯文本处理（不碰浏览器的部分）。

``_strip_jd_noise`` 剥掉 JD 开头的页面 UI 噪声行（举报 / 微信扫码分享 / 职位描述…），
这些是 ``.job-detail-body`` 的 innerText 带进来的页面 chrome，不是 JD 正文。
"""
import asyncio

from boss_zhipin.website_oper.finding_jobs import (
    _clear_singleton_locks,
    extract_boss_active_status,
    _is_logged_in_from_page_state,
    _parse_job_card_text,
    _strip_jd_noise,
    job_key,
)
from boss_zhipin.website_oper import finding_jobs


class _FakeButton:
    def __init__(self):
        self.clicked = False

    async def click(self):
        self.clicked = True


class _FakeChat:
    def __init__(self):
        self.keys: list[str] = []

    async def send_keys(self, value: str):
        self.keys.append(value)


class _FakeTab:
    def __init__(self, *, button=None, chat=None):
        self.button = button
        self.chat = chat

    async def find(self, text: str, **kwargs):
        return self.button

    async def select(self, selector: str, **kwargs):
        return self.chat


async def _fast_sleep(_delay: float):
    return None


def test_dismiss_greeting_dialog_clicks_continue(monkeypatch):
    async def scenario():
        button = _FakeButton()
        monkeypatch.setattr(finding_jobs, "_tab", _FakeTab(button=button))
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", _fast_sleep)

        assert await finding_jobs.dismiss_greeting_dialog() is True
        assert button.clicked is True

    asyncio.run(scenario())


def test_send_chat_message_clicks_send_button(monkeypatch):
    async def scenario():
        button = _FakeButton()
        chat = _FakeChat()
        monkeypatch.setattr(finding_jobs, "_tab", _FakeTab(button=button, chat=chat))
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", _fast_sleep)

        await finding_jobs.send_chat_message("你好")

        assert chat.keys == ["你好"]
        assert button.clicked is True

    asyncio.run(scenario())


def test_send_chat_message_falls_back_to_enter_when_button_missing(monkeypatch):
    async def scenario():
        chat = _FakeChat()
        monkeypatch.setattr(finding_jobs, "_tab", _FakeTab(chat=chat))
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", _fast_sleep)

        await finding_jobs.send_chat_message("你好")

        assert chat.keys == ["你好", "\n"]

    asyncio.run(scenario())


def test_click_send_resume_is_optional(monkeypatch):
    async def scenario():
        button = _FakeButton()
        monkeypatch.setattr(finding_jobs, "_tab", _FakeTab(button=button))
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", _fast_sleep)
        assert await finding_jobs.click_send_resume() is True
        assert button.clicked is True

        monkeypatch.setattr(finding_jobs, "_tab", _FakeTab())
        assert await finding_jobs.click_send_resume() is False

    asyncio.run(scenario())


def test_strips_leading_ui_noise():
    raw = "举报\n微信扫码分享\n职位描述\n\n1、参与 AI 功能模块设计\n岗位要求：本科"
    out = _strip_jd_noise(raw)
    assert out.startswith("1、参与 AI 功能模块设计")
    assert "举报" not in out
    assert "微信扫码分享" not in out


def test_only_strips_leading_run_not_body():
    # 正文里再出现"职位描述"不该被剥——只剥开头连续的噪声行
    raw = "举报\n职位描述\n这个职位描述很详细\n岗位要求"
    assert _strip_jd_noise(raw) == "这个职位描述很详细\n岗位要求"


def test_no_noise_unchanged():
    raw = "1、岗位职责\n2、岗位要求"
    assert _strip_jd_noise(raw) == raw


def test_empty_and_none():
    assert _strip_jd_noise("") == ""
    assert _strip_jd_noise(None) == ""


def test_clear_singleton_locks_removes_locks_keeps_cookies(tmp_path):
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket", "Cookies"):
        (tmp_path / name).write_text("x")
    _clear_singleton_locks(str(tmp_path))
    # 三个 Singleton 锁删掉；登录态文件（Cookies）保留
    assert not (tmp_path / "SingletonLock").exists()
    assert not (tmp_path / "SingletonCookie").exists()
    assert not (tmp_path / "SingletonSocket").exists()
    assert (tmp_path / "Cookies").exists()


def test_clear_singleton_locks_missing_ok(tmp_path):
    _clear_singleton_locks(str(tmp_path))  # 没有锁文件也不报错


def test_login_page_url_is_not_logged_in():
    assert _is_logged_in_from_page_state("https://www.zhipin.com/web/user/?ka=header-login", {}) is False


def test_jobs_page_with_header_login_is_not_logged_in():
    assert _is_logged_in_from_page_state(
        "https://www.zhipin.com/web/geek/jobs",
        {"headerLoginVisible": True},
    ) is False


def test_jobs_page_with_login_required_text_is_not_logged_in():
    assert _is_logged_in_from_page_state(
        "https://www.zhipin.com/web/geek/jobs",
        {"loginRequiredVisible": True},
    ) is False


def test_jobs_page_without_login_signals_is_logged_in():
    assert _is_logged_in_from_page_state(
        "https://www.zhipin.com/web/geek/job-recommend",
        {
            "loginWallVisible": False,
            "headerLoginVisible": False,
            "loginRequiredVisible": False,
        },
    ) is True


def test_get_selected_job_index_uses_detected_card(monkeypatch):
    async def scenario():
        async def evaluate(js: str, timeout: float = 10):
            assert ".job-card-box" in js
            return {"index": 7, "detected": True, "reason": "active_marker"}

        monkeypatch.setattr(finding_jobs, "_safe_evaluate", evaluate)

        assert await finding_jobs.get_selected_job_index() == 7

    asyncio.run(scenario())


def test_get_selected_job_index_falls_back_to_first_card(monkeypatch):
    async def scenario():
        async def evaluate(js: str, timeout: float = 10):
            return {"index": None, "detected": False, "reason": "not_detected"}

        monkeypatch.setattr(finding_jobs, "_safe_evaluate", evaluate)

        assert await finding_jobs.get_selected_job_index() == 1

    asyncio.run(scenario())


async def _async_true(*args, **kwargs):
    return True


async def _async_false(*args, **kwargs):
    return False


def test_click_stay_on_page_returns_true_when_button_found(monkeypatch):
    async def scenario():
        seen: list[str] = []

        async def click_by_xpath(xpath: str, timeout: float = 3):
            seen.append(xpath)
            return "留在此页" in xpath

        async def sleep(delay: float):
            seen.append(f"sleep:{delay}")

        monkeypatch.setattr(finding_jobs, "click_by_xpath", click_by_xpath)
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", sleep)

        assert await finding_jobs.click_stay_on_page_if_present() is True
        assert any("留在此页" in item for item in seen)
        assert "sleep:1" in seen

    import asyncio
    asyncio.run(scenario())


def test_click_stay_on_page_returns_false_when_absent(monkeypatch):
    async def scenario():
        monkeypatch.setattr(finding_jobs, "click_by_xpath", _async_false)
        assert await finding_jobs.click_stay_on_page_if_present() is False

    import asyncio
    asyncio.run(scenario())


def test_click_next_page_uses_common_next_labels(monkeypatch):
    async def scenario():
        clicked: list[str] = []

        async def click(xpath: str, timeout: float = 3):
            clicked.append(xpath)
            return "下一页" in xpath

        async def sleep(delay: float):
            return None

        monkeypatch.setattr(finding_jobs, "click_by_xpath", click)
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", sleep)

        assert await finding_jobs.click_next_page_if_present() is True
        assert any("下一页" in xpath for xpath in clicked)

    asyncio.run(scenario())


def test_scroll_to_load_more_jobs_scrolls_left_job_list_when_count_grows(monkeypatch):
    async def scenario():
        counts = [15, 20]
        scripts: list[str] = []

        async def loaded_count():
            return counts.pop(0)

        async def safe_evaluate(js: str, timeout: float = 5):
            scripts.append(js)
            return {"ok": True, "target": "left-list", "beforeTop": 0, "afterTop": 600}

        async def sleep(delay: float):
            return None

        monkeypatch.setattr(finding_jobs, "get_loaded_job_count", loaded_count)
        monkeypatch.setattr(finding_jobs, "_safe_evaluate", safe_evaluate)
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", sleep)

        assert await finding_jobs.scroll_to_load_more_jobs() is True
        assert any("job-card-box" in script and "scrollTop" in script for script in scripts)

    asyncio.run(scenario())


def test_scroll_to_load_more_jobs_treats_visible_card_change_as_progress(monkeypatch):
    async def scenario():
        counts = [15, 15, 15]

        async def loaded_count():
            return counts.pop(0) if counts else 15

        async def safe_evaluate(js: str, timeout: float = 5):
            if "scrollTop" in js:
                return {
                    "ok": True,
                    "target": "left-list",
                    "beforeTop": 0,
                    "afterTop": 600,
                    "beforeFirst": "岗位A",
                    "afterFirst": "岗位B",
                }
            return {}

        async def sleep(delay: float):
            return None

        monkeypatch.setattr(finding_jobs, "get_loaded_job_count", loaded_count)
        monkeypatch.setattr(finding_jobs, "_safe_evaluate", safe_evaluate)
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", sleep)

        assert await finding_jobs.scroll_to_load_more_jobs() is True

    asyncio.run(scenario())


def test_get_job_description_by_index_returns_structured_description(monkeypatch):
    async def scenario():
        async def get_job(index: int):
            return finding_jobs.JobPosting(title="后端开发实习", description="JD")

        monkeypatch.setattr(finding_jobs, "get_job_by_index", get_job)

        assert await finding_jobs.get_job_description_by_index(1) == "JD"

    import asyncio
    asyncio.run(scenario())


def test_parse_job_card_text_extracts_common_fields():
    card = _parse_job_card_text(
        """
后端开发实习
150-200元/天
广州·天河区·车陂
本科
5天/周 3个月
某某科技
李女士 今日活跃
Go
MySQL
Redis
""",
        fallback_title="后端开发实习",
    )

    assert card.title == "后端开发实习"
    assert card.salary == "150-200元/天"
    assert card.location == "广州·天河区·车陂"
    assert card.education == "本科"
    assert card.company == "某某科技"
    assert card.boss_name == "李女士"
    assert card.boss_active_status == "今日活跃"
    assert card.tags == ["5天/周 3个月", "Go", "MySQL", "Redis"]


def test_extract_boss_active_status_from_card_or_detail_text():
    assert extract_boss_active_status("李女士 今日活跃\n后端开发实习") == "今日活跃"
    assert extract_boss_active_status("张先生\n3日内活跃\n某某科技") == "3日内活跃"
    assert extract_boss_active_status("王先生\n本周活跃\n开发部负责人") == "本周活跃"


def test_parse_job_card_text_keeps_fallback_title_when_card_is_sparse():
    card = _parse_job_card_text("", fallback_title="AI应用开发实习")

    assert card.title == "AI应用开发实习"
    assert card.company == ""
    assert card.tags == []


def test_job_key_prefers_detail_url_when_available():
    posting = finding_jobs.JobPosting(
        title="后端开发实习",
        description="JD",
        company="某某科技",
        location="深圳",
        boss_name="李女士",
        detail_url="https://www.zhipin.com/job_detail/abc.html",
    )

    assert job_key(posting) == "https://www.zhipin.com/job_detail/abc.html"


def test_job_key_falls_back_to_stable_fields():
    posting = finding_jobs.JobPosting(
        title="后端开发实习",
        description="JD",
        company="某某科技",
        location="深圳",
        boss_name="李女士",
    )

    assert job_key(posting) == "后端开发实习|某某科技|深圳|李女士"


def test_apply_page_filters_clicks_enabled_values(monkeypatch):
    async def scenario():
        clicked: list[tuple[str, str]] = []

        async def click_filter_value(group_name: str, value: str, timeout: float = 5):
            clicked.append((group_name, value))
            return True

        async def sleep(delay: float):
            clicked.append(("sleep", str(delay)))

        monkeypatch.setattr(finding_jobs, "click_filter_value", click_filter_value)
        monkeypatch.setattr(finding_jobs.asyncio, "sleep", sleep)

        await finding_jobs.apply_page_filters(
            {
                "strict": False,
                "city": {"enabled": True, "values": ["深圳", "广州"]},
                "education": {"enabled": False, "values": ["本科"]},
                "boss_active": {"enabled": True, "values": ["今日活跃"]},
            }
        )

        assert clicked == [
            ("city", "深圳"),
            ("city", "广州"),
            ("boss_active", "今日活跃"),
            ("sleep", "1"),
        ]

    import asyncio
    asyncio.run(scenario())


def test_apply_page_filters_warns_and_continues_when_not_strict(monkeypatch, caplog):
    async def scenario():
        events: list[dict] = []

        async def click_filter_value(group_name: str, value: str, timeout: float = 5):
            return False

        monkeypatch.setattr(finding_jobs, "click_filter_value", click_filter_value)
        await finding_jobs.apply_page_filters(
            {"strict": False, "city": {"enabled": True, "values": ["深圳"]}},
            emit_event=lambda payload: events.append(payload),
        )

        assert events == [
            {
                "group": "city",
                "value": "深圳",
                "status": "failed",
                "message": "页面筛选失败：城市=深圳。已继续运行，本地规则继续兜底。",
                "suggestion": "你可以在 BOSS 页面手动筛选到合适页面，再回到 GUI 直接点击开始运行。",
            }
        ]

    import asyncio
    asyncio.run(scenario())
    assert "页面筛选失败" in caplog.text


def test_get_browser_page_state_returns_idle_when_no_tab(monkeypatch):
    monkeypatch.setattr(finding_jobs, "_tab", None)

    assert finding_jobs.get_browser_page_state() == {
        "has_tab": False,
        "url": "",
        "title": "",
        "loaded_job_count": 0,
    }


def test_kill_profile_chrome_windows_targets_user_data_dir(monkeypatch):
    calls: list[list[str]] = []

    def fake_which(name: str):
        return "powershell" if name == "powershell" else None

    def fake_run(args, **kwargs):
        calls.append(args)

    monkeypatch.setattr(finding_jobs.shutil, "which", fake_which)
    monkeypatch.setattr(finding_jobs.subprocess, "run", fake_run)

    finding_jobs._kill_profile_chrome_windows(r"D:\boss自动化投递\chrome_profile")

    assert calls
    command = calls[0]
    assert command[0] == "powershell"
    assert "Stop-Process" in command[3]
    assert command[-1] == r"D:\boss自动化投递\chrome_profile"


def test_prepare_manual_boss_page_opens_recommend_page_without_tab(monkeypatch):
    async def scenario():
        opened: list[tuple[str, str]] = []

        class FakeTab:
            url = finding_jobs.RECOMMEND_URL

            async def activate(self):
                return None

            async def bring_to_front(self):
                return None

        async def open_browser(url: str, browser: str):
            opened.append((url, browser))
            monkeypatch.setattr(finding_jobs, "_tab", FakeTab())

        monkeypatch.setattr(finding_jobs, "_tab", None)
        monkeypatch.setattr(finding_jobs, "open_browser_with_options", open_browser)

        state = await finding_jobs.prepare_manual_boss_page()

        assert opened == [(finding_jobs.RECOMMEND_URL, "chrome")]
        assert state["has_tab"] is True
        assert state["url"] == finding_jobs.RECOMMEND_URL

    asyncio.run(scenario())


def test_prepare_manual_boss_page_reuses_existing_boss_tab(monkeypatch):
    async def scenario():
        opened: list[str] = []
        activated: list[str] = []

        class FakeTab:
            url = "https://www.zhipin.com/web/geek/jobs?query=AI"

            async def activate(self):
                activated.append("activate")

            async def bring_to_front(self):
                activated.append("front")

        async def open_browser(url: str, browser: str):
            opened.append(url)

        monkeypatch.setattr(finding_jobs, "_tab", FakeTab())
        monkeypatch.setattr(finding_jobs, "open_browser_with_options", open_browser)

        state = await finding_jobs.prepare_manual_boss_page()

        assert opened == []
        assert activated == ["activate", "front"]
        assert state["url"].startswith("https://www.zhipin.com")

    asyncio.run(scenario())


def test_prepare_manual_boss_page_reopens_when_current_tab_is_not_boss(monkeypatch):
    async def scenario():
        opened: list[tuple[str, str]] = []

        class FakeTab:
            url = "https://example.test/"

            async def activate(self):
                return None

            async def bring_to_front(self):
                return None

        async def open_browser(url: str, browser: str):
            opened.append((url, browser))

        monkeypatch.setattr(finding_jobs, "_tab", FakeTab())
        monkeypatch.setattr(finding_jobs, "open_browser_with_options", open_browser)

        await finding_jobs.prepare_manual_boss_page("https://www.zhipin.com/web/geek/jobs")

        assert opened == [("https://www.zhipin.com/web/geek/jobs", "chrome")]

    asyncio.run(scenario())


def test_apply_page_filters_raises_when_strict(monkeypatch):
    async def scenario():
        async def click_filter_value(group_name: str, value: str, timeout: float = 5):
            return False

        monkeypatch.setattr(finding_jobs, "click_filter_value", click_filter_value)

        import pytest

        with pytest.raises(RuntimeError, match="页面筛选失败"):
            await finding_jobs.apply_page_filters(
                {"strict": True, "city": {"enabled": True, "values": ["深圳"]}}
            )

    import asyncio
    asyncio.run(scenario())


def test_captcha_visible_reads_page_text(monkeypatch):
    async def scenario():
        async def safe_evaluate(js: str, timeout: float = 5):
            return {"text": "请完成验证码后继续"}

        monkeypatch.setattr(finding_jobs, "_safe_evaluate", safe_evaluate)

        assert await finding_jobs.captcha_visible() is True

    import asyncio
    asyncio.run(scenario())
