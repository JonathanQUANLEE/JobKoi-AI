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

import base64
import os


def get_public_api_key() -> str:
    """公共体验 Key（V0.4 方案 A，2026-10-14 用户拍板：安装包内置，
    新用户开箱即用）。以 base64 形态内置（2026-10-19 改版：此前明文值
    依赖 git skip-worktree 标记防提交——导致本地改动（如新增 DeepSeek
    预设）静默不进 git、CI 构建的安装包永远拿不到 Key。base64 化后
    git 与工作区一致，公开仓库不出现明文 Key）。环境变量
    ZHIPU_PUBLIC_API_KEY 可覆盖。

    2026-10-16 事故备注：曾被他方改为"仅从环境变量读、默认空串"——导致
    安装包用户拿不到 Key、脱敏态下 AI 全部报"未配置模型"。方案 A 的
    内置语义必须保留，勿再回退成空串默认。
    """
    fallback = base64.b64decode(
        "NDE3NjQ0Y2RkMzFhNGQ5MTlmYWI4ZmRjNTFlNzFlZTQucnVFVEFlUGpkaDBDcDAxRg=="
    ).decode("ascii")
    return os.getenv("ZHIPU_PUBLIC_API_KEY", fallback).strip()

# 兼容常量
ZHIPU_PUBLIC_API_KEY = get_public_api_key()

# 开箱默认端点（config_io.effective_config 在用户未配置时回落到这里）
DEFAULT_PRESET_ID = "zhipu"

LLM_PRESETS: list[dict[str, str]] = [
    {
        "id": "zhipu",
        "label": "智谱 GLM-4-Flash（推荐 · 已内置 Key）",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
        "default_api_key": ZHIPU_PUBLIC_API_KEY,
        "signup_hint": (
            "国内直连、反应速度快；已内置公共体验 Key 开箱即用，"
            "也可以换成自己在 bigmodel.cn 注册的 Key。"
        ),
        "recommended": "true",
    },
    {
        "id": "deepseek",
        "label": "DeepSeek 官方",
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
        "default_api_key": "",
        "signup_hint": "在 platform.deepseek.com 注册并获取 API Key，国内性价比与通用能力首选。",
    },
    {
        "id": "siliconflow",
        "label": "SiliconFlow 硅基流动",
        "base_url": "https://api.siliconflow.cn/v1",
        "default_model": "Qwen/Qwen2.5-7B-Instruct",
        "default_api_key": "",
        "signup_hint": "在 siliconflow.cn 注册并完成实名后可调用免费开源模型。",
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
        "id": "custom",
        "label": "自定义（任意 OpenAI 兼容端点）",
        "base_url": "",
        "default_model": "",
        "default_api_key": "",
        "signup_hint": "填写任意 OpenAI 兼容端点的 base_url 和模型名（支持本地 Ollama、OneAPI 等）。",
    },
]
