"""Smart 意图分层匹配 · 真实画像实测脚本（2026-10-13）。

用法::

    uv run python scripts/verify_smart_matching.py

背景：用户要求"输入一个职位，看有多少个结果，反馈给我"。本脚本
加载**真实画像** profiles/gui-default.yml（smart any = "AI agent 实习"），
对一批模拟的 BOSS 搜索结果标题跑完整 match_posting（含 exclude），
输出人话报告：投多少 / 每个岗位命中哪一层 / 跳过原因。

标题清单来源：用户点名的岗位 + BOSS 搜索"AI agent 实习"真实结果页
的典型构成（目标岗 + 同族岗 + 无关岗 + exclude 岗）。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from boss_zhipin.config.filter_rules import match_posting
from boss_zhipin.config.profiles import load_profile
from boss_zhipin.config.rule_models import JobPosting

# 模拟一页搜索结果（30 条，构成接近真实 BOSS 搜索"AI agent 实习"的返回页）
SIMULATED_TITLES = [
    # —— 用户点名的目标岗（一个都不许错过）——
    "AI Agent 实习工程师",
    "AI Agent开发实习生",
    "AI Agent 工程师（暑期实习生）",
    "AI Agent应用开发工程师",
    "大模型应用实习生",
    "AIGC算法实习生",
    "AI应用开发工程师",
    "人工智能训练师实习生",
    "机器学习平台开发（暑期实习）",
    "AI产品培训生",
    "管理培训生（AI方向）",
    "AI基建工程师（暑期实习生）",
    "大模型算法实习生",
    "AIGC内容运营实习生",
    # —— 同族/泛 AI 岗（L2-L4 应命中）——
    "Agent开发工程师",
    "智能体应用开发",
    "NLP算法工程师（实习）",
    "LLM 应用开发实习生",
    "多模态算法实习生",
    "深度学习实习生",
    "AI 产品经理实习生",
    "生成式AI研发实习生",
    # —— 无关岗（应跳过：方向不符）——
    "Java开发实习生",
    "Web前端工程师",
    "测试开发工程师",
    "数据分析实习生",
    "产品运营实习生",
    # —— exclude 岗（应跳过：用户排除词）——
    "AI课程销售",
    "课程顾问（AI培训方向）",
    "客服专员",
]


def main() -> int:
    profile = load_profile("gui-default")
    filters = profile.data.get("filters") or {}
    if not filters:
        print("!! 画像没有 filters，检查 profiles/gui-default.yml")
        return 1

    query = (profile.data.get("search") or {}).get("query", "")
    print("=" * 62)
    print(f"画像: gui-default | 搜索词: {query!r}")
    any_rule = ((filters.get("title") or {}).get("any") or {})
    print(f"any 规则: match={any_rule.get('match')} keywords={any_rule.get('keywords')}")
    print("=" * 62)

    matched: list[tuple[str, str]] = []
    skipped: list[tuple[str, str]] = []
    for title in SIMULATED_TITLES:
        result = match_posting(JobPosting(title=title), filters)
        if result.matched:
            matched.append((title, result.reason))
        else:
            skipped.append((title, result.reason))

    print(f"\n【结果】{len(SIMULATED_TITLES)} 个岗位 → 投 {len(matched)} / 跳过 {len(skipped)}\n")
    print("—— 会投（命中分层）——")
    for title, reason in matched:
        print(f"  ✓ {title:<24} {reason}")
    print("\n—— 跳过（原因）——")
    for title, reason in skipped:
        print(f"  ✗ {title:<24} {reason}")

    # 分层统计
    layers = {"L1": 0, "L2": 0, "L3": 0, "L4": 0}
    for _, reason in matched:
        for layer in layers:
            if layer in reason:
                layers[layer] += 1
                break
    print(f"\n【分层统计】L1 完整意图 {layers['L1']} | L2 强方向 {layers['L2']} | "
          f"L3 同族+性质 {layers['L3']} | L4 泛方向 {layers['L4']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
