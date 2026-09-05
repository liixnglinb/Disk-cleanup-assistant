"""删除日志 API（P1）：列表 + 导出 CSV。"""
from fastapi import APIRouter
from fastapi.responses import FileResponse, PlainTextResponse

from ..core.audit_log import export_csv, list_logs

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/")
def get_logs():
    rows = list_logs()
    return {"items": rows, "total": len(rows)}


@router.get("/export")
def export(path: str = ""):
    target = export_csv(path or None)
    return FileResponse(target, filename="删除日志.csv", media_type="text/csv")
