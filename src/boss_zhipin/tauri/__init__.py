"""PyTauri 桌面 App 入口。

**两种运行模式**，靠 ``BOSS_TAURI_STANDALONE`` env var 区分：

1. **Wheel dev 模式**（默认）：``uv sync && uv run python -m boss_zhipin.tauri``。
   tauri 组在 ``[tool.uv].default-groups`` 里，``uv sync`` 默认就装上；CLI-only
   用户可以 ``uv sync --no-group tauri`` 跳过。Python 进程是主进程，
   ``pytauri-wheel`` 提供 Tauri Rust binary。Tauri.toml / capabilities /
   frontend 从本包 source 目录读。

2. **Standalone 模式**（Phase D 打包后的 .app）：Rust binary 是主进程，
   embed Python interpreter，启动时 set ``BOSS_TAURI_STANDALONE=1``，再
   ``PythonScript::Module("boss_zhipin.tauri")`` 进入 ``__main__.py`` → 这里的
   ``main()``。Tauri.toml / capabilities / frontend 已经在编译期通过
   ``tauri::generate_context!()`` 嵌进 Rust binary，Python 不再读。

跟 CLI（``boss_zhipin.cli``）平行存在；CLI 模式完全不动。

业务代码（``website_oper`` / ``audit``）**完全不知道有 Tauri 这层**：
- 进度事件通过 ``gui.events.set_emit_callback`` 注入到 PyTauri Channel
- 日志通过 ``gui.log_bridge.install`` 注入到 PyTauri Channel
- 主循环还是 ``website_oper.write_response.send_job_descriptions_to_chat``

**关键约束**（见 project memory）：
- `start_blocking_portal("asyncio")` —— 不能默认 trio/uvloop，否则 nodriver
  重启 Chrome 会 timeout。
- ``capabilities/default.toml``（wheel）/ ``capabilities/default.json``
  （standalone）必须 grant ``pytauri:default``，否则前端 ``pyInvoke`` 被 ACL 拦。
"""

from os import environ
from pathlib import Path

# pytauri 多 example 共存时用，单 example 不需要——保留以匹配官方模板。
environ.setdefault("_PYTAURI_DIST", "pytauri-wheel")

import logging
from typing import Any, Optional

from anyio.from_thread import start_blocking_portal
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from pytauri import Commands
from pytauri.ipc import JavaScriptChannelId
from pytauri.webview import WebviewWindow

from boss_zhipin.gui import log_bridge, runner
from boss_zhipin.gui.events import ProgressEvent

SRC_TAURI_DIR = Path(__file__).parent.absolute()
BOSS_DEV = environ.get("BOSS_TAURI_DEV") == "1"
BOSS_STANDALONE = environ.get("BOSS_TAURI_STANDALONE") == "1"

log = logging.getLogger(__name__)

commands = Commands()


class _CamelModel(BaseModel):
    """前端 TS 用 camelCase，Python 用 snake_case。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RunConfig(_CamelModel):
    """``start_run`` 的参数。

    字段对齐 ``boss_zhipin.cli`` 走 CLI 时收集的东西。空字符串 / None 走跟
    CLI 一样的默认（比如 label 空时用 BOSS 默认推荐 feed）。
    """

    usr_name: str
    label: str = ""
    dry_run: bool = False
    profile: str = ""
    use_current_page: bool = False


class StartRunBody(_CamelModel):
    config: RunConfig
    progress_channel: JavaScriptChannelId[ProgressEvent]
    log_channel: JavaScriptChannelId[str]


def _build_main_loop_factory(config: RunConfig):
    """把 RunConfig + env var 折叠成一个无参的 coroutine 工厂。

    工厂调用时（runner.start_run 内部）才真正 import 业务代码并进入浏览器自动化。
    这一切都在主 portal loop 里跑，nodriver 要求的"同一 loop"约束满足。
    """

    async def factory():
        # 延迟 import，让没装 ``tauri`` 可选依赖时 import boss_zhipin.tauri 不立即炸。
        from boss_zhipin.cli import apply_profile_to_env, run_automation
        from boss_zhipin.config.profiles import load_profile

        # 同步到 env，业务代码深处读 env 的地方也能感知。
        # DRY_RUN 必须**显式清掉**：os.environ 是进程级、跨 run 复用的。只设不清
        # 的话，用户先勾 Dry-run 测一次留下 DRY_RUN=1，之后取消勾选真跑时，任何
        # call-time 读 os.getenv("DRY_RUN") 的地方仍判为 dry-run → 招呼语只生成不
        # 发送，且要重启 App 才好（非技术用户极难自查）。每次按当前勾选状态归位。
        if config.dry_run:
            environ["DRY_RUN"] = "1"
        else:
            environ.pop("DRY_RUN", None)
        environ["BOSS_GUI_REVIEW"] = "1"
        environ["BOSS_USR_NAME"] = config.usr_name
        if config.label:
            environ["BOSS_LABEL"] = config.label
        if config.profile:
            loaded_profile = load_profile(config.profile)
            apply_profile_to_env(
                loaded_profile.data,
                base_dir=loaded_profile.path.parent.parent,
                profile_name=loaded_profile.name,
            )
            # GUI 表单里的搜索词优先，便于用户临时调整后直接运行。
            if config.label:
                environ["BOSS_LABEL"] = config.label

        # 主循环全部走 cli.run_automation——CLI 和 GUI 共用一份逻辑。
        await run_automation(
            usr_name=config.usr_name,
            label=config.label or environ.get("BOSS_LABEL", ""),
            dry_run=config.dry_run,
            use_current_page=config.use_current_page,
        )

    return factory


@commands.command()
async def start_run(
    body: StartRunBody, webview_window: WebviewWindow
) -> dict[str, str]:
    """前端 ``pyInvoke('start_run', { config, progressChannel, logChannel })`` 调。

    立刻返回 ``{status: "started"}``；进度通过 progress channel 推，日志通过
    log channel 推，前端订阅那两个 channel 自己消费。

    报错：
    - already running → ``RuntimeError`` 由 PyTauri 自动序列化成前端 ``catch`` 能拿到的字符串
    - 没填用户名 → ``ValueError``
    """
    from boss_zhipin.gui.i18n import msg

    if runner.is_running():
        raise RuntimeError(msg("err.already_running"))

    # 名字非空前置校验：usr_name 会作为招呼语署名直接传给业务代码。
    if not body.config.usr_name.strip():
        raise ValueError(msg("err.need_name"))

    progress_channel = body.progress_channel.channel_on(webview_window.as_ref_webview())
    log_channel = body.log_channel.channel_on(webview_window.as_ref_webview())

    # 进度事件 → Channel
    def on_event(ev: ProgressEvent) -> None:
        from boss_zhipin.gui import run_state

        run_state.record(ev)
        try:
            progress_channel.send_model(ev)
        except Exception:
            pass

    # logging → Channel
    log_handler = log_bridge.install(lambda msg: _safe_send(log_channel, msg))

    factory = _build_main_loop_factory(body.config)

    # 包一层：run 结束后卸 log handler
    async def factory_with_cleanup():
        try:
            await factory()
        finally:
            log_bridge.uninstall(log_handler)

    runner.start_run(factory_with_cleanup, on_event=on_event)
    return {"status": "started"}


def _safe_send(channel, msg: str) -> None:
    try:
        channel.send(msg)
    except Exception:
        pass


@commands.command()
async def stop_run() -> dict[str, str]:
    """前端 stop 按钮调。idempotent——没在跑也不报错。"""
    stopped = await runner.stop_run(timeout=30.0)
    return {"status": "stopped" if stopped else "idle"}


@commands.command()
async def shutdown_browser() -> dict[str, str]:
    """关 Chrome——给"完全重置"按钮用。stop_run 之后再调这个才能从头来。"""
    from boss_zhipin.website_oper import finding_jobs

    await finding_jobs.shutdown()
    return {"status": "ok"}


class _OpenManualBrowserBody(_CamelModel):
    url: str = ""


@commands.command()
async def open_manual_browser(body: _OpenManualBrowserBody) -> dict:
    """只打开受控 Chrome，供用户在 BOSS 网页端手动筛选后再运行。"""
    from boss_zhipin.website_oper import finding_jobs

    if runner.is_running():
        raise RuntimeError("任务运行中，不能重新打开手动筛选页")

    return await finding_jobs.prepare_manual_boss_page(body.url)


# ---------- GUI v0.2 profile / greeting ----------


class _ProfileNameBody(_CamelModel):
    name: str


class _SaveProfileBody(_CamelModel):
    name: str
    data: dict


class _GreetingPathBody(_CamelModel):
    path: str = ""


class _SaveGreetingBody(_CamelModel):
    text: str
    path: str = ""


class _ReviewDecisionBody(_CamelModel):
    decision: str


@commands.command()
async def list_profiles() -> dict[str, list[dict[str, str]]]:
    """列出 ``profiles/*.yml``，供 GUI 下拉选择。"""
    from boss_zhipin.gui.profile_io import list_profiles as _list_profiles

    return {"profiles": _list_profiles()}


@commands.command()
async def get_profile(body: _ProfileNameBody) -> dict:
    """读取合并后的 profile，用于 GUI 表单回填。"""
    from boss_zhipin.gui.profile_io import get_profile as _get_profile

    return _get_profile(body.name)


@commands.command()
async def save_profile(body: _SaveProfileBody) -> dict[str, str]:
    """保存 GUI 表单生成的 profile YAML。"""
    from boss_zhipin.gui.profile_io import save_profile as _save_profile

    return _save_profile(body.name, body.data)


@commands.command()
async def get_greeting(body: _GreetingPathBody | None = None) -> dict[str, str]:
    """读取固定招呼语文件。"""
    from boss_zhipin.gui.profile_io import get_greeting as _get_greeting

    path = body.path if body and body.path else None
    return _get_greeting(path=path) if path else _get_greeting()


@commands.command()
async def save_greeting(body: _SaveGreetingBody) -> dict[str, str]:
    """保存固定招呼语文件。"""
    from boss_zhipin.gui.profile_io import save_greeting as _save_greeting

    return (
        _save_greeting(body.text, path=body.path)
        if body.path
        else _save_greeting(body.text)
    )


@commands.command()
async def submit_review_decision(body: _ReviewDecisionBody) -> dict[str, str]:
    """提交 GUI 审核按钮结果。"""
    from boss_zhipin.gui import review_control

    if body.decision not in ("send", "skip", "quit"):
        raise ValueError("审核决策只能是 send、skip 或 quit")
    return review_control.decide(body.decision)


@commands.command()
async def get_run_state() -> dict:
    """返回当前运行面板需要的基础状态。

    详细岗位信息仍通过 ProgressEvent 实时推送；这里提供刷新后的兜底状态。
    """
    from boss_zhipin.gui import review_control
    from boss_zhipin.gui import run_state

    return run_state.get_state(
        running=runner.is_running(),
        review=review_control.get_state(),
    )


@commands.command()
async def get_browser_page_state() -> dict:
    """返回当前受控 BOSS 页面状态，供 GUI 判断能否复用当前页面。"""
    from boss_zhipin.website_oper import finding_jobs

    return finding_jobs.get_browser_page_state()

# ---------- 智能助手（agent 里程碑 1：对话式入口） ----------
# 设计要点见 boss_zhipin.agent.profile_generator 的模块 docstring：
# agent 只产出「表单可回填的 profile」，永不直接触发投递（隔离由
# tests/test_agent_isolation.py 固化）。入参走 _CamelModel（camelCase），
# 返回值保持 snake_case 原样透传——前端 hydrateFromProfile 读的就是
# snake_case 键，套别名转换会把回填全弄坏。


class _AgentChatBody(_CamelModel):
    message: str
    history: list[dict[str, Any]] = []
    current_form: dict[str, Any] = {}


class _SaveLLMConfigBody(_CamelModel):
    base_url: str = ""
    api_key: str = ""
    model: str = ""


@commands.command()
async def agent_chat(body: _AgentChatBody) -> dict:
    """智能助手一轮对话：LLM 把自然语言翻译成 profile（结构化错误走返回值）。"""
    from boss_zhipin.agent import profile_generator

    if not body.message.strip():
        raise ValueError("消息不能为空")
    return await profile_generator.generate(
        body.message, history=body.history, current_form=body.current_form
    )


@commands.command()
async def get_llm_config() -> dict:
    """读 LLM 端点配置（api_key 脱敏）+ 免费模型预置列表。"""
    from boss_zhipin.agent.config_io import mask_key, read_config
    from boss_zhipin.agent.presets import LLM_PRESETS

    config = read_config()
    return {
        "base_url": config.base_url,
        "api_key": mask_key(config.api_key),
        "model": config.model,
        "configured": config.is_configured(),
        "presets": LLM_PRESETS,
    }


@commands.command()
async def save_llm_config(body: _SaveLLMConfigBody) -> dict:
    """保存 LLM 端点配置。api_key 提交空串/掩码 = 保留旧值。"""
    from boss_zhipin.agent.config_io import (
        AgentConfig,
        mask_key,
        merge_saved_key,
        read_config,
        write_config,
    )

    existing = read_config()
    config = AgentConfig(
        base_url=body.base_url.strip(),
        api_key=merge_saved_key(body.api_key, existing.api_key),
        model=body.model.strip(),
    )
    write_config(config)
    return {
        "status": "saved",
        "api_key": mask_key(config.api_key),
        "configured": config.is_configured(),
    }


# ---------- 简历管理（F1：resume/ 目录 + 默认简历） ----------


class _SetDefaultResumeBody(_CamelModel):
    name: str = ""


@commands.command()
async def list_resumes() -> dict:
    """列出 resume/ 目录里的简历文件（pdf/doc/docx/png/jpg）。"""
    from boss_zhipin.gui.resume_io import list_resumes as _list_resumes

    return {"resumes": _list_resumes()}


@commands.command()
async def set_default_resume(body: _SetDefaultResumeBody) -> dict:
    """把某个简历设为默认（写 resume/default.txt 标记），传空则取消默认。"""
    from boss_zhipin.gui.resume_io import (
        set_default_resume as _set_default,
        unset_default_resume as _unset_default,
    )

    if not body.name or body.name.strip() in ("", "__none__"):
        return _unset_default()
    return _set_default(body.name)


class _GetResumeContentBody(_CamelModel):
    name: str


@commands.command()
async def get_resume_content(body: _GetResumeContentBody) -> dict:
    """读取指定简历文件内容（返回 base64 及提取文本供前端即时预览）。"""
    from boss_zhipin.gui.resume_io import get_resume_content as _get_content

    return _get_content(body.name)


class _SaveResumeFileBody(_CamelModel):
    name: str
    content_b64: str


@commands.command()
async def save_resume_file(body: _SaveResumeFileBody) -> dict:
    """保存/上传简历文件到 resume/ 目录。"""
    from boss_zhipin.gui.resume_io import save_resume_file as _save_file

    return _save_file(body.name, body.content_b64)


class _DeleteResumeFileBody(_CamelModel):
    name: str


@commands.command()
async def delete_resume_file(body: _DeleteResumeFileBody) -> dict:
    """删除指定的简历文件。"""
    from boss_zhipin.gui.resume_io import delete_resume_file as _delete_file

    return _delete_file(body.name)


class _OpenResumeNativeBody(_CamelModel):
    name: str


@commands.command()
async def open_resume_native(body: _OpenResumeNativeBody) -> dict:
    """使用系统原生应用直接打开简历源文件（如 WPS、Word、PDF 查阅器等）。"""
    from boss_zhipin.gui.resume_io import open_resume_native as _open_native

    return _open_native(body.name)


class _DiagnoseResumeBody(_CamelModel):
    resume_text: str
    target_role: str = ""
    active_skills: list[str] | None = None
    user_prompt: str = ""


@commands.command()
async def diagnose_resume(body: _DiagnoseResumeBody) -> dict:
    """Agent 2：针对简历文本进行启发式算法评分与 LLM 深度精修建议。"""
    from boss_zhipin.agent import resume_polisher

    return await resume_polisher.diagnose_and_polish(
        resume_text=body.resume_text,
        target_role=body.target_role,
        active_skills=body.active_skills,
        user_prompt=body.user_prompt,
    )


class _CalculateATSScoreBody(_CamelModel):
    resume_text: str


@commands.command()
async def calculate_ats_score(body: _CalculateATSScoreBody) -> dict:
    """纯本地快速计算 ATS 启发式算法评分指标。"""
    from boss_zhipin.algorithms.ats_scorer import ATSScorer

    res = ATSScorer.score(body.resume_text)
    return res.to_dict()



# ---------- 工具执行层（F4：agent 声明意图，这里执行） ----------
# 隔离红线：agent 包只产出 action 意图；真正动手（读日志/读页面）在这里，
# 保证「LLM 永不直接触发投递」——prepare_run 也不在此执行，只由前端渲染
# 确认按钮走现有 start_run。


class _AgentExecuteActionBody(_CamelModel):
    type: str
    params: dict[str, Any] = {}


@commands.command()
async def agent_execute_action(body: _AgentExecuteActionBody) -> dict:
    """执行智能助手声明的工具（白名单：get_stats / preview_jobs）。"""
    if body.type == "get_stats":
        from boss_zhipin.gui.stats_io import format_stats, query_stats

        stats = query_stats()
        return {
            "status": "ok",
            "type": "get_stats",
            "text": format_stats(stats),
            "data": stats,
        }
    if body.type == "preview_jobs":
        from boss_zhipin.gui.preview import preview_jobs

        n = body.params.get("n", 5)
        try:
            count = int(n)
        except (TypeError, ValueError):
            count = 5
        return await preview_jobs(count)
    raise ValueError(f"未知或不支持自动执行的动作: {body.type}")


# ---------- F3：BOSS 新回复检测（提醒档） ----------


@commands.command()
async def check_boss_replies() -> dict:
    """读当前页面导航的未读消息数（前端 60s 轮询，仅空闲时）。"""
    from boss_zhipin.website_oper import message_check

    return await message_check.check_new_replies()


# ---------- 平台适配器层（多平台选择与扫码登录） ----------


class _PlatformLoginBody(_CamelModel):
    platform_id: str


@commands.command()
async def list_platforms() -> dict[str, Any]:
    """返回所有平台元数据及其登录态（BOSS、猎聘、51job、智联）。"""
    from boss_zhipin.platforms import get_platform_manager

    return {"platforms": get_platform_manager().list_platforms()}


@commands.command()
async def open_platform_login(body: _PlatformLoginBody) -> dict[str, Any]:
    """打开指定平台的扫码登录页面。"""
    from boss_zhipin.platforms import get_platform_manager

    return await get_platform_manager().open_login(body.platform_id)


@commands.command()
async def window_minimize(webview_window: WebviewWindow) -> dict[str, str]:
    """最小化主窗口。"""
    webview_window.minimize()
    return {"status": "ok"}


@commands.command()
async def window_toggle_maximize(webview_window: WebviewWindow) -> dict[str, str]:
    """最大化或还原主窗口。"""
    if webview_window.is_maximized():
        webview_window.unmaximize()
    else:
        webview_window.maximize()
    return {"status": "ok"}


@commands.command()
async def window_close(webview_window: WebviewWindow) -> dict[str, str]:
    """关闭主窗口。"""
    webview_window.close()
    return {"status": "ok"}


def main() -> int:
    """启动 PyTauri app——根据 BOSS_TAURI_STANDALONE 自动切换 wheel / standalone。"""
    if BOSS_STANDALONE:
        # .app 双击启动时 CWD 是 ``/``，所有相对默认路径（logs/
        # chrome_profile/ .env）都会落错地方。入口处统一 chdir 到
        # 平台应用数据目录，business 代码不用感知。必须在任何业务 import
        # 之前做。
        from boss_zhipin.paths import ensure_app_data_cwd

        data_dir = ensure_app_data_cwd()

    logging.basicConfig(
        level=environ.get("LOGLEVEL", "INFO"),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if BOSS_STANDALONE:
        log.info("standalone 模式：数据目录 %s", data_dir)
        # Standalone：Rust binary 已经 register 了 ext_mod，pytauri.builder_factory
        # / pytauri.context_factory 直接可用；Tauri.toml 已经被 generate_context!
        # 宏 inline 进 Rust binary，不需要再从 source 目录读，context_factory 无参。
        from pytauri import builder_factory, context_factory

        ctx = context_factory()
    else:
        # Wheel dev 模式：pytauri-wheel 内部维护自己的 Rust binary，需要把
        # Tauri.toml 所在目录传给 context_factory 让它在运行时读。
        from pytauri_wheel.lib import builder_factory, context_factory

        tauri_config: Optional[dict] = (
            {"build": {"frontendDist": "http://localhost:1420"}} if BOSS_DEV else None
        )
        ctx = context_factory(SRC_TAURI_DIR, tauri_config=tauri_config)

    with start_blocking_portal("asyncio") as portal:
        app = builder_factory().build(
            context=ctx,
            invoke_handler=commands.generate_handler(portal),
        )
        return app.run_return()
