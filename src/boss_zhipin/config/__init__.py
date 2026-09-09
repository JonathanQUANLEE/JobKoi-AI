"""Profile 配置加载与本地筛选规则。"""

from boss_zhipin.config.filter_rules import (
    FilterConfigError,
    JobPosting,
    PostingMatch,
    RuleMatch,
    match_posting,
    match_rule_group,
)
from boss_zhipin.config.profiles import (
    LoadedProfile,
    ProfileCycleError,
    ProfileError,
    load_profile,
    merge_profile,
)

__all__ = [
    "FilterConfigError",
    "JobPosting",
    "LoadedProfile",
    "PostingMatch",
    "ProfileCycleError",
    "ProfileError",
    "RuleMatch",
    "load_profile",
    "match_posting",
    "match_rule_group",
    "merge_profile",
]
