"""共享的 PyTauri 命令注册表（唯一 Commands 实例）。

各业务域模块都从这个 registry import ``commands`` 并挂装饰器；
``tauri/__init__.py`` 的 main() 用同一个实例 generate_handler——
保证全部 IPC 命令注册到 handler。命令集合契约由
tests/test_tauri_ipc_contract.py 守门（扫描 __init__ + commands/*.py，
当前 45 个命令名，以该测试断言为准）。
"""
from __future__ import annotations

from pytauri import Commands

commands = Commands()
