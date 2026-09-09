"""CLI 入口辅助函数的单测。

这些函数在 PR #9 引入，是新用户第一次跑脚本时见到的入口逻辑。任何回归都会
直接劝退人，所以单测优先盯住。
"""

from __future__ import annotations

import os

import pytest

from boss_zhipin import cli as main  # test 内继续叫 main，少改


def test_cli_module_no_longer_exposes_llm_or_resume_bootstrap():
    removed = (
        "LLM_PRESETS",
        "is_llm_configured",
        "ensure_llm_configured",
        "ensure_resume_path",
        "needs_resume_preprocessing",
        "DEFAULT_RESUME_PATH",
    )

    for name in removed:
        assert not hasattr(main, name)


# ---------- ensure_usr_name ----------


class TestEnsureUsrName:
    def test_env_var_short_circuit(self, monkeypatch):
        monkeypatch.setenv("BOSS_USR_NAME", "张三")
        assert main.ensure_usr_name() == "张三"

    def test_env_strips_whitespace(self, monkeypatch):
        monkeypatch.setenv("BOSS_USR_NAME", "  张三  ")
        assert main.ensure_usr_name() == "张三"

    def test_empty_env_falls_through_to_prompt(self, monkeypatch):
        monkeypatch.setenv("BOSS_USR_NAME", "")
        monkeypatch.setattr("builtins.input", lambda _prompt="": "李四")
        assert main.ensure_usr_name() == "李四"

    def test_empty_input_loops(self, monkeypatch):
        monkeypatch.delenv("BOSS_USR_NAME", raising=False)
        inputs = iter(["", "   ", "王五"])
        monkeypatch.setattr("builtins.input", lambda _prompt="": next(inputs))
        assert main.ensure_usr_name() == "王五"


# ---------- get_label ----------


class TestGetLabel:
    def test_returns_env_value(self, monkeypatch):
        monkeypatch.setenv("BOSS_LABEL", "后端开发（成都）")
        assert main.get_label() == "后端开发（成都）"

    def test_unset_returns_empty(self, monkeypatch):
        monkeypatch.delenv("BOSS_LABEL", raising=False)
        assert main.get_label() == ""

    def test_whitespace_stripped(self, monkeypatch):
        monkeypatch.setenv("BOSS_LABEL", "   测试岗位   ")
        assert main.get_label() == "测试岗位"


class TestGetStartUrl:
    def test_default_uses_recommend_url(self, monkeypatch):
        monkeypatch.delenv("BOSS_START_URL", raising=False)
        assert main.get_start_url() == main.RECOMMEND_URL

    def test_env_override_used(self, monkeypatch):
        monkeypatch.setenv("BOSS_START_URL", "https://example.test/jobs?city=101280600")
        assert main.get_start_url() == "https://example.test/jobs?city=101280600"


class TestCliArgs:
    def test_parse_args_accepts_profile(self):
        args = main.parse_args(["--profile", "backend-intern"])

        assert args.profile == "backend-intern"

    def test_parse_args_profile_defaults_none(self):
        args = main.parse_args([])

        assert args.profile is None


class TestApplyProfileToEnv:
    def test_auto_profile_sets_fixed_greeting_and_send_limits(
        self, monkeypatch, tmp_path
    ):
        greeting = tmp_path / "greetings" / "default.txt"
        greeting.parent.mkdir()
        greeting.write_text("您好，我想应聘后端开发实习。", encoding="utf-8")

        main.apply_profile_to_env(
            {
                "send": {
                    "mode": "auto",
                    "greeting_file": "./greetings/default.txt",
                    "delay_min": 12,
                    "delay_max": 45,
                    "max_sent": 50,
                    "daily_sent_limit": 80,
                    "stop_on_captcha": True,
                },
                "filters": {
                    "title": {
                        "required": {"enabled": True, "keywords": ["实习"]},
                    },
                },
                "page_filters": {
                    "strict": False,
                    "city": {"enabled": True, "values": ["深圳", "广州"]},
                },
                "search": {
                    "query": "后端开发实习",
                    "start_url": "https://example.test/jobs?city=101280600",
                },
                "state": {
                    "seen_jobs_file": "./logs/seen.jsonl",
                    "sent_log_file": "./logs/sent.jsonl",
                    "skipped_log_file": "./logs/skipped.jsonl",
                },
            },
            base_dir=tmp_path,
            profile_name="backend-intern",
        )

        assert os.environ["BOSS_AUTO_SEND_FIXED_GREETING"] == "1"
        assert "BOSS_SCAN_ONLY" not in os.environ
        assert "BOSS_REVIEW_BEFORE_SEND" not in os.environ
        assert os.environ["BOSS_FIXED_GREETING"] == "您好，我想应聘后端开发实习。"
        assert os.environ["BOSS_AUTO_SEND_DELAY_MIN"] == "12"
        assert os.environ["BOSS_AUTO_SEND_DELAY_MAX"] == "45"
        assert os.environ["BOSS_AUTO_SEND_MAX_SENT"] == "50"
        assert os.environ["BOSS_AUTO_SEND_DAILY_LIMIT"] == "80"
        assert os.environ["BOSS_STOP_ON_CAPTCHA"] == "True"
        assert os.environ["BOSS_LABEL"] == "后端开发实习"
        assert os.environ["BOSS_START_URL"] == "https://example.test/jobs?city=101280600"
        assert '"实习"' in os.environ["BOSS_PROFILE_FILTERS_JSON"]
        assert '"深圳"' in os.environ["BOSS_PAGE_FILTERS_JSON"]
        assert os.environ["BOSS_PROFILE_NAME"] == "backend-intern"
        assert os.environ["BOSS_SEEN_JOBS_FILE"] == str(
            tmp_path / "logs" / "seen.jsonl"
        )
        assert os.environ["BOSS_SENT_LOG_FILE"] == str(tmp_path / "logs" / "sent.jsonl")
        assert os.environ["BOSS_SKIPPED_LOG_FILE"] == str(
            tmp_path / "logs" / "skipped.jsonl"
        )

    def test_review_profile_sets_review_mode(self, monkeypatch, tmp_path):
        greeting = tmp_path / "review.txt"
        greeting.write_text("您好，这是审核后发送的招呼语。", encoding="utf-8")

        main.apply_profile_to_env(
            {"send": {"mode": "review", "greeting_file": "review.txt"}},
            base_dir=tmp_path,
        )

        assert os.environ["BOSS_REVIEW_BEFORE_SEND"] == "1"
        assert "BOSS_SCAN_ONLY" not in os.environ
        assert "BOSS_AUTO_SEND_FIXED_GREETING" not in os.environ
        assert os.environ["BOSS_FIXED_GREETING"] == "您好，这是审核后发送的招呼语。"

    def test_scan_profile_sets_scan_only_without_greeting(self, monkeypatch, tmp_path):
        main.apply_profile_to_env({"send": {"mode": "scan"}}, base_dir=tmp_path)

        assert os.environ["BOSS_SCAN_ONLY"] == "1"
        assert "BOSS_REVIEW_BEFORE_SEND" not in os.environ
        assert "BOSS_AUTO_SEND_FIXED_GREETING" not in os.environ
        assert "BOSS_FIXED_GREETING" not in os.environ

    def test_missing_greeting_file_exits(self, monkeypatch, tmp_path, capsys):
        with pytest.raises(SystemExit) as exc:
            main.apply_profile_to_env(
                {"send": {"mode": "auto", "greeting_file": "missing.txt"}},
                base_dir=tmp_path,
            )

        assert exc.value.code == 1
        assert "找不到招呼语文件" in capsys.readouterr().out


class TestCliMainProfile:
    def test_cli_main_loads_profile_before_running(self, monkeypatch, tmp_path):
        profiles_dir = tmp_path / "profiles"
        greetings_dir = tmp_path / "greetings"
        profiles_dir.mkdir()
        greetings_dir.mkdir()
        (greetings_dir / "default.txt").write_text(
            "您好，我想投递实习岗位。", encoding="utf-8"
        )
        (profiles_dir / "backend.yml").write_text(
            """
send:
  mode: auto
  greeting_file: ./greetings/default.txt
  delay_min: 11
  delay_max: 22
  max_sent: 3
""",
            encoding="utf-8",
        )
        run_calls = []

        async def fake_run_automation(usr_name, label, dry_run):
            run_calls.append((usr_name, label, dry_run))

        class FakeLoop:
            def run_until_complete(self, coro):
                import asyncio

                return asyncio.run(coro)

        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv("BOSS_USR_NAME", "张三")
        monkeypatch.setattr(main, "run_automation", fake_run_automation)
        monkeypatch.setattr(main.uc, "loop", lambda: FakeLoop())
        monkeypatch.setattr(main.sys, "argv", ["boss-zhipin", "--profile", "backend"])

        main._cli_main()

        assert run_calls == [("张三", "", False)]
        assert os.environ["BOSS_AUTO_SEND_FIXED_GREETING"] == "1"
        assert os.environ["BOSS_FIXED_GREETING"] == "您好，我想投递实习岗位。"
        assert os.environ["BOSS_AUTO_SEND_DELAY_MIN"] == "11"
        assert os.environ["BOSS_AUTO_SEND_DELAY_MAX"] == "22"
        assert os.environ["BOSS_AUTO_SEND_MAX_SENT"] == "3"

    def test_cli_main_prints_profile_summary(self, monkeypatch, tmp_path, capsys):
        profiles_dir = tmp_path / "profiles"
        greetings_dir = tmp_path / "greetings"
        profiles_dir.mkdir()
        greetings_dir.mkdir()
        (greetings_dir / "default.txt").write_text(
            "您好，我想投递实习岗位。", encoding="utf-8"
        )
        (profiles_dir / "backend.yml").write_text(
            """
search:
  query: 后端开发实习
send:
  mode: scan
  max_sent: 3
filters:
  title:
    required:
      keywords: [实习]
""",
            encoding="utf-8",
        )

        async def fake_run_automation(usr_name, label, dry_run):
            return None

        class FakeLoop:
            def run_until_complete(self, coro):
                import asyncio

                return asyncio.run(coro)

        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv("BOSS_USR_NAME", "张三")
        monkeypatch.setattr(main, "run_automation", fake_run_automation)
        monkeypatch.setattr(main.uc, "loop", lambda: FakeLoop())
        monkeypatch.setattr(main.sys, "argv", ["boss-zhipin", "--profile", "backend"])

        main._cli_main()

        out = capsys.readouterr().out
        assert "Profile: backend" in out
        assert "mode=scan" in out
        assert "query=后端开发实习" in out

    def test_cli_main_sets_profile_name(self, monkeypatch, tmp_path):
        profiles_dir = tmp_path / "profiles"
        greetings_dir = tmp_path / "greetings"
        profiles_dir.mkdir()
        greetings_dir.mkdir()
        (greetings_dir / "default.txt").write_text(
            "您好，我想投递实习岗位。", encoding="utf-8"
        )
        (profiles_dir / "backend.yml").write_text(
            """
send:
  mode: auto
  greeting_file: ./greetings/default.txt
state:
  seen_jobs_file: ./logs/seen.jsonl
""",
            encoding="utf-8",
        )

        async def fake_run_automation(usr_name, label, dry_run):
            return None

        class FakeLoop:
            def run_until_complete(self, coro):
                import asyncio

                return asyncio.run(coro)

        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv("BOSS_USR_NAME", "张三")
        monkeypatch.setattr(main, "run_automation", fake_run_automation)
        monkeypatch.setattr(main.uc, "loop", lambda: FakeLoop())
        monkeypatch.setattr(main.sys, "argv", ["boss-zhipin", "--profile", "backend"])

        main._cli_main()

        assert os.environ["BOSS_PROFILE_NAME"] == "backend"


class TestRunAutomation:
    def test_run_automation_uses_profile_flow_without_resume_or_llm_args(
        self, monkeypatch
    ):
        async def scenario():
            calls: list[dict] = []

            async def fake_send(**kwargs):
                calls.append(kwargs)

            monkeypatch.setattr(main, "send_job_descriptions_to_chat", fake_send)
            monkeypatch.setenv("BOSS_START_URL", "https://example.test/jobs")

            await main.run_automation("张三", "后端开发实习", False)

            assert len(calls) == 1
            assert calls[0]["usr_name"] == "张三"
            assert calls[0]["label"] == "后端开发实习"
            assert calls[0]["url"] == "https://example.test/jobs"
            forbidden = {
                "resume_keywords",
                "resume_text",
                "min_keyword_match",
                "min_llm_score",
                "exclude_keywords",
                "vectorstore",
            }
            assert forbidden.isdisjoint(calls[0])

        import asyncio

        asyncio.run(scenario())


class TestAutoSendFixedGreetingEnabled:
    def test_flag_reads_env(self, monkeypatch):
        monkeypatch.setenv("BOSS_AUTO_SEND_FIXED_GREETING", "1")
        assert main.auto_send_fixed_greeting_enabled() is True

    def test_flag_defaults_false(self, monkeypatch):
        monkeypatch.delenv("BOSS_AUTO_SEND_FIXED_GREETING", raising=False)
        assert main.auto_send_fixed_greeting_enabled() is False


# ---------- _int_env ----------
# GUI 配置页能直接填 BOSS_MIN_MATCH_SCORE 这类数值字段，裸 int() 遇到坏值会崩整个
# run。_int_env 把坏值 / 越界降级到区间内，永不抛——跑得起来比跑得精确重要。


class TestIntEnv:
    def test_unset_returns_default(self, monkeypatch):
        monkeypatch.delenv("BOSS_MIN_MATCH_SCORE", raising=False)
        assert main._int_env("BOSS_MIN_MATCH_SCORE", 50, 0, 100) == 50

    def test_valid_in_range(self, monkeypatch):
        monkeypatch.setenv("BOSS_MIN_MATCH_SCORE", "73")
        assert main._int_env("BOSS_MIN_MATCH_SCORE", 50, 0, 100) == 73

    def test_non_integer_falls_back_to_default(self, monkeypatch):
        monkeypatch.setenv("BOSS_MIN_MATCH_SCORE", "abc")
        assert main._int_env("BOSS_MIN_MATCH_SCORE", 50, 0, 100) == 50

    def test_empty_string_falls_back_to_default(self, monkeypatch):
        monkeypatch.setenv("BOSS_MIN_MATCH_SCORE", "   ")
        assert main._int_env("BOSS_MIN_MATCH_SCORE", 50, 0, 100) == 50

    def test_above_range_clamped_to_hi(self, monkeypatch):
        monkeypatch.setenv("BOSS_MIN_MATCH_SCORE", "150")
        assert main._int_env("BOSS_MIN_MATCH_SCORE", 50, 0, 100) == 100

    def test_below_range_clamped_to_lo(self, monkeypatch):
        monkeypatch.setenv("BOSS_MIN_MATCH_SCORE", "-20")
        assert main._int_env("BOSS_MIN_MATCH_SCORE", 50, 0, 100) == 0
