"""agent 包的架构隔离红线（固化「LLM 永不直接触发投递」）。

agent 包只做「自然语言 → profile」的翻译；它**不允许** import：
- ``boss_zhipin.website_oper``（浏览器自动化：能点沟通按钮）
- ``boss_zhipin.cli``（run_automation 主循环入口）
- ``boss_zhipin.gui.runner``（start_run：GUI 启动投递的通道）

有人在 agent 里加任何一个这些 import（哪怕"只是顺手复用个小函数"），
这个测试就会红——请停下来重新设计调用方向：投递永远由用户在 GUI 点
「开始运行」触发，agent 的产出只到「表单回填」为止。
"""
from __future__ import annotations

import ast
from pathlib import Path

AGENT_DIR = Path(__file__).parent.parent / "src" / "boss_zhipin" / "agent"

FORBIDDEN_IMPORT_ROOTS = (
    "boss_zhipin.website_oper",
    "boss_zhipin.cli",
    "boss_zhipin.gui",
)


def test_agent_package_never_imports_delivery_pipeline():
    assert AGENT_DIR.is_dir(), f"agent 包不存在: {AGENT_DIR}"
    violations: list[str] = []
    for py_file in sorted(AGENT_DIR.glob("*.py")):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            module = None
            if isinstance(node, ast.Import):
                module = node.names[0].name
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                module = node.module
            if module and module.startswith(FORBIDDEN_IMPORT_ROOTS):
                violations.append(f"{py_file.name}: import {module}")
    assert not violations, (
        "agent 包违反隔离红线（禁止 import 投递链路）: " + "; ".join(violations)
    )
