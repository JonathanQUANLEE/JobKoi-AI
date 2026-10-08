"""51job 添加项目经历：填 Mini Agent 项目并保存。

表单字段（页面内联，非弹窗）：
- input[placeholder="请填写"]  → 项目名称
- input[placeholder="请选择"]  → 项目时间开始
- input[placeholder="至今"]    → 项目时间结束
- input[placeholder="无"]      → 所属公司（选填）
- textarea.el-textarea__inner  → 项目描述
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import nodriver as uc
from nodriver import Config

from job51 import driver  # noqa: E402

PROFILE = str(ROOT / "job51_profile")
RESUME_CENTER = "https://www.51job.com/resume/center?lang=c"
OUT = ROOT / "logs" / "job51_add_project.txt"

PROJECT_NAME = "Mini Agent — 零框架从零实现的 LLM Agent Runtime"
PROJECT_DESC = (
    "独立从零实现可运行的 LLM Agent Runtime，不依赖 LangChain 等任何 Agent 框架。"
    "核心包括：Agent Loop 主循环（finish_reason 判断终止 + max_steps 保险丝防失控）、"
    "工具注册表分发、命令白名单双重校验（修复 && 链式注入穿透并配套回归测试）、"
    "指数退避重试与故障上报，沉淀 26 个可独立运行的渐进模块。"
    "实现 RAG 全链路（文档切片/Embedding/余弦检索/引用生成，Embedding API 失败自动降级本地哈希向量保证离线可用）"
    "与 MCP 协议双端（JSON-RPC 2.0 over stdio，自研服务端+客户端）。"
    "基于 FastAPI 提供 REST 与 SSE 流式接口，Docker 一键部署，15 个离线单元测试 + GitHub Actions CI。"
)


async def _ev(tab, js, timeout=15):
    try:
        return await asyncio.wait_for(tab.evaluate(js), timeout=timeout)
    except Exception as e:  # noqa: BLE001
        return f"EVAL_FAIL:{type(e).__name__}"


async def main() -> None:
    cfg = Config()
    cfg.user_data_dir = PROFILE
    cfg.headless = False
    cfg.sandbox = False
    driver.cleanup_profile()
    browser = await uc.start(config=cfg)
    tab = await browser.get(RESUME_CENTER, new_window=True)
    await asyncio.sleep(12)

    log = []

    # 1. 点新增 + 关提示
    r = await _ev(tab, r"""
    (() => {
      const sec = document.getElementById('ProjectExperience');
      let b = sec ? sec.querySelector('.projectEdit') : null;
      if (!b) b = document.querySelector('.projectEdit');
      if (b) { b.click(); return 'clicked'; }
      return 'no_btn';
    })()
    """)
    log.append(f"1.click_add: {r}")
    await asyncio.sleep(3)

    r = await _ev(tab, r"""
    (() => {
      const b = [...document.querySelectorAll('button,.el-button,span')].find(e => /我知道了/.test((e.textContent||'').trim()));
      if (b) { b.click(); return 'dismissed'; }
      return 'none';
    })()
    """)
    log.append(f"2.dismiss: {r}")
    await asyncio.sleep(3)

    # 2. 填项目名称
    name_js = f"""
    (() => {{
      const el = [...document.querySelectorAll('input')].find(i => i.placeholder === '请填写' && i.getBoundingClientRect().width > 0);
      if (!el) return 'no_name_input';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, {json.dumps(PROJECT_NAME, ensure_ascii=False)});
      el.dispatchEvent(new Event('input', {{bubbles: true}}));
      el.dispatchEvent(new Event('change', {{bubbles: true}}));
      return 'name_set:' + el.value.slice(0, 30);
    }})()
    """
    r = await _ev(tab, name_js)
    log.append(f"3.set_name: {r}")
    await asyncio.sleep(2)

    # 3. 填项目描述
    desc_js = f"""
    (() => {{
      const el = [...document.querySelectorAll('textarea')].find(t => /介绍改项目|项目背景/.test(t.placeholder||''));
      if (!el) return 'no_desc_input';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, {json.dumps(PROJECT_DESC, ensure_ascii=False)});
      el.dispatchEvent(new Event('input', {{bubbles: true}}));
      el.dispatchEvent(new Event('change', {{bubbles: true}}));
      return 'desc_set:' + String(el.value.length);
    }})()
    """
    r = await _ev(tab, desc_js)
    log.append(f"4.set_desc: {r}")
    await asyncio.sleep(2)

    # 4. 找保存按钮（滚动到底部）
    r = await _ev(tab, r"""
    (() => {
      window.scrollTo(0, document.body.scrollHeight);
      return 'scrolled';
    })()
    """)
    await asyncio.sleep(2)
    r = await _ev(tab, r"""
    (() => {
      const btns = [...document.querySelectorAll('button,.el-button,span,div')]
        .filter(e => /^(保存|提交|确定|确认)$/.test((e.textContent||'').trim()) && e.getBoundingClientRect().width > 0);
      return JSON.stringify(btns.map(b => ({tag:b.tagName, text:(b.textContent||'').trim(), cls:(b.className||'').toString().slice(0,70)})));
    })()
    """)
    log.append(f"5.save_btns: {r}")

    await asyncio.sleep(1)
    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_add_project.png"))
    except Exception:  # noqa: BLE001
        pass

    result = "\n".join(str(x) for x in log)
    Path(OUT).write_text(result, encoding="utf-8")
    print(result, flush=True)
    try:
        browser.stop()
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    uc.loop().run_until_complete(main())
