"""安全 JS 执行与 CDP 评估基础工具。"""
from __future__ import annotations

import asyncio
import json
import logging

log = logging.getLogger(__name__)


async def _safe_evaluate(js: str, timeout: float = 10) -> dict:
    """跑 ``tab.evaluate(js)``，期望 JS 自己 ``JSON.stringify`` 返回字符串。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return {}

    js_head = js.strip()[:80].replace("\n", " ")
    try:
        raw = await asyncio.wait_for(tab.evaluate(js), timeout=timeout)
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
    """``tab.xpath`` 的兜底封装。"""
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None:
        return []
    try:
        result = await asyncio.wait_for(
            tab.xpath(xp, timeout=timeout),
            timeout=timeout + 2,
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
