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
    )


def to_job_posting(job: ApiJob, description: str = "") -> finding_jobs.JobPosting:
    """映射成主流程用的 JobPosting；description 由详情页补齐。"""
    location = "·".join(
        part for part in (job.city, job.area_district, job.business_district) if part
    )
    return finding_jobs.JobPosting(
        title=job.job_name,
        description=description,
        company=job.brand_name,
        location=location,
        salary=job.salary_desc,
        tags=[*job.job_labels, *job.skills],
        boss_name=job.boss_name,
        boss_active_status="在线" if job.boss_online else "",
        education=job.job_degree,
        detail_url=detail_url_of(job),
    )


def _search_api_js(query: str, page: int) -> str:
    """页面上下文里同步 XHR 搜索接口（自动带登录 cookie），返回 JSON 文本。"""
    return (
        "(() => { const x = new XMLHttpRequest();"
        f" x.open('GET', '{SEARCH_API_PATH}?{query}&page={page}&pageSize={PAGE_SIZE}', false);"
        " x.send(); return x.responseText; })()"
    )


async def fetch_search_page(tab: uc.Tab, query: str, page: int) -> list[ApiJob]:
    """拉搜索结果第 ``page`` 页。接口异常/风控时抛 RuntimeError。"""
    # 同步 XHR 会冻结页面主线程，BOSS 限流时可能长时间不返回，包超时兜底。
    raw = await asyncio.wait_for(
        tab.evaluate(_search_api_js(query, page)), timeout=30
    )
    if isinstance(raw, str):
        try:
            data: object = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"搜索接口返回非 JSON（可能触发验证码）: {e}") from e
    else:
        data = raw
    if not isinstance(data, dict) or data.get("code") != 0:
        code = data.get("code") if isinstance(data, dict) else "?"
        raise RuntimeError(f"搜索接口返回异常 code={code}")
    zpData = data.get("zpData") or {}
    jobs = [
        parsed
        for item in (zpData.get("jobList") or [])
        if (parsed := parse_api_job(item))
    ]
    log.info("[job-api] 第 %d 页拉到 %d 个岗位", page, len(jobs))
    return jobs
