"""agent 模块的 LLM 端点配置读写（``agent_config.json``）。

- 路径是**相对路径**：repo/CLI 模式落在仓库根；standalone .app 模式下
  入口已 ``ensure_app_data_cwd()`` 把 CWD 归位到应用数据目录，配置自动
  跟着走（与 .env 同一套约定，见 ``boss_zhipin.paths``）。
- api_key 是敏感信息：文件进 ``.gitignore``；对外（IPC 返回）只给掩码；
  保存时空串 / 掩码 = 保留旧值（否则「保存」会把掩码写进配置覆盖真 key）。
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path

log = logging.getLogger(__name__)

CONFIG_FILENAME = "agent_config.json"
DEFAULT_CONFIG_PATH = Path(CONFIG_FILENAME)

# 掩码里出现的固定片段，用于识别「前端原样回传的掩码」
_MASK_FRAGMENT = "****"


@dataclass
class AgentConfig:
    base_url: str = ""
    api_key: str = ""
    model: str = ""

    def is_configured(self) -> bool:
        return bool(
            self.base_url.strip() and self.api_key.strip() and self.model.strip()
        )


def read_config(path: Path | None = None) -> AgentConfig:
    """读配置；文件缺失 / 损坏时返回空配置（不抛，让 UI 引导用户去填）。"""
    config_path = path or DEFAULT_CONFIG_PATH
    if not config_path.exists():
        return AgentConfig()
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        log.warning("agent 配置读不出（%s），按未配置处理: %s", config_path, e)
        return AgentConfig()
    if not isinstance(data, dict):
        log.warning("agent 配置顶层不是对象: %s", config_path)
        return AgentConfig()
    return AgentConfig(
        base_url=str(data.get("base_url") or "").strip(),
        api_key=str(data.get("api_key") or "").strip(),
        model=str(data.get("model") or "").strip(),
    )


def default_config() -> AgentConfig:
    """开箱默认配置（智谱 GLM-4-Flash）+ 内置公共体验 Key（V0.4 方案 A）。

    Key 优先级（2026-10-16 修正）：环境变量 ZHIPU_PUBLIC_API_KEY >
    presets.py 硬编码公共 Key > preset 快照。运行时经 get_public_api_key()
    读取，测试/注入可随时覆盖。"""
    from boss_zhipin.agent.presets import DEFAULT_PRESET_ID, LLM_PRESETS, get_public_api_key

    preset = next((p for p in LLM_PRESETS if p.get("id") == DEFAULT_PRESET_ID), None)
    if not preset:
        return AgentConfig()
    api_key = get_public_api_key() or str(preset.get("default_api_key") or "").strip()
    return AgentConfig(
        base_url=str(preset.get("base_url") or "").strip(),
        api_key=api_key,
        model=str(preset.get("default_model") or "").strip(),
    )


def effective_config(path: Path | None = None) -> AgentConfig:
    """生效配置：用户自己保存过的配置优先；未配置（文件缺失/空）时回落
    开箱默认（智谱 + 公共 Key）。所有 AI 运行时与 IPC 读取一律走这里。"""
    cfg = read_config(path)
    if cfg.is_configured():
        return cfg
    return default_config()


def write_config(config: AgentConfig, path: Path | None = None) -> None:
    config_path = path or DEFAULT_CONFIG_PATH
    config_path.write_text(
        json.dumps(asdict(config), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def mask_key(key: str) -> str:
    """api_key 脱敏：只露头尾各 4 位，中间打码。空 key 返回空串。"""
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 8:
        return _MASK_FRAGMENT
    return f"{key[:4]}{_MASK_FRAGMENT}{key[-4:]}"


def is_masked(key: str) -> bool:
    """判断提交上来的 key 是不是「原样回传的掩码」。"""
    return _MASK_FRAGMENT in (key or "")


def merge_saved_key(submitted: str, existing: str) -> str:
    """保存时合并 key：空串或掩码 = 保留旧值，其余 = 采用新值。"""
    submitted = (submitted or "").strip()
    if not submitted or is_masked(submitted):
        return (existing or "").strip()
    return submitted
