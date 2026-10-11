"""IPC body 模型的公共基类（前端 camelCase ↔ Python snake_case）。"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """前端 TS 用 camelCase，Python 用 snake_case。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
