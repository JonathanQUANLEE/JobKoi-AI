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
