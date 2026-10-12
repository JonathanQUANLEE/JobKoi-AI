"""PyTauri 桌面 App 入口。

**两种运行模式**，靠 ``BOSS_TAURI_STANDALONE`` env var 区分：

1. **Wheel dev 模式**（默认）：``uv sync && uv run python -m boss_zhipin.tauri``。
   tauri 组在 ``[tool.uv].default-groups`` 里，``uv sync`` 默认就装上；CLI-only
   用户可以 ``uv sync --no-group tauri`` 跳过。Python 进程是主进程，
   ``pytauri-wheel`` 提供 Tauri Rust binary。Tauri.toml / capabilities /
   frontend 从本包 source 目录读。

2. **Standalone 模式**（Phase D 打包后的 .app）：Rust binary 是主进程，
   embed Python interpreter，启动时 set ``BOSS_TAURI_STANDALONE=1``，再
   ``PythonScript::Module("boss_zhipin.tauri")`` 进入 ``__main__.py`` → 这里的
   ``main()``。Tauri.toml / capabilities / frontend 已经在编译期通过
   ``tauri::generate_context!()`` 嵌进 Rust binary，Python 不再读。

跟 CLI（``boss_zhipin.cli``）平行存在；CLI 模式完全不动。

业务代码（``website_oper`` / ``audit``）**完全不知道有 Tauri 这层**：
- 进度事件通过 ``gui.events.set_emit_callback`` 注入到 PyTauri Channel
- 日志通过 ``gui.log_bridge.install`` 注入到 PyTauri Channel
- 主循环还是 ``website_oper.write_response.send_job_descriptions_to_chat``

**命令层按业务域拆分至 ``boss_zhipin.tauri.commands`` 包**（P2-5，2026-10）：
runtime/profile/resume/agent/platform/window/schedule 七个域模块 +
``_registry``（共享 Commands 实例）+ ``_base``（camelCase 模型基类）。
本模块保留：env 初始化、全部命令与 body 模型的**兼容 re-export**（老消费者
``__main__`` / ``scripts/agent_smoke.py`` / ``tests/test_preview.py`` 不破）、
``main()`` 入口。IPC 契约（38 个命令名）由
``tests/test_tauri_ipc_contract.py`` 守门（扫描本文件 + ``commands/*.py``）。

**关键约束**（见 project memory）：
- `start_blocking_portal("asyncio")` —— 不能默认 trio/uvloop，否则 nodriver
  重启 Chrome 会 timeout。
- ``capabilities/default.toml``（wheel）/ ``capabilities/default.json``
  （standalone）必须 grant ``pytauri:default``，否则前端 ``pyInvoke`` 被 ACL 拦。
"""

from os import environ
from pathlib import Path

# pytauri 多 example 共存时用，单 example 不需要——保留以匹配官方模板。
environ.setdefault("_PYTAURI_DIST", "pytauri-wheel")

import logging
from typing import Optional

from anyio.from_thread import start_blocking_portal

# import 即注册：commands 包内各域模块把 @commands.command() 挂到共享 registry。
from boss_zhipin.tauri.commands import commands

# ---------- 兼容 re-export（老消费者不破；新代码请直接 import commands.* 域模块） ----------

from boss_zhipin.tauri.commands._base import _CamelModel  # noqa: F401
from boss_zhipin.tauri.commands.agent import (  # noqa: F401
    _AgentChatBody,
    _AgentExecuteActionBody,
    _CalculateATSScoreBody,
    _DiagnoseResumeBody,
    _SaveLLMConfigBody,
    agent_chat,
    agent_execute_action,
    calculate_ats_score,
    check_boss_replies,
    diagnose_resume,
    get_llm_config,
    save_llm_config,
)
from boss_zhipin.tauri.commands.platform import (  # noqa: F401
    _GetDeliveryHistoryBody,
    _PlatformLoginBody,
    _ResetTodayDeliveryBody,
    check_login_status,
    get_delivery_history,
    list_platforms,
    open_platform_login,
    reset_today_delivery,
)
from boss_zhipin.tauri.commands.profile import (  # noqa: F401
    _GreetingPathBody,
    _ProfileNameBody,
    _SaveGreetingBody,
    _SaveProfileBody,
    get_greeting,
    get_profile,
    list_profiles,
    save_greeting,
    save_profile,
)
from boss_zhipin.tauri.commands.resume import (  # noqa: F401
    _DeleteResumeFileBody,
    _GetResumeContentBody,
    _OpenResumeNativeBody,
    _SaveResumeFileBody,
    _SetDefaultResumeBody,
    delete_resume_file,
    get_resume_content,
    list_resumes,
    open_resume_native,
    save_resume_file,
    set_default_resume,
)
from boss_zhipin.tauri.commands.runtime import (  # noqa: F401
    _OpenManualBrowserBody,
    _ReviewDecisionBody,
    RunConfig,
    StartRunBody,
    _build_main_loop_factory,
    _safe_send,
    get_browser_page_state,
    get_run_state,
    open_manual_browser,
    shutdown_browser,
    start_run,
    stop_run,
    submit_review_decision,
)
from boss_zhipin.tauri.commands.schedule import (  # noqa: F401
    _SaveScheduleBody,
    cancel_schedule,
    get_schedule_status,
    save_schedule,
)
from boss_zhipin.tauri.commands.window import (  # noqa: F401
    window_close,
    window_minimize,
    window_toggle_maximize,
)

SRC_TAURI_DIR = Path(__file__).parent.absolute()
BOSS_DEV = environ.get("BOSS_TAURI_DEV") == "1"
BOSS_STANDALONE = environ.get("BOSS_TAURI_STANDALONE") == "1"

log = logging.getLogger(__name__)


def main() -> int:
    """启动 PyTauri app——根据 BOSS_TAURI_STANDALONE 自动切换 wheel / standalone。"""
    if BOSS_STANDALONE:
        # .app 双击启动时 CWD 是 ``/``，所有相对默认路径（logs/
        # chrome_profile/ .env）都会落错地方。入口处统一 chdir 到
        # 平台应用数据目录，business 代码不用感知。必须在任何业务 import
        # 之前做。
        from boss_zhipin.paths import ensure_app_data_cwd

        data_dir = ensure_app_data_cwd()

    logging.basicConfig(
        level=environ.get("LOGLEVEL", "INFO"),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if BOSS_STANDALONE:
        log.info("standalone 模式：数据目录 %s", data_dir)
        # Standalone：Rust binary 已经 register 了 ext_mod，pytauri.builder_factory
        # / pytauri.context_factory 直接可用；Tauri.toml 已经被 generate_context!
        # 宏 inline 进 Rust binary，不需要再从 source 目录读，context_factory 无参。
        from pytauri import builder_factory, context_factory

        ctx = context_factory()
    else:
        # Wheel dev 模式：pytauri-wheel 内部维护自己的 Rust binary，需要把
        # Tauri.toml 所在目录传给 context_factory 让它在运行时读。
        from pytauri_wheel.lib import builder_factory, context_factory

        # 生产模式必须 tauri_config=None：让 Tauri 读 Tauri.toml 的
        # frontendDist="./frontend"（相对本目录解析）。2026-10-13 白屏事故：
        # 曾在此处运行时覆盖 frontendDist 为绝对路径（B:\...\frontend）——
        # Tauri 2 的 frontendDist 只接受相对路径或 URL，绝对路径导致 WebView
        # 资源协议解析失败、窗口纯白（前端 bundle 本身经浏览器实测完好）。
        tauri_config: Optional[dict] = (
            {"build": {"frontendDist": "http://localhost:1420"}}
            if BOSS_DEV
            else None
        )
        ctx = context_factory(SRC_TAURI_DIR, tauri_config=tauri_config)

    with start_blocking_portal("asyncio") as portal:
        app = builder_factory().build(
            context=ctx,
            invoke_handler=commands.generate_handler(portal),
        )
        return app.run_return()
