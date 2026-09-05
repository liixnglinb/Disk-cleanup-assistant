"""文件查询 / 统计 API（P0/P1）：分页、分类、大文件、推荐清理过滤。"""
from fastapi import APIRouter, HTTPException

from ..core.scanner import controller
from ..models.schemas import FileQuery

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/query")
def query_files(payload: FileQuery):
    """分页查询，前端虚拟滚动分批拉取。sort=size_desc 时大文件标红依据。"""
    if controller.status(payload.scan_id) is None:
        raise HTTPException(status_code=404, detail="扫描不存在")
    return controller.query(
        scan_id=payload.scan_id,
        category=payload.category,
        min_size=payload.min_size,
        keyword=payload.keyword,
        only_locked=payload.only_locked,
        recommendation=payload.recommendation,
        ext=payload.ext,
        owner=payload.owner,
        needs_ai=payload.needs_ai,
        page=payload.page,
        page_size=payload.page_size,
        sort=payload.sort,
    )


@router.post("/select-all")
def select_all(payload: FileQuery):
    """按当前筛选返回全部匹配且非锁定的 path，供前端一键全选。"""
    if controller.status(payload.scan_id) is None:
        raise HTTPException(status_code=404, detail="扫描不存在")
    paths = controller.query_paths(
        scan_id=payload.scan_id,
        category=payload.category,
        min_size=payload.min_size,
        keyword=payload.keyword,
        only_locked=payload.only_locked,
        recommendation=payload.recommendation,
        ext=payload.ext,
        owner=payload.owner,
        needs_ai=payload.needs_ai,
        sort=payload.sort,
    )
    return {"paths": paths, "count": len(paths)}


@router.get("/statistics/{scan_id}")
def statistics(scan_id: str):
    st = controller.statistics(scan_id)
    if st is None:
        raise HTTPException(status_code=404, detail="扫描不存在")
    return st
