"""BOSS 搜索结果 API 直读：绕过 DOM 虚拟列表，按页枚举全部岗位。

实测 /web/geek/jobs 搜索页 DOM 只懒加载 ~30 张卡：滚动不加卡片、没有翻页
按钮、URL 的 page 参数也被无视（三重诊断确认）。但登录态下搜索 wapi 翻页
完全正常（page=1/2/3 返回不同岗位，hasMore=true）。这里在受控 tab 的页面
上下文里发同步 XHR（自动带登录 cookie），按页拿全量岗位，再逐个打开详情页
完成筛选和发送。
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit

import nodriver as uc

from boss_zhipin.website_oper import finding_jobs

log = logging.getLogger(__name__)

SEARCH_API_PATH = "/wapi/zpgeek/search/joblist.json"
PAGE_SIZE = 30

# 翻页时重设的参数；其余筛选参数（city/jobType/degree/industry/query 等）原样保留。
_DROP_PARAMS = frozenset({"page", "ka", "pageSize"})


@dataclass(frozen=True)
class ApiJob:
    """搜索接口返回的单条岗位（字段够本地筛选和详情页跳转用）。"""

    job_name: str
    encrypt_job_id: str
    brand_name: str
    city: str
    area_district: str
    business_district: str
    salary_desc: str
    job_labels: tuple[str, ...]
    skills: tuple[str, ...]
    job_degree: str
    boss_name: str
    boss_online: bool
    # 招聘方活跃描述（wapi 卡片偶带，如"刚刚活跃/本周活跃"）；可能缺失，
    # 缺失时 to_job_posting 会用 boss_online 隐含映射兜底。
    active_time_desc: str = ""


def search_query_from_url(url: str) -> str:
    """从搜索页 URL 提取筛选参数（丢掉分页参数），拼成 API query 串。"""
    params: list[tuple[str, str]] = [
        ("scene", "1"),
        ("sortType", "0"),
        ("default", "1"),
    ]
    if url:
        params += [
            (key, value)
            for key, value in parse_qsl(urlsplit(url).query, keep_blank_values=True)
            if key not in _DROP_PARAMS
        ]
    return urlencode(params)


def detail_url_of(job: ApiJob) -> str:
    return f"https://www.zhipin.com/job_detail/{job.encrypt_job_id}.html"


def parse_api_job(item: dict) -> ApiJob | None:
    encrypt_id = str(item.get("encryptJobId") or "").strip()
    job_name = str(item.get("jobName") or "").strip()
    if not encrypt_id or not job_name:
        return None
    labels = tuple(
        str(x).strip() for x in item.get("jobLabels") or [] if str(x).strip()
    )
    skills = tuple(str(x).strip() for x in item.get("skills") or [] if str(x).strip())
    return ApiJob(
        job_name=job_name,
        encrypt_job_id=encrypt_id,
        brand_name=str(item.get("brandName") or "").strip(),
        city=str(item.get("cityName") or "").strip(),
        area_district=str(item.get("areaDistrict") or "").strip(),
        business_district=str(item.get("businessDistrict") or "").strip(),
        salary_desc=str(item.get("salaryDesc") or "").strip(),
        job_labels=labels,
        skills=skills,
        job_degree=str(item.get("jobDegree") or "").strip(),
        boss_name=str(item.get("bossName") or "").strip(),
        boss_online=bool(item.get("bossOnline")),
        # 乐观解析：字段不存在就是空串，不炸（真实字段名以 wapi 实测为准）
        active_time_desc=str(item.get("activeTimeDesc") or "").strip(),
    )


def to_job_posting(job: ApiJob, description: str = "") -> finding_jobs.JobPosting:
    """映射成主流程用的 JobPosting；description 由详情页补齐。"""
    location = "·".join(
        part for part in (job.city, job.area_district, job.business_district) if part
    )
    # 活跃状态（三阶段引擎·机制三 2026-10-13）：
    # - wapi 卡片的 activeTimeDesc（如"刚刚活跃/本周活跃"）最真实，优先用；
    # - 缺失时 bossOnline=True 意味着招聘方**此刻在线**——隐含"至少今日
    #   活跃"，展开成三档标签让 contains 匹配对任一梯队选值都放行；
    # - 都没有 → 空串（上游 match 链会走缺状态优雅降级，不误杀）。
    boss_active_status = job.active_time_desc or (
        "在线 刚刚活跃 今日活跃" if job.boss_online else ""
    )
    return finding_jobs.JobPosting(
        title=job.job_name,
        description=description,
        company=job.brand_name,
        location=location,
        salary=job.salary_desc,
        tags=[*job.job_labels, *job.skills],
        boss_name=job.boss_name,
        boss_active_status=boss_active_status,
        education=job.job_degree,
        detail_url=detail_url_of(job),
    )


def _search_api_js(query: str, page: int) -> str:
    """页面上下文里同步 XHR 搜索接口（自动带登录 cookie），返回 JSON 文本。

    2026-10-17 二次实测加固：同步 XHR 在网络层被拒（风控掐连接）时会抛
    JS 异常，nodriver evaluate 把异常吞成 None——上层只能看到含糊的
    「无有效响应」，无法定位平台到底做了什么。这里 try/catch 包住，
    异常与 HTTP 状态码都以结构化 JSON 带回（code=xhr_error / http_XXX），
    下次再被拒日志会显示真实原因。
    """
    return (
        "(() => { try {"
        " const x = new XMLHttpRequest();"
        f" x.open('GET', '{SEARCH_API_PATH}?{query}&page={page}&pageSize={PAGE_SIZE}', false);"
        " x.send();"
        " if (x.status !== 200)"
        "   return JSON.stringify({code: 'http_' + x.status, message: 'HTTP 状态码异常'});"
        " return x.responseText;"
        " } catch (e) {"
        " return JSON.stringify({code: 'xhr_error', message: String(e),"
        " status: (typeof x !== 'undefined' && x) ? x.status : 0});"
        " } })()"
    )


async def fetch_search_page(tab: uc.Tab, query: str, page: int) -> list[ApiJob]:
    """拉搜索结果第 ``page`` 页。接口异常/风控时抛 RuntimeError。

    2026-10-18 事故修复（三路审查）：本函数 docstring 承诺"接口异常抛
    RuntimeError"，但 ``asyncio.wait_for`` 超时抛的是 ``asyncio.TimeoutError``、
    浏览器断开抛的是 ``OSError``（ConnectionRefused 等）——两者都不是
    RuntimeError，调用方 ``search_api_flow`` 只 ``except RuntimeError``，
    于是直接穿透到 ``runner._wrap`` 把整轮巡航打死（与 16:00 详情页 JD
    超时同款事故，这是搜索页这个漏修的入口）。

    这里在源头把两类异常收敛成 RuntimeError（契约兑现）：
    - 超时 → 文案含「无有效响应」，走调用方既有的"冷却+刷新+重试一次"自愈；
    - 连接断开 → 文案不含该关键词，走调用方的优雅停机分支（浏览器都关了，
      重试没有意义）。
    """
    try:
        # 同步 XHR 会冻结页面主线程，BOSS 限流时可能长时间不返回，包超时兜底。
        raw = await asyncio.wait_for(
            tab.evaluate(_search_api_js(query, page)), timeout=30
        )
    except asyncio.TimeoutError as e:
        raise RuntimeError(
            "搜索接口无有效响应（请求超时 30s，页面可能被验证码/风控 JS 卡住，可刷新重试）"
        ) from e
    except OSError as e:
        # 注意：Python 3.11+ 的 asyncio.TimeoutError 也是 OSError 子类，
        # 所以上面必须先捕 TimeoutError，再捕 OSError（顺序不能反）。
        raise RuntimeError(
            f"浏览器连接已断开（{type(e).__name__}: {e}），本轮巡航中止"
        ) from e
    if isinstance(raw, str):
        try:
            data: object = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"搜索接口返回非 JSON（可能触发验证码）: {e}") from e
    else:
        data = raw
    if not isinstance(data, dict) or data.get("code") != 0:
        if not isinstance(data, dict):
            # evaluate 没有返回可解析对象（2026-10-17 实测事故：单元轮换整页
            # 导航后首个 wapi XHR 偶发拿到空值——页面执行上下文/风控令牌未
            # 就绪）。独立错误签名让上层能识别这种"可刷新自愈"的异常，
            # 与平台语义错误（code=37/19…）区分：前者重试有意义，后者没有。
            raise RuntimeError("搜索接口无有效响应（页面上下文可能未就绪，可刷新重试）")
        code = data.get("code")
        # 透传平台返回的人话原因（2026-10-13：code=37 限流时用户只看到
        # 冰冷代号，不知道是"请求过于频繁"——把 message 带上）
        detail = ""
        if isinstance(data, dict):
            detail = str(data.get("message") or data.get("msg") or "").strip()
        suffix = f"（{detail}）" if detail else ""
        raise RuntimeError(f"搜索接口返回异常 code={code}{suffix}")
    zpData = data.get("zpData") or {}
    jobs = [
        parsed
        for item in (zpData.get("jobList") or [])
        if (parsed := parse_api_job(item))
    ]
    log.info("[job-api] 第 %d 页拉到 %d 个岗位", page, len(jobs))
    return jobs
