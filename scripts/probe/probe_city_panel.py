"""BOSS 城市筛选面板 DOM 取证（2026-10-12 城市点击失败修复的依据）。

实测现象（两轮实锤）：城市批次点击「每批恰好最后一个成功、其余失败」：
- 热门批次 [成都,广州,上海,北京]：只有北京成功；
- 冷门批次 [南昌,石家庄,哈尔滨,郑州]：只有郑州成功。
重试（重新点开组标签）没有解决。本脚本 dump 面板真实结构回答：
1. find("城市", best_match=True) 实际能匹配到哪些候选元素？
2. 冷门城市（南昌/石家庄/哈尔滨）在不在 DOM？藏在哪（省份分组？展开按钮？不可见？）
3. 点开面板前后 DOM 差异；成功点击郑州后的 URL 变化。

用法：
    uv run python scripts/probe/probe_city_panel.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from boss_zhipin.website_oper import finding_jobs  # noqa: E402

SEARCH_URL = "https://www.zhipin.com/web/geek/jobs?query=AI%20%E5%AE%9E%E4%B9%A0"
COLD_CITIES = ["南昌", "石家庄", "哈尔滨", "郑州", "合肥"]
HOT_CITIES = ["北京", "上海", "广州", "深圳", "成都"]

# 找出文本**恰好等于**给定词的所有元素（叶子文本节点），带可见性与坐标
JS_FIND_TEXT = r"""
(textList) => {
  const out = {};
  for (const t of textList) {
    const hits = [];
    document.querySelectorAll('*').forEach((el) => {
      const direct = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join('');
      if (direct === t) {
        const r = el.getBoundingClientRect();
        hits.push({
          tag: el.tagName,
          cls: String(el.className || '').slice(0, 100),
          id: el.id || '',
          visible: !!(el.offsetParent || (r.width > 0 && r.height > 0)),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          html: el.outerHTML.slice(0, 220),
        });
      }
    });
    out[t] = hits.slice(0, 8);
  }
  return JSON.stringify(out);
}
"""

# 找疑似「更多城市/省份」入口
JS_FIND_PANEL_HINTS = r"""
() => {
  const out = [];
  const needles = ['更多', '展开', '省份', '广东', '江西', '河北', '黑龙江', '河南', '山东', '全部城市'];
  document.querySelectorAll('*').forEach((el) => {
    const t = (el.innerText || '').trim();
    if (!t || t.length > 12) return;
    for (const n of needles) {
      if (t === n || (t.length <= 6 && t.includes(n))) {
        const r = el.getBoundingClientRect();
        out.push({
          text: t.slice(0, 20), tag: el.tagName,
          cls: String(el.className || '').slice(0, 100),
          visible: !!(el.offsetParent || (r.width > 0 && r.height > 0)),
          html: el.outerHTML.slice(0, 180),
        });
        break;
      }
    }
  });
  return JSON.stringify(out.slice(0, 40));
}
"""


async def dump(tag: str, cities: list[str]) -> None:
    raw = await finding_jobs._safe_evaluate(f"({JS_FIND_TEXT})({json.dumps(cities, ensure_ascii=False)})")
    print(f"\n===== [{tag}] 城市文本元素 =====")
    for city, hits in (raw or {}).items():
        if hits:
            for h in hits:
                print(f"  {city}: <{h['tag']}> vis={h['visible']} rect={h['rect']} cls={h['cls']!r}")
                print(f"      html={h['html']}")
        else:
            print(f"  {city}: ❌ DOM 中无匹配元素")


async def dump_hints(tag: str) -> None:
    raw = await finding_jobs._safe_evaluate(f"({JS_FIND_PANEL_HINTS})()")
    print(f"\n===== [{tag}] 面板线索（更多/省份/展开） =====")
    for h in raw or []:
        print(f"  text={h['text']!r} <{h['tag']}> vis={h['visible']} cls={h['cls']!r}")
        print(f"      html={h['html']}")


async def main() -> int:
    await finding_jobs.open_browser_with_options(SEARCH_URL, "chrome")
    print("[probe] 页面 URL:", finding_jobs.get_current_url())

    # 1. 点开面板前的 DOM 现状
    await dump("面板打开前", COLD_CITIES + HOT_CITIES[:3])
    await dump_hints("面板打开前")

    # 2. 复刻 click_filter_value 的组标签点击：find("城市", best_match=True)
    tab = finding_jobs.get_tab()
    try:
        group = await tab.find("城市", best_match=True, timeout=5)
        print(f"\n[probe] find('城市') 命中元素: {group!r}")
    except Exception as e:
        print(f"[probe] find('城市') 异常: {e}")
        group = None
    if group:
        try:
            await group.click()
        except Exception as e:
            print(f"[probe] 点组标签异常: {e}")
    await asyncio.sleep(2)

    # 3. 面板打开后的 DOM
    await dump("面板打开后", COLD_CITIES + HOT_CITIES)
    await dump_hints("面板打开后")

    # 4. 复刻 click_filter_value 的城市值点击：find(城市名, best_match=True)
    for city in ("郑州", "南昌"):
        try:
            el = await tab.find(city, best_match=True, timeout=5)
            print(f"\n[probe] find({city!r}) 命中: {el!r}")
        except Exception as e:
            print(f"\n[probe] find({city!r}) 未命中/异常: {type(e).__name__}: {e}")

    print("\n[probe] 结束。请把以上完整输出发给 AI 分析。")
    await finding_jobs.shutdown()
    return 0


if __name__ == "__main__":
    import nodriver as uc

    raise SystemExit(uc.loop().run_until_complete(main()))
