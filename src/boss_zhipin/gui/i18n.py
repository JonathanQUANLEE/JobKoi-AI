"""后端面向用户的报错文案。

v0.2 删除了 GUI 写 `.env` 的语言 IPC，后端报错统一用中文，前端仍可保留本地
显示语言。保留 ``msg()`` 是为了调用点不直接散落字符串。
"""
from __future__ import annotations

_MESSAGES: dict[str, str] = {
    # ---- start_run pre-flight ----
    "err.already_running": "已经在运行了",
    "err.need_name": "请先在「运行」页填写你的名字（招呼语署名用）",
}


def msg(key: str, **vars: object) -> str:
    """取一条本地化文案；``{name}`` 占位符用 kwargs 替换。

    缺 key → 回退 key 本身（开发期一眼看出漏翻）。
    """
    text = _MESSAGES.get(key, key)
    if vars:
        for k, v in vars.items():
            text = text.replace("{" + k + "}", str(v))
    return text
