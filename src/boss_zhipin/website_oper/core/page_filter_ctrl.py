"""页面筛选控制、下拉选择与多城市随机轮换。"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
import random
import re
from typing import Any

log = logging.getLogger(__name__)

_PAGE_FILTER_LABELS = {
    "city": "城市",
    "education": "学历",
    "boss_active": "BOSS活跃",
    "experience": "经验",
    "salary": "薪资待遇",
    "company_scale": "公司规模",
    "industry": "行业",
}

_BOSS_ACTIVE_PATTERNS = (
    "刚刚活跃",
    "今日活跃",
    "3日内活跃",
    "本周活跃",
    "本月活跃",
    "3月内活跃",
    "刚刚在线",
)

BOSS_MAX_CITIES_PER_BATCH = 4  # 兼容保留：BOSS 网页 UI 单次勾选上限（wapi 已实证只收单城）

# 「全国」意向的热门城市展开序列（2026-10-17 用户痛点）：BOSS 的全国代码
# 100010000 只会按 IP 属地/泛热度返回混合流，用户感知"只搜了本地，完全
# 没覆盖全国"。选"全国"时自动展开为核心 Top 城市走多城轮换——每个城市
# 都真实投到，而不是一个 IP 属地混合流糊弄。全部城市均在 BOSS_CITY_CODES
# 代码表内（URL 直填可靠）。
NATIONWIDE_DEFAULT_CITIES: tuple[str, ...] = (
    "北京", "上海", "广州", "深圳", "杭州",
    "成都", "武汉", "南京", "西安", "苏州",
)


def expand_nationwide_cities(values: list[str]) -> list[str]:
    """把「全国」意向展开为核心热门城市序列（保序去重，纯函数）。

    - ["全国"] → 10 个 Top 城市（北上广深杭+成都武汉南京西安苏州）
    - ["全国", "北京"] → 10 城（北京去重，不重复出现）
    - 不含"全国" → 原样返回（零介入）
    展开结果交给上层洗牌轮换——"全国"从此等于"每个核心城市都投到"。
    """
    if not any(v == "全国" for v in values):
        return list(values)
    expanded: list[str] = []
    for value in values:
        if value == "全国":
            for city in NATIONWIDE_DEFAULT_CITIES:
                if city not in expanded:
                    expanded.append(city)
        elif value and value not in expanded:
            expanded.append(value)
    return expanded

# BOSS 城市代码表（城市名 → URL city 参数代码）。
# 为什么改走 URL：2026-10-12 probe（scripts/probe/probe_city_panel.py）实锤
# DOM 点击城市 chip 不可行——城市面板里的 chips 不是可 find 的文本节点，
# 历史「成功」案例（北京/郑州）点中的其实是页面顶部的 cur-city-label
# 账号定位标签，纯属碰运气。URL 参数方案（probe_city_url.py 实证）：
# 单城/多城逗号格式（city=101180100,101020100）BOSS 完整保留且生效，
# 多选态顶部标签显示「城市」；反复切换无残留。
# 郑州已 probe 实证（101180100）；其余为 BOSS 公开城市代码（多年稳定），
# 若有错 DRY_RUN 的 per_city 汇总会立刻暴露（岗位卡城市名对不上）。
BOSS_CITY_CODES: dict[str, str] = {
    "全国": "100010000",
    "北京": "101010100", "上海": "101020100", "广州": "101280100", "深圳": "101280600",
    "杭州": "101210100", "成都": "101270100", "武汉": "101200100", "南京": "101190100",
    "苏州": "101190400", "东莞": "101281600", "重庆": "101040100", "天津": "101030100",
    "西安": "101110100", "长沙": "101250100", "郑州": "101180100", "青岛": "101120200",
    "合肥": "101220100", "福州": "101230100", "厦门": "101230400", "昆明": "101250200",
    "大连": "101070200", "沈阳": "101070100", "哈尔滨": "101050100", "济南": "101120100",
    "佛山": "101280800", "宁波": "101210400", "无锡": "101190200", "温州": "101210700",
    "珠海": "101280700", "中山": "101281700", "惠州": "101280300", "贵阳": "101260100",
    "南昌": "101240100", "太原": "101100100", "石家庄": "101090100", "兰州": "101160100",
    "南宁": "101220300", "常州": "101190300", "泉州": "101230500", "南通": "101190600",
    "嘉兴": "101210300", "烟台": "101120500", "唐山": "101030200", "徐州": "101190800",
    "汕头": "101281500", "洛阳": "101180200", "乌鲁木齐": "101130100",
}

# 城市随机轮换的模块级状态（一轮巡航内共享；每轮入口 apply_page_filters 重建）：
# - city_sequence: 本轮的洗牌城市序列（如 [合肥, 南昌, 郑州, …]，逐城推进的访问顺序）
# - city_cursor: 当前推进到第几个城市（0-based；-1 = 入口未跑、rotate 从第 1 城开始）
# - active_batch: 当前页面上真实应用着的城市（=[当前城]，事件展示用）
# - search_url: 最近一次成功应用的**搜索页** URL（换城时的 URL 基准——
#   dry-run 会把浏览器留在岗位详情页，从详情页换城会丢搜索词，2026-10-12 实测）
_city_rotation_state: dict[str, Any] = {
    "city_sequence": [],
    "city_cursor": 0,
    "active_batch": [],
    "search_url": "",
}


def extract_boss_active_status(text: str) -> str:
    """从岗位卡片或详情文本里提取 BOSS 活跃状态。"""
    if not text:
        return ""
    for pattern in _BOSS_ACTIVE_PATTERNS:
        if pattern in text:
            return pattern
    match = re.search(r"\d+日内活跃|\d+月内活跃", text)
    return match.group(0) if match else ""


async def click_filter_value(group_name: str, value: str, timeout: float = 5) -> bool:
    """按页面筛选组和值文本尽力点击（带一次重试）。

    2026-10-12 实测事故：7 城洗牌后成都/广州/上海连续点击失败、只有北京
    成功——城市面板懒加载时目标 chip 还不在 DOM，单次 find 5s 超时直接放弃，
    城市筛选 3/4 落空、搜索变成全国混合（扫出 312 个非意向城市的深圳岗）。
    修法：值找不到时重试一次——重新点开组标签（面板可能已关闭）+ 等待
    渲染，再找一次。

    2026-10-18 事故加固：裸 ``tab.find`` 在 CDP 通道挂死时永不返回
    （except 分支无机会执行，整轮巡航死寂），统一走 cdp_call 护栏——
    超时按"未找到"降级，与既有重试/URL 直填兜底链自然衔接。
    """
    from boss_zhipin.website_oper import finding_jobs
    from boss_zhipin.website_oper.core.cdp_guard import cdp_call

    tab = finding_jobs._tab
    if tab is None:
        return False
    group_label = _PAGE_FILTER_LABELS.get(group_name, group_name)

    async def _open_group() -> None:
        try:
            group = await cdp_call(
                tab.find(group_label, best_match=True, timeout=timeout),
                timeout=timeout + 2,
                label=f"筛选组：{group_label}",
            )
            if group:
                await group.click()
                # 0.3→0.8s：给懒加载的城市面板一点渲染时间（点了组标签后
                # chip 不是同步出现的，太快去 find 必然扑空）
                await asyncio.sleep(0.8)
        except Exception as e:  # noqa: BLE001
            log.debug("页面筛选组 %s 点击失败，继续尝试直接点击值：%s", group_label, e)

    async def _click_value() -> bool:
        try:
            option = await cdp_call(
                tab.find(value, best_match=True, timeout=timeout),
                timeout=timeout + 2,
                label=f"筛选值：{value}",
            )
            if not option:
                return False
            await option.click()
            log.info("页面筛选已点击：%s=%s", group_name, value)
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("页面筛选值点击失败：%s=%s，%s", group_name, value, e)
            return False

    await _open_group()
    if await _click_value():
        return True
    # 重试一次：重新点开组标签（面板可能已关闭）+ 等懒加载渲染，再找
    log.info("页面筛选 %s=%s 首次未命中，重试一次（等面板渲染完成）", group_name, value)
    await _open_group()
    await asyncio.sleep(2)
    return await _click_value()


def get_platform_city_chunks(cities: list[str], chunk_size: int = BOSS_MAX_CITIES_PER_BATCH) -> list[list[str]]:
    """将城市列表切分为符合招聘平台单次勾选限制的批次（如 BOSS 直聘单次最多 4 个）。"""
    if not cities:
        return []
    return [cities[i : i + chunk_size] for i in range(0, len(cities), chunk_size)]


def build_shuffled_city_batches(
    cities: list[str], batch_size: int = BOSS_MAX_CITIES_PER_BATCH
) -> list[list[str]]:
    """Fisher-Yates 全量洗牌后切批（城市随机轮换的核心，2026-10-12 用户拍板）。

    为什么是「洗牌后切批」而不是「每次随机抽城市」：真随机抽样会让某个城市
    长期抽不中（饿死，lottery scheduling 的经典缺陷）——用户要求 10 个城市
    每个都必须投到。Fisher-Yates 洗牌 + 无放回切批保证：**每一轮所有城市
    恰好出现一次**（全覆盖、无重复、无饿死），而批次顺序与批内组合**完全
    随机**（每次巡航都不一样，第 5/6 个城市也可能进第一批）。业界同款：
    音乐播放器「整列表洗牌」（Spotify 真随机反被用户骂不像随机，洗牌轮询
    才是体感真随机）+ 代理轮换最佳实践（无放回抽完一轮再重洗：
    unpredictable while spreading load evenly）。拟人化红利：每轮巡航的
    城市访问模式都不同，比固定顺序更不像机器人。
    """
    if not cities:
        return []
    shuffled = list(cities)
    random.shuffle(shuffled)  # random.shuffle 即 Fisher-Yates 洗牌
    return get_platform_city_chunks(shuffled, batch_size)


def build_shuffled_city_sequence(cities: list[str]) -> list[str]:
    """Fisher-Yates 洗牌城市序列（逐城推进版，2026-10-12 wapi 取证后的 v3 方案）。

    wapi 只接受**单城** city 参数（probe_wapi_city.py 实证：多城逗号
    code=19），所以城市调度从「批次」改为「逐城」：洗牌出随机访问顺序，
    一个城市一个城市地投（每城单独一轮搜索），扫完自动切下一城。
    全覆盖铁律不变：一轮里每个城市恰好访问一次，无饿死、无重复。
    """
    if not cities:
        return []
    shuffled = list(cities)
    random.shuffle(shuffled)
    return shuffled


def _build_city_url(current_url: str, cities: list[str]) -> tuple[str, list[str]]:
    """构造城市筛选 URL：把 city 参数整体替换为给定城市的代码（逗号串）。

    返回 (新 URL, 未知城市名列表)。其他参数（query/degree/jobType/ka…）原样
    保留；已有 city 参数被替换——这就是"真·换批"：不存在旧城市叠加残留。
    """
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    known_codes = [BOSS_CITY_CODES[c] for c in cities if c in BOSS_CITY_CODES]
    unknown = [c for c in cities if c not in BOSS_CITY_CODES]
    parts = urlsplit(current_url or "")
    params = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != "city"
    ]
    if known_codes:
        params.append(("city", ",".join(known_codes)))
    return urlunsplit(parts._replace(query=urlencode(params))), unknown


def _build_keyword_url(current_url: str, keyword: str) -> str:
    """把 query 参数整体替换为新岗位词，其余参数（city/degree/ka…）原样保留。

    与 ``_build_city_url`` 同款 URL 手术（真·换词：无叠加残留）。
    urlencode 会负责关键词的百分号编码，不要预先 quote（会双重编码）。
    """
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(current_url or "")
    params = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != "query"
    ]
    params.append(("query", keyword or ""))
    return urlunsplit(parts._replace(query=urlencode(params)))


async def rotate_to_keyword(
    keyword: str,
    emit_event: Callable[[dict], None] | None = None,
) -> bool:
    """岗位关键词轮换（2026-10-15 多岗位 Phase 2）：URL 的 query 参数直填导航。

    与 ``apply_city_url_filter`` 同机制：换词基准必须是搜索页（不在时回退
    到记录的搜索页 URL）；导航 + 等稳定 + 更新基准。城市等其余筛选参数
    原样保留。失败返回 False（调用方降级：跳过该词或转入城市推进）。
    """
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    kw = (keyword or "").strip()
    if tab is None or not kw:
        return False
    current_url = finding_jobs.get_current_url()
    if "/web/geek/jobs" not in current_url:
        saved = str(_city_rotation_state.get("search_url") or "")
        if "/web/geek/jobs" in saved:
            current_url = saved
            log.info("当前不在搜索页，用记录的搜索页 URL 作为换词基准：%s", saved)
        else:
            return False
    new_url = _build_keyword_url(current_url, kw)
    if new_url == current_url:
        return True
    try:
        await asyncio.wait_for(tab.get(new_url), timeout=20)
    except Exception as e:  # noqa: BLE001
        log.warning("关键词轮换导航失败：%s（%s）", new_url, e)
        return False
    await finding_jobs._wait_url_stable(stable_for=1.5, timeout=20)
    _city_rotation_state["search_url"] = new_url
    log.info("[关键词轮换] 已切换岗位搜索词：%s", kw)
    if emit_event:
        emit_event(
            {
                "group": "keyword_rotation",
                "keyword": kw,
                "status": "rotated",
                "message": f"岗位关键词轮换：切换到「{kw}」继续投递",
            }
        )
    return True


async def apply_city_url_filter(cities: list[str]) -> bool:
    """URL 直填城市筛选并导航（2026-10-12 重写：替代 DOM 点击）。

    Returns:
        True = 导航成功（页面已按城市参数刷新）；False = 没有可用城市代码
        /没有受控 tab/导航失败。未知城市名会先记 warning（本地规则兜底）。
    """
    from boss_zhipin.website_oper import finding_jobs

    tab = finding_jobs._tab
    if tab is None or not cities:
        return False
    # 换城基准必须是**搜索页**：dry-run/详情页流程会把浏览器留在岗位详情页
    # （/job_detail/xxx.html），直接在详情页 URL 上替换 city 会丢搜索词，
    # 拉回的岗位就不再是画像方向（2026-10-12 第七轮实测）。优先用当前 URL，
    # 不在搜索页时回退到最近一次成功应用的搜索页 URL。
    current_url = finding_jobs.get_current_url()
    if "/web/geek/jobs" not in current_url:
        saved = str(_city_rotation_state.get("search_url") or "")
        if "/web/geek/jobs" in saved:
            current_url = saved
            log.info("当前不在搜索页，用记录的搜索页 URL 作为换城基准：%s", saved)
    new_url, unknown = _build_city_url(current_url, cities)
    known = [c for c in cities if c in BOSS_CITY_CODES]
    if unknown:
        log.warning(
            "以下城市不在内置 BOSS 城市代码表中，本轮无法按城市筛选（本地规则兜底）：%s",
            ", ".join(unknown),
        )
    if not known:
        log.warning("城市筛选 URL 直填跳过：全部城市都没有已知代码：%s", ", ".join(cities))
        return False
    if new_url == current_url:
        log.info("城市筛选 URL 无变化（城市组合与当前一致）：%s", ", ".join(known))
        return True
    try:
        await asyncio.wait_for(tab.get(new_url), timeout=20)
    except Exception as e:  # noqa: BLE001
        log.warning("城市筛选 URL 直填导航失败：%s（%s）", new_url, e)
        return False
    await finding_jobs._wait_url_stable(stable_for=1.5, timeout=20)
    _city_rotation_state["search_url"] = new_url  # 记住搜索页基准（换城兜底）
    log.info("城市筛选已通过 URL 直填应用：%s（%s）", ", ".join(known), new_url)
    return True


async def rotate_next_city_batch(
    filters: dict | None,
    emit_event: Callable[[dict], None] | None = None,
) -> bool:
    """推进到洗牌序列的**下一个意向城市**（2026-10-12 用户拍板 + wapi 取证后的 v3）。

    语义（用户原话「根据随机法则，第五个/第六个城市也要投」）：
    - wapi 只接受单城 city 参数（probe_wapi_city.py 实证：多城逗号 code=19），
      所以城市调度是**逐城推进**：洗牌出随机顺序，一个城市一轮搜索，
      扫完自动切下一城——每个城市都投到，无饿死、无重复；
    - 换城 = URL 单城直填（city 参数整体替换）：无叠加/残留问题。

    返回 False 的情况：非城市配置 / 城市未启用 / 单城（无需推进）/ 一轮已轮完 /
    URL 直填导航失败。
    """
    from boss_zhipin.website_oper import finding_jobs

    if not isinstance(filters, dict):
        return False
    city_cfg = filters.get("city")
    if not isinstance(city_cfg, dict) or not bool(city_cfg.get("enabled", True)):
        return False
    raw_cities = [str(item).strip() for item in city_cfg.get("values") or [] if str(item).strip()]
    raw_cities = expand_nationwide_cities(raw_cities)  # 「全国」→ 核心城市序列
    if len(raw_cities) < 2:
        return False  # 单城无需推进

    # 序列优先用入口 apply_page_filters 洗好的；两种情况按当前城市重建：
    # ① 序列为空（use_current_page 等路径跳过了入口筛选）；② 用户两轮巡航
    # 之间改了城市列表——旧序列作废。重建意味着本轮还没投过任何城，游标
    # 置 -1，下一次推进从洗牌后的第 1 城开始——否则会跳过第 1 城导致饿死。
    sequence = [str(c) for c in _city_rotation_state.get("city_sequence") or []]
    if sorted(sequence) != sorted(raw_cities):
        sequence = build_shuffled_city_sequence(raw_cities)
        _city_rotation_state["city_sequence"] = sequence
        _city_rotation_state["city_cursor"] = -1

    cursor = int(_city_rotation_state.get("city_cursor", -1))
    next_idx = cursor + 1
    if next_idx >= len(sequence):
        # 一轮洗牌的所有城市都投过了：自然结束（去重账本挡住重复投递），
        # 下轮巡航入口重新洗牌，顺序又是新的。
        log.info("【城市随机推进】本轮 %d 个城市已全部扫完，结束", len(sequence))
        return False
    next_city = sequence[next_idx]
    _city_rotation_state["city_cursor"] = next_idx
    _city_rotation_state["active_batch"] = [next_city]

    if cursor < 0:
        switch_text = (
            f"城市随机推进：本轮从洗牌后的第 {next_idx + 1}/{len(sequence)} 城 [{next_city}] 开始投递"
        )
        log.info("【城市随机推进】本轮首城就位：第 %d/%d 城 [%s]", next_idx + 1, len(sequence), next_city)
    else:
        switch_text = (
            f"城市随机推进：第 {cursor + 1}/{len(sequence)} 城 [{sequence[cursor]}] 已扫完，"
            f"切换到第 {next_idx + 1}/{len(sequence)} 城 [{next_city}] 继续投递"
        )
        log.info(
            "【城市随机推进】第 %d/%d 城 [%s] → 第 %d/%d 城 [%s]",
            cursor + 1,
            len(sequence),
            sequence[cursor],
            next_idx + 1,
            len(sequence),
            next_city,
        )
    if emit_event:
        emit_event(
            {
                "group": "city_rotation",
                "batch_index": next_idx + 1,
                "total_batches": len(sequence),
                "cities": [next_city],
                "status": "rotated",
                "message": switch_text,
            }
        )

    # URL 单城直填：city 参数整体替换，无叠加/残留；wapi 只认单城（实证）。
    if not await apply_city_url_filter([next_city]):
        log.warning("城市随机推进：URL 直填下一城[%s]失败，结束本轮", next_city)
        return False
    await asyncio.sleep(2)  # 等新页面渲染（岗位列表按新城市拉取）
    return True


async def restart_city_rotation_round(
    filters: dict | None,
    emit_event: Callable[[dict], None] | None = None,
) -> bool:
    """一轮城市序列全部走完后，重洗序列开启下一轮全覆盖（2026-10-17 公平轮换）。

    单元配额轮换的续航引擎：配额触发轮换后，一轮城市×岗位词矩阵走完时
    若仍有单元有存量（页面没扫完），重洗城市序列（新的随机顺序，拟人化：
    每轮访问模式都不同）并把游标拨回 -1，随后调 ``rotate_next_city_batch``
    会从新序列的第 1 城继续。返回 False = 无法重开（非多城配置/城市未启用）。
    """
    if not isinstance(filters, dict):
        return False
    city_cfg = filters.get("city")
    if not isinstance(city_cfg, dict) or not bool(city_cfg.get("enabled", True)):
        return False
    raw_cities = [str(item).strip() for item in city_cfg.get("values") or [] if str(item).strip()]
    raw_cities = expand_nationwide_cities(raw_cities)
    if len(raw_cities) < 2:
        return False
    _city_rotation_state["city_sequence"] = build_shuffled_city_sequence(raw_cities)
    _city_rotation_state["city_cursor"] = -1
    log.info(
        "【城市随机推进】一轮城市已走完，重洗序列开启下一轮：[%s]",
        ", ".join(_city_rotation_state["city_sequence"]),
    )
    if emit_event:
        emit_event(
            {
                "group": "city_rotation",
                "status": "restarted",
                "message": (
                    "城市×岗位词矩阵一轮走完但仍有存量，重洗城市顺序开启下一轮全覆盖"
                ),
            }
        )
    return True


async def apply_page_filters(
    filters: dict | None,
    *,
    emit_event: Callable[[dict], None] | None = None,
) -> None:
    """执行 profile.page_filters。

    城市 = URL 直填（2026-10-12 重写，probe 实证 DOM 点击城市 chips 不可行），
    且必须先于其他组执行——URL 导航会整页刷新，学历/BOSS 活跃等 DOM 点击
    要落在新页面上才有意义。
    """
    from boss_zhipin.website_oper import finding_jobs

    if not isinstance(filters, dict) or not filters:
        return
    strict = bool(filters.get("strict", False))
    clicked_any = False

    # ---------- 城市组：URL 单城直填（先行，导航刷新页面） ----------
    city_cfg = filters.get("city")
    if isinstance(city_cfg, dict) and bool(city_cfg.get("enabled", True)):
        raw_values = [str(item).strip() for item in city_cfg.get("values") or [] if str(item).strip()]
        # 「全国」→ 核心城市序列（2026-10-17）：全国代码只会返回 IP 属地混合流，
        # 展开后走多城随机轮换，每个核心城市都真实投到。
        expanded_values = expand_nationwide_cities(raw_values)
        if expanded_values != raw_values:
            log.info(
                "意向城市为「全国」，自动展开为核心城市交错巡航序列：%s",
                ", ".join(expanded_values),
            )
            if emit_event:
                emit_event(
                    {
                        "group": "city",
                        "value": "全国",
                        "status": "expanded",
                        "message": (
                            f"「全国」已展开为 {len(expanded_values)} 个核心城市"
                            f"（{', '.join(expanded_values)}），将按随机顺序逐城投递，每个城市都投到"
                        ),
                    }
                )
        raw_values = expanded_values
        if raw_values:
            if len(raw_values) >= 2:
                # ≥2 城：Fisher-Yates 洗牌出随机访问顺序，逐城推进
                # （wapi 只收单城 city，probe_wapi_city.py 实证多城逗号 code=19）。
                # 入口应用第 1 城，rotate_next_city_batch 逐城推进后续——
                # 一轮每个城市都投到，顺序每轮随机。写状态也消灭跨轮 stale 残留。
                sequence = build_shuffled_city_sequence(raw_values)
                _city_rotation_state["city_sequence"] = sequence
                _city_rotation_state["city_cursor"] = 0
                values = [sequence[0]]
                log.info(
                    "意向城市 %d 个，启用随机逐城推进：本轮洗牌顺序 [%s]，当前从第 1/%d 城 [%s] 开始",
                    len(raw_values),
                    ", ".join(sequence),
                    len(sequence),
                    values[0],
                )
                if emit_event:
                    emit_event(
                        {
                            "group": "city_rotation",
                            "batch_index": 1,
                            "total_batches": len(sequence),
                            "cities": values,
                            "status": "info",
                            "message": (
                                f"意向城市随机推进生效：{len(raw_values)} 个城市洗牌为随机顺序，"
                                f"当前从第 1/{len(sequence)} 城 [{values[0]}] 开始，本轮会把每个城市都投到"
                            ),
                        }
                    )
            else:
                # 单城：无需推进，清掉残留的轮换状态，防止上一轮序列串台
                _city_rotation_state["city_sequence"] = []
                _city_rotation_state["city_cursor"] = 0
                _city_rotation_state["active_batch"] = []
                values = raw_values

            ok = await apply_city_url_filter(values)
            if ok:
                clicked_any = True
                _city_rotation_state["active_batch"] = list(values)
                if emit_event:
                    emit_event(
                        {
                            "group": "city",
                            "value": ", ".join(values),
                            "status": "success",
                            "message": f"城市筛选已应用（URL 直填）：{', '.join(values)}",
                        }
                    )
            else:
                label = _PAGE_FILTER_LABELS.get("city", "city")
                message = f"页面筛选失败：{label}={', '.join(values)}"
                if strict:
                    raise RuntimeError(message)
                detailed_message = f"{message}。已继续运行，本地规则继续兜底。"
                suggestion = "你可以在 BOSS 页面手动筛选到合适页面，再回到 GUI 直接点击开始运行。"
                log.warning("%s%s", detailed_message, suggestion)
                if emit_event:
                    emit_event(
                        {
                            "group": "city",
                            "value": ", ".join(values),
                            "status": "failed",
                            "message": detailed_message,
                            "suggestion": suggestion,
                        }
                    )

    # ---------- 其余组：DOM 尽力点击（学历 / BOSS 活跃 / 薪资等） ----------
    for group_name, config in filters.items():
        if group_name == "strict" or group_name == "city" or not isinstance(config, dict):
            continue
        if not bool(config.get("enabled", True)):
            continue
        values = [str(item).strip() for item in config.get("values") or [] if str(item).strip()]

        for value in values:
            ok = await finding_jobs.click_filter_value(str(group_name), value)
            if ok:
                if emit_event:
                    emit_event(
                        {
                            "group": str(group_name),
                            "value": value,
                            "status": "success",
                            "message": f"页面筛选成功：{_PAGE_FILTER_LABELS.get(str(group_name), str(group_name))}={value}",
                        }
                    )
                clicked_any = True
                continue
            label = _PAGE_FILTER_LABELS.get(str(group_name), str(group_name))
            message = f"页面筛选失败：{label}={value}"
            if strict:
                raise RuntimeError(message)
            detailed_message = f"{message}。已继续运行，本地规则继续兜底。"
            suggestion = "你可以在 BOSS 页面手动筛选到合适页面，再回到 GUI 直接点击开始运行。"
            log.warning("%s%s", detailed_message, suggestion)
            if emit_event:
                emit_event(
                    {
                        "group": str(group_name),
                        "value": value,
                        "status": "failed",
                        "message": detailed_message,
                        "suggestion": suggestion,
                    }
                )
    if clicked_any:
        await asyncio.sleep(1)


async def select_dropdown_option(label: str) -> None:
    """空 label 表示用 BOSS 默认推荐 feed，不主动选 tag。"""
    from boss_zhipin.website_oper import finding_jobs

    if not label:
        log.info("[select_dropdown_option] label 为空，沿用当前推荐 feed")
        return
    log.info("[select_dropdown_option] label=%r", label)

    log.info("  路径 1: 找推荐 tag chip ...")
    chip_xp = (
        "//*[contains(@class,'recommend-job-btn')"
        " and contains(@class,'has-tooltip')]"
    )
    chips = await finding_jobs._xpath_safe(chip_xp, timeout=3)
    log.info("    找到 %d 个 tag chip", len(chips))
    for el in chips:
        text = (el.text or "").strip()
        if label in text:
            log.info("    → 命中 %r，点击", text)
            await el.click()
            return

    log.info("  路径 2: 找下拉菜单触发器 ...")
    trigger = await finding_jobs._xpath_safe(
        "//*[@id='wrap']/div[2]/div[1]/div/div[1]/div", timeout=3
    )
    if trigger:
        log.info("    → 点开下拉")
        await trigger[0].click()
        await finding_jobs._xpath_safe(
            "//ul[contains(@class,'dropdown-expect-list')]", timeout=3
        )
        options = await finding_jobs._xpath_safe(
            f"//li[contains(text(), '{label}')]", timeout=3
        )
        if options:
            log.info("    → 命中下拉 option %r，点击", label)
            await options[0].click()
            return
        log.info("    下拉里没有 %r", label)
    else:
        log.info("    没找到下拉触发器")

    log.info("  路径 3: fallback —— 用 BOSS 默认的推荐 feed 继续（不主动选 tag）")
