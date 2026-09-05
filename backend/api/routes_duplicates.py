"""重复文件检测 API（P1）。"""
from fastapi import APIRouter, HTTPException

from ..core.duplicates import find_duplicates
from ..core.scanner import controller

router = APIRouter(prefix="/api/duplicates", tags=["duplicates"])


@router.get("/find/{scan_id}")
def find(scan_id: str):
    session = controller._get(scan_id)
    if not session or not session.db_path.exists():
        raise HTTPException(status_code=404, detail="扫描不存在")
    groups = find_duplicates(str(session.db_path))
    total = sum(g["total_bytes"] for g in groups) - 0
    recoverable = sum(g["size"] * (len(g["files"]) - 1) for g in groups)
    return {"groups": groups, "group_count": len(groups), "recoverable_bytes": recoverable}
