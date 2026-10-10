"""JobHunter 核心算法套件：
1. ats_scorer: 启发式 ATS 简历质量评估算法
2. semantic_matcher: TF-IDF 与向量余弦相似度算法
3. anti_detection: 泊松过程拟人化时延与贝塞尔轨迹算法
"""

from boss_zhipin.algorithms.ats_scorer import ATSScorer, ATSScoreResult
from boss_zhipin.algorithms.semantic_matcher import SemanticMatcher
from boss_zhipin.algorithms.anti_detection import AntiDetectionPolicy

__all__ = [
    "ATSScorer",
    "ATSScoreResult",
    "SemanticMatcher",
    "AntiDetectionPolicy",
]
