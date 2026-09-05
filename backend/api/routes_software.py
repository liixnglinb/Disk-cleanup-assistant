"""已安装软件 API：列表 / 图标 / 卸载 / 残留扫描。"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..core import software

router = APIRouter(prefix="/api/software", tags=["software"])


@router.get("/installed")
def installed_software(include_empty: bool = Query(True)):
    return {"items": software.list_installed_software(include_empty=include_empty)}


@router.get("/icon")
def icon(name: str = Query(..., min_length=1)):
    """按软件显示名提取真实图标，返回 PNG base64（可拼成 data URL）。"""
    item = software.find_software_by_name(name)
    if not item:
        raise HTTPException(status_code=404, detail="软件不存在")
    b64 = software.get_software_icon(item)
    if not b64:
        raise HTTPException(status_code=404, detail="无法提取图标")
    return {"name": name, "icon": b64}


class UninstallRequest(BaseModel):
    uninstall_string: str


@router.post("/uninstall")
def uninstall(payload: UninstallRequest):
    """启动官方卸载程序（异步，用户在卸载向导中完成）。"""
    if not payload.uninstall_string.strip():
        raise HTTPException(status_code=400, detail="缺少卸载命令")
    return software.launch_uninstall(payload.uninstall_string)


class ResidueRequest(BaseModel):
    name: str
    install_location: str = ""


@router.post("/residue")
def residue(payload: ResidueRequest):
    """扫描软件卸载后的残留文件/目录（只读，不执行删除）。"""
    items = software.scan_residue(payload.name, payload.install_location)
    total_bytes = sum(i["size"] for i in items)
    return {"items": items, "count": len(items), "total_bytes": total_bytes}
