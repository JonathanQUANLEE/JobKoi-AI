"""51job 添加项目经历（完整版）：填 Mini Agent 项目 → 找保存按钮 → 保存 → 验证。"""

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
OUT = ROOT / "logs" / "job51_add_project_result.txt"

PROJECT_NAME = "Mini Agent — 零框架从零实现的 LLM Agent Runtime"
PROJECT_DESC = (
    "独立从零实现可运行的 LLM Agent Runtime，不依赖 LangChain 等任何 Agent 框架。"
    "核心包括：Agent Loop 主循环（finish_reason 判断终止 + max_steps 保险丝防失控）、"
    "工具注册表分发、命令白名单双重校验（修复 && 链式注入穿透并配套回归测试）、"
    "指数退避重试与故障上报，沉淀 26 个可独立运行的渐进模块。"
    "实现 RAG 全链路（文档切片/Embedding/余弦检索/引用生成，Embedding API 失败自动降级本地哈希向量）"
    "与 MCP 协议双端（JSON-RPC 2.0 over stdio，自研服务端+客户端）。"
    "基于 FastAPI 提供 REST 与 SSE 流式接口，Docker 一键部署，15 个离线单元测试 + GitHub Actions CI。"
)

DRY_RUN = False  # True = 只填不保存


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
    # 1. 新增 + 关提示
    log.append("1.add: " + str(await _ev(tab, r"""
    (() => {
      const sec = document.getElementById('ProjectExperience');
      let b = sec ? sec.querySelector('.projectEdit') : null;
      if (!b) b = document.querySelector('.projectEdit');
      if (b) { b.click(); return 'clicked'; }
      return 'no_btn';
    })()
    """)))
    await asyncio.sleep(3)
    log.append("2.dismiss: " + str(await _ev(tab, r"""
    (() => {
      const b = [...document.querySelectorAll('button,.el-button,span')].find(e => /我知道了/.test((e.textContent||'').trim()));
      if (b) { b.click(); return 'dismissed'; }
      return 'none';
    })()
    """)))
    await asyncio.sleep(3)

    # 2. 填名称 + 描述
    log.append("3.name: " + str(await _ev(tab, f"""
    (() => {{
      const el = [...document.querySelectorAll('input')].find(i => i.placeholder === '请填写' && i.getBoundingClientRect().width > 0);
      if (!el) return 'no_input';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, {json.dumps(PROJECT_NAME, ensure_ascii=False)});
      el.dispatchEvent(new Event('input', {{bubbles: true}}));
      el.dispatchEvent(new Event('change', {{bubbles: true}}));
      return 'ok:' + el.value.slice(0, 20);
    }})()
    """)))
    await asyncio.sleep(2)
    log.append("4.desc: " + str(await _ev(tab, f"""
    (() => {{
      const el = [...document.querySelectorAll('textarea')].find(t => /介绍改项目|项目背景/.test(t.placeholder||''));
      if (!el) return 'no_textarea';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, {json.dumps(PROJECT_DESC, ensure_ascii=False)});
      el.dispatchEvent(new Event('input', {{bubbles: true}}));
      el.dispatchEvent(new Event('change', {{bubbles: true}}));
      return 'ok:' + String(el.value.length);
    }})()
    """)))
    await asyncio.sleep(2)

    # 3. 列出候选保存按钮（宽松匹配 + 小尺寸）
    cand = await _ev(tab, r"""
    (() => {
      const out = [];
      [...document.querySelectorAll('button,.el-button,span,div,a')].forEach(e => {
        const t = (e.textContent||'').trim();
        const r = e.getBoundingClientRect();
        if (!t || t.length > 8 || r.width === 0 || r.width > 260 || r.height > 60) return;
        if (!/保存|确定|提交|完成|添加/.test(t)) return;
        out.push({tag: e.tagName, text: t, cls: (e.className||'').toString().slice(0,70), y: Math.round(r.top), w: Math.round(r.width)});
      });
      return JSON.stringify(out, null, 2);
    })()
    """)
    log.append(f"5.save_candidates:\n{cand}")

    # 4. 点"完成"（51job 的保存按钮文本是"完成"，class el-button--primary）
    if not DRY_RUN:
        clicked = await _ev(tab, r"""
        (() => {
          const items = [];
          document.querySelectorAll('button').forEach(e => {
            const t = (e.textContent||'').trim();
            const r = e.getBoundingClientRect();
            if (!t || r.width === 0) return;
            if (!/^(保存|确定|提交|完成)$/.test(t)) return;
            items.push({el: e, y: r.top});
          });
          if (!items.length) return 'no_target';
          items.sort((a,b) => b.y - a.y);
          items[0].el.click();
          return 'clicked:' + items[0].el.textContent.trim();
        })()
        """)
        log.append(f"6.click_save: {clicked}")
        await asyncio.sleep(6)

        # 5. 验证：页面是否出现新项目
        verify = await _ev(tab, r"""
        (() => {
          const txt = document.body.innerText || '';
          return JSON.stringify({
            hasMiniAgent: /Mini Agent/.test(txt),
            snippet: txt.slice(0, 100)
          });
        })()
        """)
        log.append(f"7.verify: {verify}")

    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_add_project_result.png"))
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
