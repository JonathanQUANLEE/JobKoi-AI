"""运行控制域：启动/停止巡航、浏览器会话、审核决策、运行状态。"""
from __future__ import annotations

import logging
from os import environ

from pytauri.ipc import JavaScriptChannelId
from pytauri.webview import WebviewWindow

from boss_zhipin.gui import log_bridge, runner
from boss_zhipin.gui.events import ProgressEvent
from boss_zhipin.tauri.commands._base import _CamelModel
from boss_zhipin.tauri.commands._registry import commands

log = logging.getLogger(__name__)


class RunConfig(_CamelModel):
    """``start_run`` 的参数（2026-10-11 用户拍板：产品删除 Dry-run 演练概念）。

    GUI 永远真实投递（点击立即沟通；不发消息、不发简历——那两个由
    BOSS_CLICK_ONLY / BOSS_SEND_RESUME_AFTER_GREETING 开关管，默认关）。
    DRY_RUN 仅保留给开发者 CLI 调试，GUI 启动前强制清掉。
    """

    usr_name: str
    label: str = ""
    profile: str = ""
    use_current_page: bool = False
    # 本轮要跑的招聘平台 id 列表（默认只跑 BOSS；勾选多个则并发巡航）
    platforms: list[str] = ["boss"]


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

        # GUI 永远真实投递（产品已删除 Dry-run 演练概念）。DRY_RUN 仅限开发者
        # CLI 调试用——启动前强制清掉，防止开发者手动设的 DRY_RUN=1 把用户
        # 巡航悄悄变成"不真实点击"的演练。
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
        platforms = [str(p) for p in (config.platforms or []) if str(p)]
        if "boss" not in platforms:
            platforms.insert(0, "boss")

        if len(platforms) == 1:
            await run_automation(
                usr_name=config.usr_name,
                label=config.label or environ.get("BOSS_LABEL", ""),
                dry_run=False,
                use_current_page=config.use_current_page,
            )
            return

        # 多平台巡航：BOSS + 猎聘 + 51job 在同一个事件循环里并发跑。
        # 三平台各自独立的浏览器 profile / 去重账本 / 限额，互不干扰；
        # 任一平台异常不影响其他平台，统一收敛到日志。
        import asyncio as _asyncio

        boss_coro = run_automation(
            usr_name=config.usr_name,
            label=config.label or environ.get("BOSS_LABEL", ""),
            dry_run=False,
            use_current_page=config.use_current_page,
        )

        async def _wrap_platform(name: str, coro) -> None:
            try:
                await coro
            except Exception as e:  # noqa: BLE001 — 单平台失败不拖垮其他链路
                log.warning("[multi-platform] %s 链异常终止: %s", name, e)

        tasks = [_asyncio.create_task(_wrap_platform("boss", boss_coro))]

        if "liepin" in platforms:
            from liepin import apply as liepin_apply
            from liepin import driver as liepin_driver

            liepin_limit = int(environ.get("LIEPIN_DAILY_LIMIT", "100"))
            liepin_coro = liepin_apply.run(
                list(liepin_apply.DEFAULT_KEYWORDS),
                liepin_limit,
                liepin_driver._greeting_text(),
            )
            tasks.append(_asyncio.create_task(_wrap_platform("liepin", liepin_coro)))

        if "job51" in platforms:
            from job51 import apply as job51_apply

            job51_limit = int(environ.get("JOB51_DAILY_LIMIT", "40"))
            tasks.append(
                _asyncio.create_task(
                    _wrap_platform(
                        "job51", job51_apply.run(list(job51_apply.DEFAULT_KEYWORDS), job51_limit)
                    )
                )
            )

        for task in tasks:
            await task

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


class _ReviewDecisionBody(_CamelModel):
    decision: str


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
