import asyncio
from boss_zhipin.website_oper.finding_jobs import (
    BOSS_MAX_CITIES_PER_BATCH,
    get_platform_city_chunks,
    rotate_next_city_batch,
)


def test_get_platform_city_chunks():
    # 4 个及以内不超限
    cities_small = ["北京", "上海", "广州"]
    chunks_small = get_platform_city_chunks(cities_small, BOSS_MAX_CITIES_PER_BATCH)
    assert len(chunks_small) == 1
    assert chunks_small[0] == ["北京", "上海", "广州"]

    # 10 个城市切为 3 批：[4, 4, 2]
    cities_large = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京", "西安", "苏州"]
    chunks_large = get_platform_city_chunks(cities_large, BOSS_MAX_CITIES_PER_BATCH)
    assert len(chunks_large) == 3
    assert chunks_large[0] == ["北京", "上海", "广州", "深圳"]
    assert chunks_large[1] == ["杭州", "成都", "武汉", "南京"]
    assert chunks_large[2] == ["西安", "苏州"]


def test_city_rotation_without_excess():
    async def _run():
        filters = {"city": {"enabled": True, "values": ["北京", "上海"]}}
        rotated = await rotate_next_city_batch(filters)
        assert rotated is False

    asyncio.run(_run())
