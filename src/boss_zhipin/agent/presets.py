"""免费模型预置列表。

数据来源（2026-10-08 核实；2026-10-14 V0.4 按用户拍板重构为双推荐）：
- 智谱（默认推荐）：https://open.bigmodel.cn
  GLM-4-Flash 免费调用、OpenAI 兼容接口、国内直连反应快。
  V0.4 方案 A：内置公共体验 Key，新用户开箱即用（所有安装用户共享
  该 Key 的免费额度；若被滥用或失效，替换下方常量即可）。
- OpenRouter：https://openrouter.ai/collections/free-models
  免费模型统一 ``:free`` 后缀，免费档每天约 50 次请求（用户需自行注册）。
- SiliconFlow：https://siliconflow.cn/pricing
  多个免费小模型（Qwen/GLM 系），需国内实名后可用。

免费模型时效性强（每周都有增删），这里只预填常用项，用户可在 GUI 里
自由改 base_url / model（走任意 OpenAI 兼容端点）并保存。
"""

import os

def get_public_api_key() -> str:
    """获取公共体验 Key（开源代码库默认空串脱敏，可由环境变量 ZHIPU_PUBLIC_API_KEY 注入）。"""
    return os.getenv("ZHIPU_PUBLIC_API_KEY", "").strip()

# 兼容常量（脱敏默认为空）
ZHIPU_PUBLIC_API_KEY = get_public_api_key()

# 开箱默认端点（config_io.effective_config 在用户未配置时回落到这里）
DEFAULT_PRESET_ID = "zhipu"

LLM_PRESETS: list[dict[str, str]] = [
    {
        "id": "zhipu",
        "label": "智谱 GLM-4-Flash（推荐）",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
        "default_api_key": "",
        "signup_hint": (
            "国内直连、反应速度快；可在 bigmodel.cn 免费获取 API key，"
            "或在上方直接填写任意 OpenAI 兼容端点。"
        ),
        "recommended": "true",
    },
    {
        "id": "openrouter",
        "label": "OpenRouter 免费档",
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "nvidia/nemotron-3.5-lightning:free",
        "default_api_key": "",
        "signup_hint": (
            "在 openrouter.ai/keys 免费注册并创建 API key；"
            "免费模型带 :free 后缀，每天约 50 次请求，100 万超长上下文。"
        ),
    },
    {
        "id": "siliconflow",
        "label": "SiliconFlow 免费档",
        "base_url": "https://api.siliconflow.cn/v1",
        "default_model": "Qwen/Qwen2.5-7B-Instruct",
        "default_api_key": "",
        "signup_hint": "在 siliconflow.cn 注册并完成实名后可调用免费小模型。",
    },
    {
        "id": "custom",
        "label": "自定义（任意 OpenAI 兼容端点）",
        "base_url": "",
        "default_model": "",
        "default_api_key": "",
        "signup_hint": "填写任意 OpenAI 兼容端点的 base_url 和模型名。",
    },
]
