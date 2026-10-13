"""GitHub OAuth 一键登录与点星检测域。

2026-10-14 需求（用户语音反馈）：用户在浏览器里已登录 GitHub，但软件
"识别不到"，导致进不去——因为旧的登录方式（输入用户名查 API）与浏览器
登录态毫无关系。本模块实现标准 **Authorization Code + PKCE** 流程
（桌面应用官方推荐，无需 client_secret）：

1. ``github_oauth_status``：查询 OAuth 是否已配置（client_id 非空）；
2. ``github_oauth_login``：本地起一次性回调服务(127.0.0.1:17891) →
   唤起系统默认浏览器打开 GitHub 授权页（用户在浏览器登录/授权，浏览器
   已登录则直接点授权）→ 回调拿 code → PKCE verifier 换 access_token →
   拉取 /user 公开信息返回。整个过程软件"自动识别"，彻底解决痛点；
3. ``github_check_starred``：用 OAuth token 查
   ``GET /user/starred/{owner}/{repo}``（204=已点星/404=未点星）——
   把"点星门禁"从自觉申报升级为真实闭环验证。

注意：阻塞式 HTTP 服务/请求全部包在 ``asyncio.to_thread`` 里，绝不卡
pytauri 事件循环（巡航状态轮询等 IPC 不受影响）。
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import secrets
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands

# ── 配置区 ──────────────────────────────────────────────────────────────
# 作者注册 GitHub OAuth App 后把 client_id 填到这里（公开值，可安全打包）。
# 注册步骤（一次性，约 3 分钟）：
#   1. 打开 https://github.com/settings/developers → New OAuth App
#   2. Application name 随意（如 JobKoi-AI Desktop）；
#      Homepage URL 填 https://github.com/JonathanQUANLEE/JobKoi-AI
#      Authorization callback URL 必须精确填：http://127.0.0.1:17891/callback
#   3. 创建后复制 Client ID 填到下面即可（Client Secret 留空不用，PKCE 无需）
# 未配置（空串）时前端自动隐藏"一键登录"按钮，回退旧登录方式，零破坏。
GITHUB_OAUTH_CLIENT_ID = ""

GITHUB_REPO_OWNER = "JonathanQUANLEE"
GITHUB_REPO_NAME = "JobKoi-AI"
REDIRECT_PORT = 17891
_CALLBACK_TIMEOUT_SEC = 300  # 用户最多有 5 分钟在浏览器里完成登录/授权


class _CheckStarredBody(_CamelModel):
    token: str


def _pkce_pair() -> tuple[str, str]:
    """生成 PKCE code_verifier / S256 code_challenge（RFC 7636）。"""
    verifier = secrets.token_urlsafe(48)  # 64 字符，落在 43~128 要求区间
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def _github_api_json(url: str, token: str | None = None) -> tuple[int, dict | None]:
    """请求 GitHub API/端点，返回 (status_code, json_dict|None)。"""
    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "JobKoi-AI-Desktop")
    if token:
        req.add_header("Authorization", f"token {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            data = json.loads(body) if body else None
            return resp.status, data
    except urllib.error.HTTPError as e:
        return e.code, None
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, None


def _check_starred_blocking(token: str) -> dict[str, object]:
    status, _ = _github_api_json(
        f"https://api.github.com/user/starred/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}",
        token=token,
    )
    if status == 204:
        return {"status": "ok", "starred": True}
    if status == 404:
        return {"status": "ok", "starred": False}
    if status == 401:
        return {"status": "error", "message": "授权已过期，请重新登录 GitHub"}
    return {"status": "error", "message": f"GitHub 访问异常 (code={status})，请稍后重试"}


def _oauth_login_blocking() -> dict[str, object]:
    """阻塞式完整 OAuth 流程（在线程池里跑，勿在事件循环直接调用）。"""
    import webbrowser

    if not GITHUB_OAUTH_CLIENT_ID:
        return {"status": "error", "message": "OAuth 未配置：请联系作者填写 client_id"}

    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(16)
    result: dict[str, object] = {}
    got_callback = threading.Event()

    class _CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 (http.server 约定)
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return
            qs = urllib.parse.parse_qs(parsed.query)
            # GitHub 授权失败/用户拒绝会带 error 参数
            if qs.get("error"):
                result["error"] = "您在浏览器中取消了授权，请重试或改用其他登录方式"
            elif qs.get("state", [""])[0] != state:
                result["error"] = "授权状态校验失败（可能被篡改），请重试"
            elif qs.get("code", [""])[0]:
                result["code"] = qs["code"][0]
            else:
                result["error"] = "GitHub 未返回授权码，请重试"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                "<html><body style='background:#0d1117;color:#fff;font-family:sans-serif;"
                "text-align:center;padding-top:18vh'><h2>✅ 授权成功</h2>"
                "<p>请回到 JobKoi-AI 软件窗口，将继续自动登录。</p></body></html>".encode("utf-8")
            )
            got_callback.set()

        def log_message(self, *args: object) -> None:  # 静音访问日志
            return

    try:
        server = HTTPServer(("127.0.0.1", REDIRECT_PORT), _CallbackHandler)
    except OSError:
        return {
            "status": "error",
            "message": f"本地回调端口 {REDIRECT_PORT} 被占用，请稍后重试",
        }
    server.timeout = 1.0  # serve 循环粒度

    try:
        params = {
            "client_id": GITHUB_OAUTH_CLIENT_ID,
            "redirect_uri": f"http://127.0.0.1:{REDIRECT_PORT}/callback",
            "scope": "read:user",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        auth_url = "https://github.com/login/oauth/authorize?" + urllib.parse.urlencode(params)
        webbrowser.open(auth_url)

        # 等待浏览器回调（超时则放弃，绝不永久阻塞）
        deadline = time.monotonic() + _CALLBACK_TIMEOUT_SEC
        while not got_callback.is_set() and time.monotonic() < deadline:
            server.handle_request()

        if not got_callback.is_set():
            return {
                "status": "error",
                "message": "等待浏览器授权超时（5 分钟），请重试或改用用户名登录",
            }
        if "error" in result:
            return {"status": "error", "message": str(result["error"])}

        # 用 code + PKCE verifier 换 access_token（无需 client_secret）
        token_req = urllib.request.Request(
            "https://github.com/login/oauth/access_token",
            data=urllib.parse.urlencode(
                {
                    "client_id": GITHUB_OAUTH_CLIENT_ID,
                    "code": result["code"],
                    "code_verifier": verifier,
                    "redirect_uri": f"http://127.0.0.1:{REDIRECT_PORT}/callback",
                }
            ).encode("ascii"),
            method="POST",
        )
        token_req.add_header("Accept", "application/json")
        token_req.add_header("User-Agent", "JobKoi-AI-Desktop")
        with urllib.request.urlopen(token_req, timeout=20) as resp:
            token_data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        access_token = token_data.get("access_token")
        if not access_token:
            return {
                "status": "error",
                "message": f"换取访问令牌失败：{token_data.get('error_description', '未知错误')}",
            }

        # 拉取用户公开信息
        status, data = _github_api_json("https://api.github.com/user", token=access_token)
        if status != 200 or not data or not data.get("login"):
            return {"status": "error", "message": "获取 GitHub 用户信息失败，请重试"}

        return {
            "status": "ok",
            "user": {
                "id": data.get("id", 0),
                "login": data["login"],
                "name": data.get("name") or data["login"],
                "avatarUrl": data.get("avatar_url") or "",
                "email": data.get("email"),
                "htmlUrl": data.get("html_url") or f"https://github.com/{data['login']}",
                "bio": data.get("bio"),
                "token": access_token,
                "loginAt": int(time.time() * 1000),
            },
        }
    except urllib.error.HTTPError as e:
        return {"status": "error", "message": f"GitHub 授权接口异常 (code={e.code})"}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {"status": "error", "message": f"网络异常：{e}（请检查网络后重试）"}
    finally:
        server.server_close()


@commands.command()
async def github_oauth_status() -> dict[str, object]:
    """查询 OAuth 一键登录是否可用（client_id 是否已配置）。"""
    return {
        "status": "ok",
        "enabled": bool(GITHUB_OAUTH_CLIENT_ID),
        "repoUrl": f"https://github.com/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}",
    }


@commands.command()
async def github_oauth_login() -> dict[str, object]:
    """浏览器一键 OAuth 登录（Authorization Code + PKCE）。"""
    return await asyncio.to_thread(_oauth_login_blocking)


@commands.command()
async def github_check_starred(body: _CheckStarredBody) -> dict[str, object]:
    """检测当前 GitHub token 是否已给作者的仓库点亮 Star（204/404 判定）。"""
    token = (body.token or "").strip()
    if not token:
        return {"status": "error", "message": "缺少访问令牌（请使用一键登录或 Token 登录）"}
    return await asyncio.to_thread(_check_starred_blocking, token)
