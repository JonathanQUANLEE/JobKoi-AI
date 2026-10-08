"""免费模型预置列表。

数据来源（2026-10-08 核实）：
- OpenRouter：https://openrouter.ai/collections/free-models
  免费模型统一 ``:free`` 后缀，免费档每天约 50 次请求。
- 智谱：https://www.zhipuai.cn/zh/news/148
  GLM-4.7-Flash 在 bigmodel.cn 免费调用，OpenAI 兼容接口。
- SiliconFlow：https://siliconflow.cn/pricing
  多个免费小模型（Qwen/GLM 系），需国内实名后可用。

免费模型时效性强（每周都有增删），这里只预填常用项，用户可在 GUI 里
自由改 base_url / model（走任意 OpenAI 兼容端点）。
"""

from __future__ import annotations

LLM_PRESETS: list[dict[str, str]] = [
    {
        "id": "openrouter",
        "label": "OpenRouter 免费档",
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "qwen/qwen3.8-27b:free",
        "signup_hint": (
            "在 openrouter.ai/keys 免费注册并创建 API key；"
            "免费模型带 :free 后缀，每天约 50 次请求。"
        ),
    },
    {
        "id": "zhipu",
        "label": "智谱 GLM-4.7-Flash（免费）",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4.7-flash",
        "signup_hint": (
            "在 bigmodel.cn 注册即可免费调用 GLM-4.7-Flash；"
            "国内直连，无需信用卡。"
        ),
    },
    {
        "id": "siliconflow",
        "label": "SiliconFlow 免费档",
        "base_url": "https://api.siliconflow.cn/v1",
        "default_model": "Qwen/Qwen2.5-7B-Instruct",
        "signup_hint": "在 siliconflow.cn 注册并完成实名后可调用免费小模型。",
    },
    {
        "id": "custom",
        "label": "自定义（任意 OpenAI 兼容端点）",
        "base_url": "",
        "default_model": "",
        "signup_hint": "填写任意 OpenAI 兼容端点的 base_url 和模型名。",
    },
]
