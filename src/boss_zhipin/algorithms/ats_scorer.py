"""ATS 启发式简历质量评估算法 (Heuristic ATS Scorer).

算法设计与原理：
1. 量化密度 (Quantification Density)：基于正则表达式与启发式模式扫描可衡量指标（% / 倍 / QPS / 时延 / 成本 / 业务产出）。
2. 动词冲击力 (Action Verbs Power)：评估主动强动词（主导/重构/攻坚/设计）与弱动词（负责/参与/协助）的比率。
3. STAR 逻辑闭环度 (STAR Structure Completeness)：检测经历描述是否具备背景、挑战、行动举措与量化产出的完整逻辑链。
4. 技术栈深度 (Skill Depth)：分析关键技术词汇密度与上下文结合度。
5. 易读性惩罚 (Readability & ATS Format)：段落过长惩罚、极端缺乏标点分段惩罚。
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class ATSScoreResult:
    overall_score: int
    dimensions: dict[str, int]  # quantification, action_verbs, star_logic, technical_depth, readability
    metrics_count: int
    strong_verbs_count: int
    weak_verbs_count: int
    word_count: int
    highlights: list[str]
    issues: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ATSScorer:
    # 强动词库（体现主导性、创造性、攻坚能力）
    STRONG_VERBS = [
        "主导", "重构", "设计", "攻坚", "统筹", "架构", "落地", "推动", "搭建",
        "调优", "封装", "牵头", "突破", "研发", "重写", "优化", "主笔", "沉淀",
        "制定", "部署", "迭代", "解决", "首创", "重塑", "自动化", "迁移", "演进",
        "提升", "缩短", "削减", "重组", "驱动", "赋能", "保障", "支撑"
    ]

    # 弱动词库（体现被动参与，缺乏所有权）
    WEAK_VERBS = [
        "负责", "参与", "协助", "配合", "做过", "跟进", "了解", "接触", "学习", "日常处理"
    ]

    # 量化指标正则模式
    METRIC_PATTERNS = [
        r"\b\d+(\.\d+)?%",                         # 30%, 15.5%
        r"\d+倍",                                   # 3倍
        r"\d+\s*(?:ms|毫秒|s|秒|min|分钟)",         # 200ms, 1.2s
        r"(?:提升|提高|降低|削减|减少|增长|节约)\s*\d+", # 提升20%
        r"\d+\s*(?:万|千万|亿|QPS|TPS|PV|UV|G|TB)",  # 10万QPS, 5000万次
        r"从\s*\d+.*?(?:到|至)\s*\d+",              # 从60%到95%
        r"前\s*\d+%",                              # 前5%
        r"\b\d{2,}\b.*?(?:用户|并发|任务|请求|条|单)",# 1000并发
    ]

    # 常见技术栈高频关键词库
    TECH_KEYWORDS = [
        "python", "java", "golang", "c++", "rust", "sql", "mysql", "redis",
        "kafka", "docker", "kubernetes", "k8s", "linux", "fastapi", "django",
        "spring", "spring boot", "react", "vue", "typescript", "git", "ci/cd",
        "pytorch", "tensorflow", "llm", "agent", "langchain", "rag", "playwright",
        "selenium", "nginx", "mongodb", "elasticsearch", "微服务", "分布式", "高并发"
    ]

    @classmethod
    def score(cls, text: str) -> ATSScoreResult:
        """运行启发式评估算法并输出多维诊断指标。"""
        cleaned = text.strip()
        word_count = len(cleaned)

        if not cleaned:
            return ATSScoreResult(
                overall_score=0,
                dimensions={
                    "quantification": 0,
                    "action_verbs": 0,
                    "star_logic": 0,
                    "technical_depth": 0,
                    "readability": 0,
                },
                metrics_count=0,
                strong_verbs_count=0,
                weak_verbs_count=0,
                word_count=0,
                highlights=[],
                issues=["简历内容为空，请上传简历或粘贴经历文本"],
            )

        # 1. 量化维度计算
        metrics_hits: list[str] = []
        for pat in cls.METRIC_PATTERNS:
            found = re.findall(pat, cleaned, re.IGNORECASE)
            metrics_hits.extend(found)
        metrics_count = len(metrics_hits)
        
        # 量化得分：每 100 字期望至少 0.8 个量化点，封顶 100
        quant_density = (metrics_count / max(1, word_count / 100))
        quant_score = min(100, int(quant_density * 45) + min(metrics_count * 10, 40))

        # 2. 动词冲击力计算
        strong_hits = [v for v in cls.STRONG_VERBS if v in cleaned]
        weak_hits = [v for v in cls.WEAK_VERBS if v in cleaned]
        strong_count = len(strong_hits)
        weak_count = len(weak_hits)

        # 动词得分：强动词奖励，弱动词适度衰减
        verb_base = min(100, strong_count * 15 + 20)
        verb_penalty = min(30, weak_count * 6)
        action_verb_score = max(20, min(100, verb_base - verb_penalty))

        # 3. STAR 逻辑完整度计算
        star_markers = {
            "S (背景/痛点)": bool(re.search(r"(?:背景|痛点|由于|原有|针对|面临|需求|现状)", cleaned)),
            "T (目标/任务)": bool(re.search(r"(?:目标|为了|旨在|指标|要求|任务|负责)", cleaned)),
            "A (行动/手段)": bool(re.search(r"(?:采用|使用|基于|设计|实现|重构|搭建|引入|开发|算法)", cleaned)),
            "R (结果/收益)": bool(re.search(r"(?:最终|使得|达成|实现|提升|降低|上线|产出|成果|收益)", cleaned)),
        }
        star_hits = sum(1 for v in star_markers.values() if v)
        star_logic_score = min(100, star_hits * 25)

        # 4. 技术栈深度计算
        lower_text = cleaned.lower()
        tech_hits = [k for k in cls.TECH_KEYWORDS if k in lower_text]
        tech_count = len(tech_hits)
        tech_depth_score = min(100, tech_count * 12 + 15)

        # 5. 易读性与结构规范计算
        lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
        avg_line_len = word_count / max(1, len(lines))
        readability_score = 85
        # 惩罚过长的无换行大段
        if avg_line_len > 180:
            readability_score -= 25
        elif avg_line_len < 15:
            readability_score -= 10
        # 长度适中奖励 (500~2500字为佳)
        if 400 <= word_count <= 3500:
            readability_score += 15
        else:
            readability_score -= 15
        readability_score = max(20, min(100, readability_score))

        # 综合加权总分
        overall = int(
            quant_score * 0.30
            + action_verb_score * 0.25
            + star_logic_score * 0.20
            + tech_depth_score * 0.15
            + readability_score * 0.10
        )
        overall = max(10, min(99, overall))

        # 生成诊断高亮与建议
        highlights = []
        issues = []

        if metrics_count >= 3:
            highlights.append(f"量化意识良好：检测到 {metrics_count} 处可度量的数据/指标表达")
        else:
            issues.append("量化数据严重缺失：缺少百分比、并发规模、耗时对比或业务效益指标")

        if strong_count >= 3 and weak_count <= 2:
            highlights.append(f"用词有力：涵盖「{'、'.join(strong_hits[:4])}」等高价值驱动型动词")
        elif weak_count > 2:
            issues.append(f"被动弱动词过多：出现多处「{'、'.join(weak_hits[:3])}」，建议替换为主导/设计/攻坚")

        if star_hits == 4:
            highlights.append("STAR 闭环完整：项目描述涵盖背景、目标、行动与成果结构")
        else:
            missing_star = [k for k, v in star_markers.items() if not v]
            issues.append(f"缺少 STAR 关键要素：建议补充 {'、'.join(missing_star)}")

        if tech_count >= 5:
            highlights.append(f"技术关键词覆盖广：匹配 {tech_count} 个核心技术关键词，利于通过 ATS 机筛")
        else:
            issues.append("核心技术词汇偏少：建议在经历中明确标明使用的技术栈与组件名称")

        return ATSScoreResult(
            overall_score=overall,
            dimensions={
                "quantification": quant_score,
                "action_verbs": action_verb_score,
                "star_logic": star_logic_score,
                "technical_depth": tech_depth_score,
                "readability": readability_score,
            },
            metrics_count=metrics_count,
            strong_verbs_count=strong_count,
            weak_verbs_count=weak_count,
            word_count=word_count,
            highlights=highlights,
            issues=issues,
        )
