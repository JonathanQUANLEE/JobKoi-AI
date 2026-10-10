"""平台限额提醒文案检测（纯函数，三平台共用）。

设计背景（用户 2026-10-10 拍板）：
- 每个平台在投递到一定数量后会弹出各自的「今日已达上限」提示；
- 不靠本地计数猜额度，而是**监听页面上的平台限额提示文案**：命中即停，
  同时用本地 sent 账本回答「今天实际投了多少」；
- 各平台文案差异大且会改版——词库集中放在这里，实测到新文案随时补。

文案来源（2026-10-10 调研）：
- BOSS 直聘：系统提示「今日沟通次数已达上限」（公开报道原文）。
- 前程无忧 51job：系统提示「今日投递次数已达上限」（求职者实测记录）。
- 猎聘：公开可查的多为企业端文档，求职端文案按平台惯例列入
  「打招呼/投递 次数已达上限」族，待实测补充。

误报防护：这里的匹配只在「点击沟通/投递动作之后」被调用（动作点检测，
不是全页漫扫），且要求整段关键词命中，降低误杀概率。
"""

from __future__ import annotations

# platform_id -> 命中即判定「平台限额」的整段关键词（顺序即优先级）
LIMIT_ALERT_PATTERNS: dict[str, tuple[str, ...]] = {
    "boss": (
        "今日沟通次数已达上限",
        "沟通次数已达上限",
        "今日沟通次数已用完",
        "沟通次数已用完",
        "打招呼次数已达上限",
        "今日打招呼次数已达上限",
    ),
    "liepin": (
        "今日打招呼次数已用完",
        "打招呼次数已达上限",
        "今日投递次数已达上限",
        "投递次数已达上限",
        "今日沟通次数已达上限",
    ),
    "job51": (
        "今日投递次数已达上限",
        "投递次数已达上限",
        "今日申请次数已达上限",
        "申请次数已达上限",
    ),
}

# 平台弹出的常见「已达上限」引导付费类提示也一并视为限额信号（同属停止条件）
_EXTRA_HINTS = (
    "今日沟通次数",
    "今日投递次数",
    "今日打招呼次数",
)


class PlatformLimitReached(RuntimeError):
    """投递动作后页面出现平台限额提示——调用方应停止本轮并统计已投数量。"""

    def __init__(self, platform: str, matched_text: str) -> None:
        super().__init__(f"[{platform}] 平台限额提示命中: {matched_text!r}")
        self.platform = platform
        self.matched_text = matched_text


def match_limit_alert(platform_id: str, page_text: str) -> str | None:
    """从页面文本中检出平台限额提示，返回命中的关键词；未命中返回 None。"""
    text = page_text or ""
    patterns = LIMIT_ALERT_PATTERNS.get(platform_id)
    if patterns is None:
        raise ValueError(f"未知平台: {platform_id}")
    for pattern in patterns:
        if pattern in text:
            return pattern
    return None


def check_limit_alert(platform_id: str, page_text: str) -> None:
    """命中限额提示即抛 ``PlatformLimitReached``；否则静默通过。"""
    matched = match_limit_alert(platform_id, page_text)
    if matched:
        raise PlatformLimitReached(platform_id, matched)