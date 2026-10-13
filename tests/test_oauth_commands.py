"""GitHub OAuth 一键登录与点星检测的单测（2026-10-14）。

覆盖：PKCE 生成格式、status 降级、点星 204/404/401 判定、
登录未配置的错误路径。不发起真实网络请求。
"""
from __future__ import annotations

import base64
import hashlib

import pytest

from boss_zhipin.tauri.commands import oauth as oauth_mod


def test_pkce_pair_format():
    verifier, challenge = oauth_mod._pkce_pair()
    # RFC 7636：verifier 43~128 字符、仅 unreserved 字符
    assert 43 <= len(verifier) <= 128
    assert all(c.isalnum() or c in "-._~" for c in verifier)
    # challenge = BASE64URL(SHA256(verifier)) 去掉填充
    expect = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    assert challenge == expect


@pytest.mark.anyio
async def test_oauth_status_disabled_by_default(monkeypatch):
    monkeypatch.setattr(oauth_mod, "GITHUB_OAUTH_CLIENT_ID", "")
    res = await oauth_mod.github_oauth_status()
    assert res["status"] == "ok"
    assert res["enabled"] is False
    assert res["repoUrl"].startswith("https://github.com/")


def test_oauth_login_not_configured(monkeypatch):
    monkeypatch.setattr(oauth_mod, "GITHUB_OAUTH_CLIENT_ID", "")
    res = oauth_mod._oauth_login_blocking()
    assert res["status"] == "error"
    assert "未配置" in res["message"]


def test_check_starred_204(monkeypatch):
    monkeypatch.setattr(oauth_mod, "_github_api_json", lambda url, token=None: (204, None))
    res = oauth_mod._check_starred_blocking("tok")
    assert res == {"status": "ok", "starred": True}


def test_check_starred_404(monkeypatch):
    monkeypatch.setattr(oauth_mod, "_github_api_json", lambda url, token=None: (404, None))
    res = oauth_mod._check_starred_blocking("tok")
    assert res == {"status": "ok", "starred": False}


def test_check_starred_401(monkeypatch):
    monkeypatch.setattr(oauth_mod, "_github_api_json", lambda url, token=None: (401, None))
    res = oauth_mod._check_starred_blocking("tok")
    assert res["status"] == "error"
    assert "过期" in res["message"]


def test_check_starred_network_error(monkeypatch):
    monkeypatch.setattr(oauth_mod, "_github_api_json", lambda url, token=None: (0, None))
    res = oauth_mod._check_starred_blocking("tok")
    assert res["status"] == "error"


@pytest.mark.anyio
async def test_check_starred_command_requires_token():
    body = oauth_mod._CheckStarredBody(token="  ")
    # 空 token 直接报错，不触网
    res = await oauth_mod.github_check_starred(body)
    assert res["status"] == "error"
    assert "令牌" in res["message"]


def test_starred_url_targets_author_repo(monkeypatch):
    seen = {}

    def fake_api(url, token=None):
        seen["url"] = url
        return (204, None)

    monkeypatch.setattr(oauth_mod, "_github_api_json", fake_api)
    oauth_mod._check_starred_blocking("tok")
    assert (
        seen["url"]
        == f"https://api.github.com/user/starred/{oauth_mod.GITHUB_REPO_OWNER}/{oauth_mod.GITHUB_REPO_NAME}"
    )
