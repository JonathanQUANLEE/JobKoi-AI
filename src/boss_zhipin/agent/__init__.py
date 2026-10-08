"""对话式 Agent 子系统（里程碑 1：智能助手面板的后端）。

职责边界（架构红线，tests/test_agent_isolation.py 固化）：
- 本包只做「用户自然语言 → LLM → 结构化 profile」的翻译和净化；
- **不 import** 浏览器自动化（website_oper）、投递主循环（cli.run_automation）、
  GUI runner——LLM 永远不能直接触发投递，投递只能由用户在 GUI 点「开始运行」。
"""
