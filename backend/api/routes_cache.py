"""缓存一键清理 API（P1）。"""
from fastapi import APIRouter, HTTPException

from ..core.cache_dirs import cache_overview, candidate_cache_dirs, dir_size_bytes
from ..core.delete_manager import create_restore_point, permanent_delete, recycle
from ..core.scanner import ScanDbError, controller as scan_controller
from ..models.schemas import CacheCleanRequest

router = APIRouter(prefix="/api/cache", tags=["cache"])


def _reject_unknown_cache_paths(paths):
    """缓存清理的路径溯源：候选白名单（服务端固定列表）或扫描库中未锁定的路径。

    /api/cache/clean 与 /api/delete 一样等价于"删任意目录"，不能接受调用方
    随手构造的路径。缓存候选本身不在扫描库里，所以白名单来自服务端固定列表，
    而不是信任调用方。
    """
    try:
        not_found, locked = scan_controller.verify_deletable(paths)
    except ScanDbError:
        # 扫描库读不到时，缓存候选白名单这一路仍然有效，不能因为溯源失败就拒绝。
        not_found, locked = list(paths), []
    if locked:
        return [f"{p}（扫描时被标记为系统锁定，拒绝删除）" for p in locked]
    if not not_found:
        return []
    cands = [str(c.get("path") or "").rstrip("\\").lower() for c in candidate_cache_dirs()]
    cands = [c for c in cands if c]

    def covered(p: str) -> bool:
        pl = p.rstrip("\\").lower()
        return any(pl == c or pl.startswith(c + "\\") for c in cands)

    return [f"{p}（不在缓存候选白名单或扫描结果中，拒绝删除）" for p in not_found if not covered(p)]


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
    unknown = _reject_unknown_cache_paths(payload.paths)
    if unknown:
        shown = "；".join(unknown[:3]) + (f" 等共 {len(unknown)} 项" if len(unknown) > 3 else "")
        raise HTTPException(status_code=403, detail=f"以下路径未通过清理校验：{shown}")
    restore_point_created = None
    if payload.restore_point:
        restore_point_created = create_restore_point()
        if not restore_point_created:
            raise HTTPException(
                status_code=409,
                detail="还原点创建失败（可能需要管理员权限或未开启系统保护）。已中止清理，未删除任何文件。",
            )
    try:
        if payload.permanent:
            return permanent_delete(payload.paths, restore_point=False)
        result = recycle(payload.paths, restore_point=False)
        result['restore_point_requested'] = payload.restore_point
        result['restore_point_created'] = restore_point_created
        return result
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"清理失败：{exc.strerror or exc}")
