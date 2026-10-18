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

import os

DEFAULT_DAILY_LIMITS: dict[str, int] = {
    # BOSS 150（2026-10-18 用户拍板）：官方上限就是 150（此前 2026-10-15 曾
    # 一度按调研收紧到 100，用户确认按 150 执行）。UI（设置弹窗/实时看板）
    # 一直显示 150，本次把单一真相源改齐，消除显示与实际的漂移。
    "boss": 150,
    # 猎聘保持 50（2026-10-18 用户裁定）：用户只确认了 BOSS=150；猎聘沿用
    # 2026-10-15 封号复盘拍板的保守值 50（该账号吃过 2h 临时封禁）。
    # UI 的"官方上限 100"标签描述的是平台允许的最大值（输入上限），
    # 本默认值是实际执行口径；用户可在画像/GUI 覆盖上调至 100。
    "liepin": 50,
    "job51": 40,
}

# 单轮巡航上限默认（2026-10-15 用户拍板"一次开启巡航之后各平台投多少
# 就停止，宁可慢点也不想被封号"）：单轮少投、多轮分摊，把一轮巡航的
# 访问/发送节奏压回真人"一次坐下来投几份"的水平。env（新号保护模式
# 注入的更小份额）永远优先；BOSS 单轮上限走既有 BOSS_AUTO_SEND_MAX_SENT
# 链路（GUI「拟人风控与策略」max_sent 可调），不在此重复定义。
DEFAULT_RUN_MAX_LIMITS: dict[str, int] = {
    "liepin": 15,
    "job51": 10,
}


def env_run_max(env_name: str, platform: str) -> int | None:
    """读单轮上限 env；未设/非法时回退保守默认（liepin 15 / job51 10）。

    保护模式显式注入的更小份额（如 5）经 env 读到后原样返回、永远优先；
    正常巡航未注入时也不再无限投（旧 None=不限），到默认份额即停。
    """
    raw = os.getenv(env_name, "").strip()
    if raw.isdigit() and int(raw) > 0:
        return int(raw)
    return DEFAULT_RUN_MAX_LIMITS.get(platform)


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
