"""BOSS 侧兼容层：实现已上移 boss_zhipin/platforms/session_cleanup.py（三平台共用）。

保留本模块与下划线名，使 browser_session.py / finding_jobs.py 的既有 import、
以及 tests/test_finding_jobs_text.py 的 patch 路径完全不变。
"""
from __future__ import annotations

from boss_zhipin.platforms.session_cleanup import (
    clear_singleton_locks as _clear_singleton_locks,
    kill_profile_chrome as _kill_profile_chrome,
    kill_profile_chrome_windows as _kill_profile_chrome_windows,
    reap_profile_chrome as _reap_profile_chrome,
)
