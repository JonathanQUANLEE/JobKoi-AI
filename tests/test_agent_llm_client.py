"""llm_client 单测：mock urllib，不发真请求。"""
from __future__ import annotations

import io
import json
import urllib.error

import pytest

from boss_zhipin.agent import llm_client
from boss_zhipin.agent.llm_client import (
    LLMClientError,
    LLMRetryableError,
    chat_completion,
    chat_completion_with_retry,
    extract_content,
)


def _ok_body(content: str = "你好") -> str:
    return json.dumps(
        {"choices": [{"message": {"role": "assistant", "content": content}}]},
        ensure_ascii=False,
    )


class _FakeResponse:
    def __init__(self, body: str):
        self._body = body.encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _http_error(code: int, body: str = '{"error": "boom"}') -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url="https://example.test/chat/completions",
        code=code,
        msg="err",
        hdrs=None,
        fp=io.BytesIO(body.encode("utf-8")),
    )


def test_chat_completion_happy_path(monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        captured["auth"] = request.get_header("Authorization")
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return _FakeResponse(_ok_body("ok"))

    monkeypatch.setattr(llm_client.urllib.request, "urlopen", fake_urlopen)

    data = chat_completion(
        [{"role": "user", "content": "hi"}],
        base_url="https://example.test/v1",
        api_key="sk-test",
        model="m1",
    )

    assert extract_content(data) == "ok"
    assert captured["url"] == "https://example.test/v1/chat/completions"
    assert captured["auth"] == "Bearer sk-test"
    assert captured["body"]["model"] == "m1"
    assert captured["body"]["messages"][0]["content"] == "hi"


def test_chat_completion_401_not_retryable(monkeypatch):
    calls = {"n": 0}

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        raise _http_error(401)

    monkeypatch.setattr(llm_client.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv("BOSS_RETRY_BASE_DELAY", "0.01")
    monkeypatch.setenv("BOSS_RETRY_MAX_DELAY", "0.02")

    with pytest.raises(LLMClientError) as exc_info:
        chat_completion_with_retry(
            [{"role": "user", "content": "hi"}],
            base_url="https://example.test/v1",
            api_key="bad",
            model="m1",
        )
    # 401 属认证错：不重试，一次即抛
    assert calls["n"] == 1
    assert not isinstance(exc_info.value, LLMRetryableError)
    assert exc_info.value.code == 401


def test_chat_completion_500_retries_then_raises(monkeypatch):
    calls = {"n": 0}

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        raise _http_error(500)

    monkeypatch.setattr(llm_client.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv("BOSS_RETRY_BASE_DELAY", "0.01")
    monkeypatch.setenv("BOSS_RETRY_MAX_DELAY", "0.02")

    with pytest.raises(LLMRetryableError):
        chat_completion_with_retry(
            [{"role": "user", "content": "hi"}],
            base_url="https://example.test/v1",
            api_key="sk",
            model="m1",
        )
    # 默认 3 次尝试（BOSS_RETRY_MAX_ATTEMPTS 默认 3）
    assert calls["n"] == 3


def test_chat_completion_429_is_retryable(monkeypatch):
    def fake_urlopen(request, timeout=None):
        raise _http_error(429, '{"error": "rate limited"}')

    monkeypatch.setattr(llm_client.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(LLMRetryableError) as exc_info:
        chat_completion(
            [{"role": "user", "content": "hi"}],
            base_url="https://example.test/v1",
            api_key="sk",
            model="m1",
        )
    assert exc_info.value.code == 429


def test_chat_completion_bad_json(monkeypatch):
    monkeypatch.setattr(
        llm_client.urllib.request,
        "urlopen",
        lambda request, timeout=None: _FakeResponse("<html>gateway error</html>"),
    )
    with pytest.raises(LLMClientError) as exc_info:
        chat_completion(
            [{"role": "user", "content": "hi"}],
            base_url="https://example.test/v1",
            api_key="sk",
            model="m1",
        )
    assert exc_info.value.code == "bad_json"


def test_chat_completion_empty_choices(monkeypatch):
    monkeypatch.setattr(
        llm_client.urllib.request,
        "urlopen",
        lambda request, timeout=None: _FakeResponse('{"choices": []}'),
    )
    with pytest.raises(LLMClientError) as exc_info:
        chat_completion(
            [{"role": "user", "content": "hi"}],
            base_url="https://example.test/v1",
            api_key="sk",
            model="m1",
        )
    assert exc_info.value.code == "empty_choices"


def test_chat_completion_timeout_is_retryable(monkeypatch):
    calls = {"n": 0}

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        raise TimeoutError()

    monkeypatch.setattr(llm_client.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv("BOSS_RETRY_BASE_DELAY", "0.01")
    monkeypatch.setenv("BOSS_RETRY_MAX_DELAY", "0.02")

    with pytest.raises(LLMRetryableError) as exc_info:
        chat_completion_with_retry(
            [{"role": "user", "content": "hi"}],
            base_url="https://example.test/v1",
            api_key="sk",
            model="m1",
        )
    assert exc_info.value.code == "timeout"
    assert calls["n"] == 3


def test_chat_completion_network_error_is_retryable(monkeypatch):
    def fake_urlopen(request, timeout=None):
        raise urllib.error.URLError(ConnectionRefusedError("refused"))

    monkeypatch.setattr(llm_client.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(LLMRetryableError) as exc_info:
        chat_completion(
            [{"role": "user", "content": "hi"}],
            base_url="https://example.test/v1",
            api_key="sk",
            model="m1",
        )
    assert exc_info.value.code == "network"


def test_extract_content_rejects_empty():
    with pytest.raises(LLMClientError):
        extract_content({"choices": [{"message": {"content": "   "}}]})
