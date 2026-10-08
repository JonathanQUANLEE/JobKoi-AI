"""51job 添加项目经历（完整）：填名称/描述/时间 → 完成 → 验证。

时间选择器是 el-date-editor--month（年月），操作：点开面板 → 点月份格子。
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
OUT = ROOT / "logs" / "job51_add_result2.txt"

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
YEAR = "2026"
MONTH_TEXTS = ["一月", "1月", "1 月"]


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
    log.append("1.add: " + str(await _ev(tab, r"""
    (() => {
      const sec = document.getElementById('ProjectExperience');
      let b = sec ? sec.querySelector('.projectEdit') : null;
      if (!b) b = document.querySelector('.projectEdit');
      if (b) { b.click(); return 'clicked'; }
      return 'no';
    })()
    """)))
    await asyncio.sleep(3)
    log.append("2.dismiss: " + str(await _ev(tab, r"""
    (() => {
      const b = [...document.querySelectorAll('button,.el-button,span')].find(e => /我知道了/.test((e.textContent||'').trim()));
      if (b) { b.click(); return 'd'; }
      return 'n';
    })()
    """)))
    await asyncio.sleep(3)

    # 填名称
    log.append("3.name: " + str(await _ev(tab, f"""
    (() => {{
      const el = [...document.querySelectorAll('input')].find(i => i.placeholder === '请填写' && i.getBoundingClientRect().width > 0);
      if (!el) return 'no_input';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, {json.dumps(PROJECT_NAME, ensure_ascii=False)});
      el.dispatchEvent(new Event('input', {{bubbles: true}}));
      el.dispatchEvent(new Event('change', {{bubbles: true}}));
      return 'ok';
    }})()
    """)))
    await asyncio.sleep(2)

    # 填描述
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

    # 点开月份选择器
    log.append("5.open_month: " + str(await _ev(tab, r"""
    (() => {
      const el = [...document.querySelectorAll('input')].find(i => i.placeholder === '请选择' && i.getBoundingClientRect().width > 0);
      if (!el) return 'no_input';
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
      el.click();
      return 'opened';
    })()
    """)))
    await asyncio.sleep(3)

    # 点年份 & 月份
    click_month = await _ev(tab, f"""
    (() => {{
      // 年份：如有需要，点"下一年"直到 {YEAR}
      const yrLabel = document.querySelector('.el-date-picker__header-label');
      let yearText = yrLabel ? (yrLabel.textContent||'').trim() : '';
      let guard = 0;
      while (yearText && !yearText.includes('{YEAR}') && guard < 5) {{
        const nx = document.querySelector('button.el-date-picker__next-btn.el-icon-d-arrow-right');
        if (!nx) break;
        nx.click();
        guard++;
        yearText = (document.querySelector('.el-date-picker__header-label')?.textContent||'').trim();
      }}
      // 月份格子
      const cells = [...document.querySelectorAll('.el-month-table td, .el-picker-panel__content td, td')]
        .filter(c => c.getBoundingClientRect().width > 0);
      const texts = cells.map(c => (c.textContent||'').trim()).slice(0, 16);
      const target = cells.find(c => /^(01月|1月|一月)$/.test((c.textContent||'').trim()));
      if (!target) return JSON.stringify({{year: yearText, monthClicked: false, sampleTexts: texts}});
      target.click();
      return JSON.stringify({{year: yearText, monthClicked: true, picked: (target.textContent||'').trim()}});
    }})()
    """)
    log.append(f"6.pick_month: {click_month}")
    await asyncio.sleep(3)

    # 检查红字错误是否消失
    err = await _ev(tab, r"""
    (() => {
      const t = document.body.innerText || '';
      return JSON.stringify({hasStartErr: /请选择开始时间/.test(t)});
    })()
    """)
    log.append(f"7.err_check: {err}")

    # 点完成
    clicked = await _ev(tab, r"""
    (() => {
      const items = [];
      document.querySelectorAll('button').forEach(e => {
        const t = (e.textContent||'').trim();
        const r = e.getBoundingClientRect();
        if (!t || r.width === 0) return;
        if (!/^(完成|保存|确定)$/.test(t)) return;
        items.push({el: e, y: r.top});
      });
      if (!items.length) return 'no_target';
      items.sort((a,b) => b.y - a.y);
      items[0].el.click();
      return 'clicked:' + items[0].el.textContent.trim();
    })()
    """)
    log.append(f"8.click_done: {clicked}")
    await asyncio.sleep(6)

    # 验证
    verify = await _ev(tab, r"""
    (() => {
      const txt = document.body.innerText || '';
      return JSON.stringify({hasMiniAgent: /Mini Agent/.test(txt)});
    })()
    """)
    log.append(f"9.verify: {verify}")

    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_add_result2.png"))
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
