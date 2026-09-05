"""System / config helpers: drives + constants for the frontend."""
import os
import shutil
import subprocess
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.config import LARGE_FILE_MB, PAGE_SIZE, available_drives

router = APIRouter(prefix="/api", tags=["system"])


class RevealRequest(BaseModel):
    path: str


@router.post("/system/reveal")
def reveal_path(payload: RevealRequest):
    """在资源管理器中定位并选中指定路径（只读操作，不修改任何文件）。"""
    path = (payload.path or "").strip()
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=400, detail="路径不存在: " + path)
    try:
        subprocess.Popen(
            ["explorer", "/select,", path],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return {"ok": True, "path": path}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="无法打开资源管理器: " + str(exc))


def _drive_stats() -> List[dict]:
    out = []
    for drive in available_drives():
        try:
            usage = shutil.disk_usage(drive + "\\")
            out.append({
                "drive": drive,
                "label": drive,
                "total": usage.total,
                "free": usage.free,
            })
        except OSError:
            out.append({"drive": drive, "label": drive, "total": 0, "free": 0})
    return out


@router.get("/drives")
def drives():
    return {"items": _drive_stats()}


@router.get("/config")
def config():
    return {
        "app": "disk-cleanup-assistant",
        "large_file_mb": LARGE_FILE_MB,
        "page_size": PAGE_SIZE,
    }