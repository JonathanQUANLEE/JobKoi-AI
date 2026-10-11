"""51job 添加项目经历 v3：加"Agent 岗位情报站"（时间 2026.03）。"""

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
OUT = ROOT / "logs" / "job51_add_result3.txt"

PROJECT_NAME = "Agent 岗位情报站 — RAG + LangGraph 岗位智能问答系统"
PROJECT_DESC = (
    "面向求职场景的 RAG/Agent 问答系统。数据层：requests 抓取公开岗位接口，多来源字段统一后写入 SQLite，"
    "job_id 主键去重。检索层：JD 按句子边界切分，BGE-M3 编码为 1024 维向量入库，numpy 余弦相似度检索。"
    "Agent 层：基于 LangGraph 把「岗位检索」和「技能比对」封装为两个工具，模型自主决策调用哪个、查几轮，"
    "并设最大步数与工具失败降级防止循环失控。评测与部署：自建评测集按忠实度+召回双指标打分，"
    "改完检索参数一键回归对比；FastAPI 提供 SSE 流式问答接口，README 三条命令复现全流程。"
)
PICK_MONTH = "03月"


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

    pick = await _ev(tab, f"""
    (() => {{
      const cells = [...document.querySelectorAll('td')].filter(c => c.getBoundingClientRect().width > 0);
      const target = cells.find(c => (c.textContent||'').trim() === {json.dumps(PICK_MONTH)});
      if (!target) return JSON.stringify({{ok:false, sample: cells.map(c=>(c.textContent||'').trim()).slice(0,14)}});
      target.click();
      return JSON.stringify({{ok:true, picked: (target.textContent||'').trim()}});
    }})()
    """)
    log.append(f"6.pick: {pick}")
    await asyncio.sleep(3)

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
    log.append(f"7.click_done: {clicked}")
    await asyncio.sleep(6)

    verify = await _ev(tab, r"""
    (() => {
      const txt = document.body.innerText || '';
      return JSON.stringify({
        hasAgentStation: /岗位情报站/.test(txt),
        hasMiniAgent: /Mini Agent/.test(txt),
      });
    })()
    """)
    log.append(f"8.verify: {verify}")

    try:
        await tab.save_screenshot(str(ROOT / "logs" / "job51_add_result3.png"))
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
