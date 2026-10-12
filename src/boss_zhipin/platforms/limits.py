"""三平台每日投递默认上限（单一真相）。

限额语义（用户 2026-10-11 拍板，两层缺一不可）：
1. **本地计数只是「预警」口径**——ledger.today_sent 达到默认上限后并非终局，
   继续尝试投递做实测验证（用户实测发现本地统计偶有漏记，前端显示"投完了"
   但手机端仍可投，故不能只信本地计数）；
2. **平台返回「今日额度已用完」类文案才是「最终裁决」**（各平台 limit 检测，
   见 dispatch 限额告警链路）——命中即安全停机，并把"已达 XX 条上限"明确
   反馈到前端用户。

历史上默认值散落 5+ 处并已发生漂移（quick_stats 曾写 200、实际 150），
P2（2026-10）统一于此。用户可经 profile YAML（daily_sent_limit）或 GUI
设置覆盖默认值；env（LIEPIN_DAILY_LIMIT 等）优先于本默认。
"""
from __future__ import annotations

DEFAULT_DAILY_LIMITS: dict[str, int] = {
    "boss": 150,  # 用户要求：BOSS 每日 150 份（与 profiles/0my.yml 的 daily_sent_limit 一致）
    "liepin": 100,
    "job51": 40,
}

# BOSS 拟人化节流安全区间（用户 2026-10-12 拍板，供用户在此范围内选档）：
# - 下限 15s：同类自动化工具公开文档中最保守的明确建议（影刀 RPA 智能招聘
#   帮助中心：「打招呼频率降低，至少 15s 一次」以规避封号风险）；
# - 上限 = 3×下限（45s）。GUI 三档预设：效率 15-30 / 标准 20-40 / 稳健 30-45；
# - 无论 GUI 还是手改 YAML 越界，运行时一律收敛进此区间（env_config 钳制）。
#   红线：本工具不做提速——历史上限曾是 0s（裸奔），收紧只会更慢更安全。
BOSS_DELAY_RANGE_SECONDS: tuple[float, float] = (15.0, 45.0)

# 猎聘 / 51job 同款安全区间（2026-10-13 用户拍板分平台三档后统一标准）：
# - 这两个平台没有公开的官方最低间隔数字（调研结论：只有 BOSS 有影刀
#   RPA「至少 15s」的公开建议；八爪鱼 RPA 建议 10-30s）。三平台共用同一
#   安全区间 [15,45]：下限取公开资料的最保守值 15s，不冒进；
# - 旧实现硬编码 40~80s 是拍脑袋值、无任何实测/资料依据，且完全无视
#   用户在 GUI 里的节奏档位选择（用户实测怒吼"我设了效率档为什么还 40s"）；
# - 三档预设与 BOSS 一致：效率 15-30 / 标准 20-40 / 稳健 30-45；运行时
#   钳制进 [15,45]，越界配置一律收敛。
LIEPIN_DELAY_RANGE_SECONDS: tuple[float, float] = (15.0, 45.0)
JOB51_DELAY_RANGE_SECONDS: tuple[float, float] = (15.0, 45.0)


def clamp_delay_range(value_min: float, value_max: float, bounds: tuple[float, float]) -> tuple[float, float]:
    """把 (min, max) 节流区间钳制进平台安全区间（min/max 乱序时自动理顺）。"""
    low, high = bounds
    a = min(float(value_min), float(value_max))
    b = max(float(value_min), float(value_max))
    return (max(low, a), min(high, b))
