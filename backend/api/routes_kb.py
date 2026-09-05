"""目录百科 / 清理知识库 API。

- GET /api/kb/folders   返回全部知识库条目（含本机是否存在）
- GET /api/kb/categories 返回分类、建议、风险的中文标签
- GET /api/cache/overview 缓存清理总览（合计/建议分布/依附统计）
"""
from fastapi import APIRouter, Query

from ..core.cache_dirs import cache_overview, candidate_cache_dirs
from ..core.cleanup_kb import (
    CATEGORY_LABELS,
    RECOMMENDATION_LABELS,
    RISK_LABELS,
    kb_entries,
)

router = APIRouter(prefix="/api/kb", tags=["kb"])


@router.get("/folders")
def folders(
    category: str = Query(""),
    recommendation: str = Query(""),
    keyword: str = Query(""),
    only_existing: bool = Query(False),
):
    """返回知识库条目。可按分类/建议/关键词过滤，可仅看本机存在的。"""
    items = kb_entries(only_existing=only_existing)
    if category:
        items = [i for i in items if i["category"] == category]
    if recommendation:
        items = [i for i in items if i["recommendation"] == recommendation]
    if keyword:
        kw = keyword.lower()
        items = [i for i in items if kw in i["name"].lower()
                 or kw in (i.get("app") or "").lower()
                 or kw in i["description"].lower()]
    return {"items": items, "total": len(items)}


@router.get("/categories")
def categories():
    return {
        "categories": CATEGORY_LABELS,
        "recommendations": RECOMMENDATION_LABELS,
        "risks": RISK_LABELS,
    }


@router.get("/cache-candidates")
def cache_candidates():
    """（兼容旧前端）缓存候选，字段已扩展。"""
    return {"items": candidate_cache_dirs()}
