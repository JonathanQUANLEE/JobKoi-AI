"""平台限额文案检测纯函数测试。"""
from __future__ import annotations

import pytest

from boss_zhipin.platforms.platform_limits import (
    PlatformLimitReached,
    check_limit_alert,
    match_limit_alert,
)


def test_boss_limit_text_hit():
    assert match_limit_alert("boss", "今日沟通次数已达上限") == "今日沟通次数已达上限"
    assert match_limit_alert("boss", "沟通次数已用完") == "沟通次数已用完"


def test_job51_limit_text_hit():
    assert match_limit_alert("job51", "您今日投递次数已达上限") == "今日投递次数已达上限"


def test_liepin_limit_text_hit():
    assert match_limit_alert("liepin", "今日打招呼次数已用完") == "今日打招呼次数已用完"


def test_limit_text_in_long_page():
    page = "职位详情 后端开发工程师 北京 30K 今日沟通次数已达上限 请明天再试"
    assert match_limit_alert("boss", page) == "今日沟通次数已达上限"


def test_no_limit_text():
    assert match_limit_alert("boss", "职位描述 Python FastAPI 分布式") is None
    assert match_limit_alert("boss", "") is None


def test_check_limit_alert_raises():
    with pytest.raises(PlatformLimitReached) as exc_info:
        check_limit_alert("boss", "今日沟通次数已达上限")
    assert exc_info.value.platform == "boss"


def test_check_limit_alert_silent_when_clean():
    # 无限额提示时不抛异常
    assert check_limit_alert("boss", "普通职位描述") is None


def test_unknown_platform():
    with pytest.raises(ValueError):
        match_limit_alert("unknown", "今日沟通次数已达上限")