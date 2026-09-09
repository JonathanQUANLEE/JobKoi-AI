"""pytest 公共配置。

- Phase D-pre 后：项目以 src/ 布局变成可安装 package，``uv sync`` 会把
  ``boss_zhipin`` editable install 进 .venv，``from boss_zhipin import X``
  不需要 sys.path 注入也能 import。这里不再 manipulate sys.path。
- **主动清空所有项目相关 env 变量**，让测试不被本机 .env / shell export
  污染。包括用户输入兜底、发送模式、以及 retry 装饰器在 import time
  读取的 ``BOSS_RETRY_*`` 那几个。
- 我们**不**调 ``load_dotenv()`` —— 测试应当通过 ``monkeypatch.setenv`` 显式
  控制环境，依赖 .env 真实值的测试是不可复现的。
"""
from __future__ import annotations

import os

import pytest


# 项目所有读 env 的位置（用户输入兜底 / retry 默认值 /
# letter 长度边界 / log 路径）都清掉，用例需要时各自再
# ``monkeypatch.setenv`` 上去。
_PROJECT_ENV_VARS = (
    # 用户输入兜底
    "BOSS_USR_NAME", "BOSS_LABEL", "BOSS_START_URL",
    # retry 装饰器在 import time 读这些，本机有 export 会影响装饰器默认值
    "BOSS_RETRY_BASE_DELAY", "BOSS_RETRY_MAX_DELAY", "BOSS_RETRY_MAX_ATTEMPTS",
    # 落盘路径
    "LETTER_LOG_PATH", "BOSS_CHROME_PROFILE",
    # letter 校验边界
    "LETTER_MIN_LEN", "LETTER_MAX_LEN",
    # boss_zhipin.cli 用的全局 log 级
    "LOGLEVEL", "DRY_RUN",
    # 扫描 / 人工审核 / 自动发送模式
    "BOSS_SCAN_ONLY", "BOSS_SCAN_REQUIRED_TERMS", "BOSS_SCAN_KEYWORDS",
    "BOSS_SCAN_LOCATIONS", "BOSS_SCAN_MAX_JOBS", "SCAN_MATCH_LOG_PATH",
    "BOSS_REVIEW_BEFORE_SEND", "BOSS_GUI_REVIEW", "BOSS_REVIEW_REQUIRED_TERMS", "BOSS_REVIEW_LOCATIONS",
    "BOSS_AUTO_SEND_FIXED_GREETING", "BOSS_FIXED_GREETING",
    "BOSS_PROFILE_FILTERS_JSON", "BOSS_PAGE_FILTERS_JSON",
    "BOSS_PROFILE_NAME", "BOSS_SEEN_JOBS_FILE", "BOSS_SENT_LOG_FILE", "BOSS_SKIPPED_LOG_FILE",
    "BOSS_AUTO_REQUIRED_TERMS", "BOSS_AUTO_AI_TERMS", "BOSS_AUTO_BACKEND_TERMS",
    "BOSS_AUTO_TITLE_REQUIRED_TERMS", "BOSS_AUTO_TITLE_KEYWORDS", "BOSS_AUTO_DIRECTION_TERMS",
    "BOSS_AUTO_SEND_DELAY_MIN", "BOSS_AUTO_SEND_DELAY_MAX", "BOSS_AUTO_SEND_MAX_SENT",
    "BOSS_AUTO_SEND_DAILY_LIMIT", "BOSS_STOP_ON_CAPTCHA",
    # standalone 模式开关 + 数据目录覆盖（paths.py 读）
    "BOSS_TAURI_STANDALONE", "BOSS_APP_DATA_DIR",
)
for _key in _PROJECT_ENV_VARS:
    os.environ.pop(_key, None)


@pytest.fixture(autouse=True)
def _isolate_project_env():
    """每个测试前后清理项目环境变量，避免 profile/env 桥接类测试串味。"""
    for key in _PROJECT_ENV_VARS:
        os.environ.pop(key, None)
    yield
    for key in _PROJECT_ENV_VARS:
        os.environ.pop(key, None)
