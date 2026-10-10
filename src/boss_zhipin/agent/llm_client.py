"""最小 OpenAI 兼容 chat.completions 客户端（零第三方依赖）。

为什么不用 openai SDK：项目 0.2 收敛时已把 LLM 依赖整体移除（当前仅
python-dotenv / PyYAML / nodriver）；一个 POST JSON 的调用用 stdlib
``urllib.request`` 就够，不为 60 行逻辑引入一个 SDK。任意 OpenAI 兼容端点
（OpenRouter / 智谱 / SiliconFlow / DeepSeek / 本地 vLLM…）走同一条路。

调用契约：
- ``chat_completion``：单次调用，HTTP 层错误抛 ``LLMClientError``；
- ``chat_completion_with_retry``：在它外面套 ``utils.retry`` 的指数退避，
  **只重试** 429 / 5xx / 网络 / 超时（``LLMRetryableError``），
  4xx（认证错 / 参数错）不重试——重试也不会好。

注意：本模块是**同步阻塞**的。调用方（profile_generator.generate）必须用
``asyncio.to_thread`` 包住，否则会卡死 GUI 的事件循环。
"""

from __future__ import annotations

import http.client
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

from boss_zhipin.utils.retry import retry_with_backoff

log = logging.getLogger(__name__)

# 重试可容忍的秒数上限（LLM 生成 30-60s 属正常，别把正常时长当超时砍了）
DEFAULT_TIMEOUT = 90.0


class LLMClientError(RuntimeError):
    """LLM 调用失败（不可重试：401 认证错 / 400 参数错 / 返回体不合法）。"""

    def __init__(self, code: int | str, message: str) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message


class LLMRetryableError(LLMClientError):
    """可重试失败：429 限流 / 5xx 服务端错误 / 网络抖动 / 超时。"""


def chat_completion(
    messages: list[dict[str, Any]],
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout: float = DEFAULT_TIMEOUT,
    temperature: float = 0.3,
) -> dict[str, Any]:
    """调 OpenAI 兼容端点的 ``POST {base_url}/chat/completions``。

    Returns:
        端点返回的完整 JSON dict（含 ``choices``）。

    Raises:
        LLMClientError: 任何失败；code 是 HTTP 状态码或符号错误名。
    """
    url = base_url.rstrip("/") + "/chat/completions"
    payload = json.dumps(
        {"model": model, "messages": messages, "temperature": temperature},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = _read_error_body(e)
        if e.code == 429 or e.code >= 500:
            raise LLMRetryableError(e.code, detail) from e
        raise LLMClientError(e.code, detail) from e
    except urllib.error.URLError as e:
        reason = e.reason
        if isinstance(reason, TimeoutError):
            raise LLMRetryableError("timeout", f"请求超时（{timeout}s）") from e
        raise LLMRetryableError("network", f"网络错误: {reason}") from e
    except TimeoutError as e:
        raise LLMRetryableError("timeout", f"请求超时（{timeout}s）") from e
    except (
        http.client.IncompleteRead,
        http.client.RemoteDisconnected,
        ConnectionResetError,
        BrokenPipeError,
    ) as e:
        # 响应读一半被掐断 / 连接被对端重置：免费模型端点排队断流的高发现象。
        # 归类为可重试（新连接重发通常能成），而不是让裸异常穿透到 GUI。
        raise LLMRetryableError(
            "network", f"连接中断: {type(e).__name__}: {e}"
        ) from e

    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        raise LLMClientError("bad_json", f"端点返回非 JSON: {e}") from e
    if not isinstance(data, dict) or not data.get("choices"):
        raise LLMClientError(
            "empty_choices", f"端点返回没有 choices: {str(data)[:200]}"
        )
    return data


def chat_completion_with_retry(
    messages: list[dict[str, Any]],
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout: float = DEFAULT_TIMEOUT,
    temperature: float = 0.3,
) -> dict[str, Any]:
    """带指数退避的 ``chat_completion``。

    退避参数**每次调用时**读 ``BOSS_RETRY_*`` env（而非 import time），
    让 CI / 测试能动态拨小退避（retry.py 的模块级默认值是 import 时读的，
    测试进程里可能已被别的用例先 import 固化）。
    """
    retry = retry_with_backoff(
        base_delay=float(os.getenv("BOSS_RETRY_BASE_DELAY", "2.0")),
        max_delay=float(os.getenv("BOSS_RETRY_MAX_DELAY", "30.0")),
        exceptions=(LLMRetryableError,),
    )
    return retry(chat_completion)(
        messages,
        base_url=base_url,
        api_key=api_key,
        model=model,
        timeout=timeout,
        temperature=temperature,
    )


def extract_content(data: dict[str, Any]) -> str:
    """从 chat/completions 返回里取 choices[0].message.content。"""
    choices = data.get("choices") or []
    if not choices:
        raise LLMClientError("empty_choices", "返回没有 choices")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise LLMClientError("empty_content", "返回的 message.content 为空")
    return content


def _read_error_body(e: urllib.error.HTTPError) -> str:
    """尽力读出 HTTP 错误响应体（服务商通常把原因写在里面）。"""
    try:
        return e.read().decode("utf-8", errors="replace")[:500]
    except Exception:  # noqa: BLE001 — 读错误体失败不影响抛错
        return str(e.reason)
