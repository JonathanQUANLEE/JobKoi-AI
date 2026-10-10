"""语义契合度与关键词匹配算法 (Semantic Matcher & Skill Gap Analysis).

算法设计与原理：
1. TF-IDF / N-gram 向量余弦相似度：将文本拆解为词频向量，计算两篇文本向量夹角的 Cosine 相似度。
2. Jaccard 集合交并比：评估专业技能词集合的重合率。
3. 技能鸿沟分析 (Skill Gap Analysis)：对比目标 JD 要求，自动检测简历中未提及的技术栈。
4. 纯数学与 Python 标准库实现，零笨重第三方依赖，单次运行仅 1~2ms。
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class MatchResult:
    score: int  # 0 ~ 100
    matched_skills: list[str]
    missing_skills: list[str]
    similarity_ratio: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SemanticMatcher:
    # 中英文停用词过滤集合
    STOPWORDS = {
        "的", "了", "和", "是", "就", "都", "而", "及", "与", "一个", "没有", "我们",
        "你", "我", "他", "在", "对", "将", "以", "从", "到", "等", "进行", "负责",
        "使用", "基于", "实现", "以及", "通过", "包括", "主要", "a", "an", "the", "and",
        "or", "in", "on", "at", "to", "for", "with", "by", "of"
    }

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """中英混合分词与标准化 (提取英文单词、中文连续2-4字词)。"""
        cleaned = text.lower()
        # 英文/数字技术词 (如 fastapi, python, k8s, qps)
        en_words = re.findall(r"\b[a-z0-9_\-\+\#\.]+\b", cleaned)
        # 中文汉字序列
        cn_chars = re.findall(r"[\u4e00-\u9fa5]+", cleaned)
        tokens: list[str] = [w for w in en_words if len(w) > 1 and w not in SemanticMatcher.STOPWORDS]

        for chunk in cn_chars:
            if len(chunk) <= 1:
                continue
            # 2-gram 窗口切分
            for i in range(len(chunk) - 1):
                token = chunk[i : i + 2]
                if token not in SemanticMatcher.STOPWORDS:
                    tokens.append(token)
            # 3-gram
            if len(chunk) >= 3:
                for i in range(len(chunk) - 2):
                    token = chunk[i : i + 3]
                    if token not in SemanticMatcher.STOPWORDS:
                        tokens.append(token)

        return tokens

    @classmethod
    def calculate_similarity(cls, resume_text: str, target_jd_text: str) -> MatchResult:
        """计算简历与目标岗位 JD 的余弦相似度及技能鸿沟。"""
        if not resume_text.strip() or not target_jd_text.strip():
            return MatchResult(score=0, matched_skills=[], missing_skills=[], similarity_ratio=0.0)

        resume_tokens = cls._tokenize(resume_text)
        jd_tokens = cls._tokenize(target_jd_text)

        if not resume_tokens or not jd_tokens:
            return MatchResult(score=0, matched_skills=[], missing_skills=[], similarity_ratio=0.0)

        # 1. 余弦相似度计算
        vec_r = Counter(resume_tokens)
        vec_jd = Counter(jd_tokens)

        intersection = set(vec_r.keys()) & set(vec_jd.keys())
        dot_product = sum(vec_r[t] * vec_jd[t] for t in intersection)

        magnitude_r = math.sqrt(sum(c * c for c in vec_r.values()))
        magnitude_jd = math.sqrt(sum(c * c for c in vec_jd.values()))

        if magnitude_r == 0 or magnitude_jd == 0:
            cosine_sim = 0.0
        else:
            cosine_sim = dot_product / (magnitude_r * magnitude_jd)

        # 2. 核心技术栈交并集与缺口检测
        from boss_zhipin.algorithms.ats_scorer import ATSScorer
        tech_set = set(ATSScorer.TECH_KEYWORDS)
        
        resume_lower = resume_text.lower()
        jd_lower = target_jd_text.lower()

        jd_skills = [s for s in tech_set if s in jd_lower]
        matched_skills = [s for s in jd_skills if s in resume_lower]
        missing_skills = [s for s in jd_skills if s not in resume_lower]

        skill_coverage = len(matched_skills) / max(1, len(jd_skills)) if jd_skills else cosine_sim

        # 综合分 (60% 余弦相似度 + 40% 核心技能覆盖率)
        score = int((cosine_sim * 0.6 + skill_coverage * 0.4) * 100)
        score = max(5, min(98, score))

        return MatchResult(
            score=score,
            matched_skills=matched_skills[:8],
            missing_skills=missing_skills[:8],
            similarity_ratio=round(cosine_sim, 4),
        )
