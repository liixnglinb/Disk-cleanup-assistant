"""缓存一键清理 API（P1）。"""
from fastapi import APIRouter, HTTPException

from ..core.cache_dirs import cache_overview, candidate_cache_dirs, dir_size_bytes
from ..core.delete_manager import permanent_delete, recycle
from ..models.schemas import CacheCleanRequest

router = APIRouter(prefix="/api/cache", tags=["cache"])


@router.get("/candidates")
def list_candidates():
    return {"items": candidate_cache_dirs()}


@router.get("/overview")
def overview(force: bool = False):
    return cache_overview(force=force)


@router.post("/size")
def calc_size(payload: CacheCleanRequest):
    sizes = []
    for p in payload.paths:
        sizes.append({"path": p, "bytes": dir_size_bytes(p)})
    return {"items": sizes}


@router.post("/clean")
def clean(payload: CacheCleanRequest):
    try:
        if payload.permanent:
            return permanent_delete(payload.paths, restore_point=payload.restore_point)
        return recycle(payload.paths, restore_point=payload.restore_point)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
