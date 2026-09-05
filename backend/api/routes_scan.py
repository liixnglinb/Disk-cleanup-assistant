"""扫描相关 API（P0）：开始 / 暂停 / 继续 / 取消 / 状态。"""
from fastapi import APIRouter, HTTPException

from ..core.scanner import controller
from ..models.schemas import ScanControl, ScanStart

router = APIRouter(prefix="/api/scan", tags=["scan"])


@router.post("/start")
def start_scan(payload: ScanStart):
    drive = payload.drive.strip()
    if not drive:
        raise HTTPException(status_code=400, detail="请选择盘符")
    try:
        scan_id = controller.start(drive, large_file_mb=payload.large_file_mb)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "scan_id": scan_id, "message": "扫描已启动"}


@router.get("/status/{scan_id}")
def scan_status(scan_id: str):
    st = controller.status(scan_id)
    if st is None:
        raise HTTPException(status_code=404, detail="扫描不存在")
    return st


@router.get("/recent")
def recent_scan():
    """返回最近一次完成的扫描（后端/软件重启后用于自动恢复上次扫描结果）。"""
    scan_id = controller.recent_scan_id()
    if scan_id is None:
        return {"scan_id": None, "exists": False}
    st = controller.status(scan_id)
    if st is None:
        return {"scan_id": None, "exists": False}
    return {"scan_id": scan_id, "exists": True, "drive": st.get("drive"), "status": st.get("status")}


@router.post("/pause")
def pause(payload: ScanControl):
    return controller.pause(payload.scan_id)


@router.post("/resume")
def resume(payload: ScanControl):
    return controller.resume(payload.scan_id)


@router.post("/cancel")
def cancel(payload: ScanControl):
    return controller.cancel(payload.scan_id)
