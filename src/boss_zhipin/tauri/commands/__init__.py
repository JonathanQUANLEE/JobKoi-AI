"""按业务域拆分的 IPC 命令层（P2-5 从 tauri/__init__.py 拆出，2026-10）。

import 本包即完成全部命令注册——各域模块的 ``@commands.command()``
装饰器挂在共享 registry（``_registry.commands``）上；``tauri/__init__.py``
import 本包后 main() 用同一实例 generate_handler。

七个域模块：
- runtime   运行控制（start/stop/浏览器/审核/状态）
- profile   求职画像与招呼语
- resume    简历库管理
- agent     智能助手/LLM 配置/简历诊断/工具执行/回复检测
- platform  多平台中心（登录态/投递历史）
- window    窗口控制
- schedule  定时巡航闹钟

IPC 契约（38 个命令名）由 tests/test_tauri_ipc_contract.py 守门。
"""

from boss_zhipin.tauri.commands._registry import commands

from boss_zhipin.tauri.commands import (  # noqa: F401 —— import 即注册
    agent,
    oauth,
    platform,
    profile,
    resume,
    runtime,
    schedule,
    window,
)

__all__ = ["commands"]
