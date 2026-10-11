from __future__ import annotations

import ast
from pathlib import Path


REPO_ROOT = Path(__file__).parent.parent
TAURI_PKG = REPO_ROOT / "src" / "boss_zhipin" / "tauri"
TAURI_ENTRY = TAURI_PKG / "__init__.py"
COMMANDS_DIR = TAURI_PKG / "commands"


def _collect_commands(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {
        node.name
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and any(_is_commands_command(decorator) for decorator in node.decorator_list)
    }


def test_tauri_ipc_commands_match_gui_v02_contract():
    # P2-5 起命令层按业务域拆在 commands/*.py；__init__.py 保留兼容 re-export
    # 与 main()。契约扫描范围 = 入口 + 全部域模块，命令集合断言不变。
    paths = [TAURI_ENTRY, *sorted(COMMANDS_DIR.glob("*.py"))]
    commands: set[str] = set()
    for path in paths:
        commands |= _collect_commands(path)

    assert commands == {
        "list_profiles",
        "get_profile",
        "save_profile",
        "get_greeting",
        "save_greeting",
        "start_run",
        "stop_run",
        "shutdown_browser",
        "open_manual_browser",
        "get_run_state",
        "get_browser_page_state",
        "submit_review_decision",
        # agent 里程碑 1（对话式智能助手）
        "agent_chat",
        "get_llm_config",
        "save_llm_config",
        # F1 简历管理
        "list_resumes",
        "set_default_resume",
        "get_resume_content",
        "save_resume_file",
        "delete_resume_file",
        # F4 工具执行层
        "agent_execute_action",
        # F3 新回复检测
        "check_boss_replies",
        # 多平台适配层（多平台选择与扫码登录）
        "list_platforms",
        "open_platform_login",
        "check_login_status",
        # 窗口控制
        "window_minimize",
        "window_toggle_maximize",
        "window_close",
        # 投递历史与记录
        "get_delivery_history",
        "reset_today_delivery",
        # 定时巡航闹钟（系统级计划任务）
        "get_schedule_status",
        "save_schedule",
        "cancel_schedule",
        # 简历扩展
        "open_resume_native",
        "diagnose_resume",
        "calculate_ats_score",
    }


def _is_commands_command(decorator: ast.expr) -> bool:
    return (
        isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr == "command"
        and isinstance(decorator.func.value, ast.Name)
        and decorator.func.value.id == "commands"
    )
