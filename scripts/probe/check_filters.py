"""筛选规则用例验证：改完 profile 关键词，先跑这个再启动投递。

为什么必须有这一步：2026-10-02 曾把 8 个 AI 关键词写进 `required`（AND 语义），
结果要求标题同时含 agent+大模型+llm+…，**369 个岗位全被误杀**，白跑 40 分钟。
`required` = AND、`any` = OR，写错组代价极大。

用法：
    uv run python scripts/check_filters.py
    uv run python scripts/check_filters.py --out logs\filter-check.txt

全部用例通过才说明规则没写反；有任何一条不符合预期，先改 profile 再跑。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from boss_zhipin.config import profiles as profiles_mod  # noqa: E402
from boss_zhipin.config.filter_rules import JobPosting, match_posting  # noqa: E402

# (岗位标题, 公司, 期望是否通过, 说明)
CASES: list[tuple[str, str, bool, str]] = [
    ("Agent开发工程师（实习）", "有赞", True, "正经 Agent 实习"),
    ("大模型Agent架构实习生", "懂车帝", True, "正经大模型 Agent 实习"),
    ("AI 研发实习生（智能体应用方向）", "百度在线", True, "大厂智能体实习"),
    ("多模态大模型算法实习生-日常", "MiniMax", True, "大模型厂实习"),
    ("Agent安全研究实习生", "网易", True, "大厂 Agent 实习"),
    ("AI 原生产品实习生（Agent Harness 方向）", "云迹科技", True, "Agent Harness 方向"),
    ("大模型应用开发实习生", "中科信研院", True, "研究院大模型岗"),
    ("AI应用实习生（后端/Agent方向）", "歌尔股份", True, "硬件厂 Agent 岗"),
    # —— 下面是实测混进来的噪音，必须拦掉 ——
    ("大模型算法", "丰瑞直播培训", False, "直播培训公司"),
    ("大模型算法", "万嘉福朱砂", False, "朱砂贸易公司"),
    ("大模型算法", "科尔顿水务", False, "水务公司"),
    ("大模型算法", "西藏煜池新能源开发", False, "新能源开发公司"),
    ("高阶AI大模型训练师-双休", "杭州凌岳数科科技", False, "训练师不是开发岗"),
    ("具身智能-大模型摇操员", "广东天机智能", False, "摇操员不是开发岗"),
    # —— 明显非技术岗 ——
    ("销售专员", "某某科技", False, "销售岗"),
    ("Java后端开发工程师", "某某科技", False, "禁 Java"),
]


def main() -> None:
    # profile 可能带 extends 继承，必须走 load_profile 合并后的 data，
    # 直接读 yml 原文会漏掉父级规则（base.yml 已随 2026-10-19 脱敏移除）。
    loaded = profiles_mod.load_profile("0my", profiles_dir=ROOT / "profiles")
    filters = loaded.data.get("filters") or {}
    if not filters:
        print("❌ profile 里没读到 filters，检查 profiles/0my.yml")
        sys.exit(1)
    lines: list[str] = ["筛选规则用例验证（profile: 0my）", ""]
    passed = 0
    failed: list[str] = []

    for title, company, expected, note in CASES:
        posting = JobPosting(title=title, company=company)
        m = match_posting(posting, filters)
        ok = m.matched == expected
        flag = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed.append(f"{title} @ {company}")
        lines.append(
            f"  [{flag}] {title} @ {company}\n"
            f"        期望={'通过' if expected else '跳过'} 实际={'通过' if m.matched else '跳过'} "
            f"| {note} | {m.reason}"
        )

    lines.append("")
    lines.append(f"结果：{passed}/{len(CASES)} 通过")
    if failed:
        lines.append("不符合预期的用例：")
        lines.extend(f"  - {f}" for f in failed)
        lines.append("\n⚠️ 先改好 profiles/0my.yml 再启动投递！")
    else:
        lines.append("✅ 全部符合预期，可以启动投递。")

    text = "\n".join(lines)
    print(text)

    if "--out" in sys.argv:
        i = sys.argv.index("--out")
        if i + 1 < len(sys.argv):
            out = ROOT / sys.argv[i + 1]
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text, encoding="utf-8")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
