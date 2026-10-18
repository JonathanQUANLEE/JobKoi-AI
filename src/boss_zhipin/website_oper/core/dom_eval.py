"""安全 JS 执行与 CDP 评估基础工具。"""
from __future__ import annotations

import asyncio
import json
import logging

from boss_zhipin.website_oper.core.cdp_guard import cdp_call

log = logging.getLogger(__name__)


async def _safe_evaluate(js: str, timeout: float = 10) -> dict:
    """跑 ``tab.evaluate(js)``，期望 JS 自己 ``JSON.stringify`` 返回字符串。

    2026-10-18 事故加固（第二轮）：wait_for 版本在 nodriver 内部 finally
    链二次挂死时永不返回（见 cdp_guard docstring），改用 cdp_call 护栏。
    """
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return {}

    js_head = js.strip()[:80].replace("\n", " ")
    try:
        raw = await cdp_call(tab.evaluate(js), timeout=timeout, label=js_head)
    except asyncio.TimeoutError:
        log.warning("evaluate 超过 %ss 没返回（JS: %s...）", timeout, js_head)
        return {}
    except (ConnectionRefusedError, ConnectionResetError, BrokenPipeError) as e:
        log.info("Chrome 浏览器已关闭或连接断开（%s: %s），重置浏览器会话", type(e).__name__, e)
        await finding_jobs.shutdown()
        return {}
    except Exception as e:
        err_msg = str(e)
        if (
            "1225" in err_msg
            or "ConnectionRefused" in err_msg
            or "target closed" in err_msg.lower()
            or "connection closed" in err_msg.lower()
        ):
            log.info("Chrome 浏览器连接已断开（%s: %s），重置浏览器会话", type(e).__name__, e)
            await finding_jobs.shutdown()
            return {}
        log.warning("evaluate 抛 %s: %s（JS: %s...）", type(e).__name__, e, js_head)
        return {}
    if isinstance(raw, tuple):
        raw = raw[0]
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            log.warning("JS 返回不是合法 JSON：%s（前 200 字符：%r）", e, raw[:200])
            return {}
    if isinstance(raw, dict):
        return raw
    log.warning("evaluate 返回类型 %s（不是 str/dict）：%r", type(raw).__name__, repr(raw)[:200])
    return {}


async def _xpath_safe(xp: str, timeout: float = 3.0) -> list:
    """``tab.xpath`` 的兜底封装。

    2026-10-18 事故根因点（第二轮加固）：nodriver ``tab.xpath`` 在
    ``finally`` 里再做一次 ``send(dom.disable)``——外层 wait_for 超时
    cancel 后，任务在 finally 里对已挂死的 CDP 通道二次挂起（取消只注入
    一次），wait_for 等任务退出永不返回 → 整轮巡航死寂。cdp_call 的
    第二次 cancel 能打断 finally 链；仍退不出的场景放弃为僵尸，主流程
    继续由连续失败熔断接管（保号停机优先）。
    """
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return []
    try:
        result = await cdp_call(
            tab.xpath(xp, timeout=timeout),
            timeout=timeout + 2,
            label=xp,
        )
        return result or []
    except asyncio.TimeoutError:
        log.warning("xpath 超时: %s", xp[:80])
        return []
    except Exception as e:
        log.warning("xpath 出错: %s: %s", type(e).__name__, e)
        return []


async def _js_click_at_index(css_selector: str, index_1: int) -> dict:
    """在 JS 里点 ``css_selector`` 命中的第 N 个元素（1-indexed）。"""
    from boss_zhipin.website_oper import finding_jobs

    js = f"""
    JSON.stringify((() => {{
      try {{
        const els = document.querySelectorAll({json.dumps(css_selector)});
        if (els.length < {index_1}) return {{ok: false, total: els.length}};
        els[{index_1 - 1}].click();
        return {{ok: true, total: els.length}};
      }} catch (e) {{
        return {{ok: false, error: String(e), stack: e.stack || ''}};
      }}
    }})())
    """
    return await finding_jobs._safe_evaluate(js)


async def _js_wait_text(css_selector: str, min_len: int, timeout_s: float) -> str | None:
    """轮询直到 ``css_selector`` 命中且 ``text.length >= min_len``，返回 text；超时返回 None。"""
    from boss_zhipin.website_oper import finding_jobs

    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        js = f"""
        JSON.stringify((() => {{
          try {{
            const el = document.querySelector({json.dumps(css_selector)});
            if (!el) return {{ok: false, reason: 'not_found'}};
            const text = (el.innerText || '').trim();
            if (text.length < {min_len}) return {{ok: false, reason: 'too_short', len: text.length}};
            return {{ok: true, text: text}};
          }} catch (e) {{
            return {{ok: false, error: String(e)}};
          }}
        }})())
        """
        result = await finding_jobs._safe_evaluate(js, timeout=5)
        if result.get("ok"):
            return result["text"]
        await asyncio.sleep(0.5)
    return None
