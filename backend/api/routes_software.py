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
    """启动官方卸载程序（异步，用户在卸载向导中完成）。

    这个接口等价于"以当前用户执行任意命令"，所以 uninstall_string 必须与
    注册表登记的 UninstallString 逐字一致 —— 前端本来就是从列表里原样带回的，
    正常流程不受影响；伪造的命令在这里被挡下。
    """
    s = payload.uninstall_string.strip()
    if not s:
        raise HTTPException(status_code=400, detail="缺少卸载命令")
    from ..core import software as _sw
    allowed = {str(it.get("uninstall_string") or "").strip() for it in _sw.list_installed_software()}
    if s not in allowed:
        raise HTTPException(status_code=403, detail="卸载命令与注册表登记不一致，已拒绝执行")
    return software.launch_uninstall(s)


class ResidueRequest(BaseModel):
    name: str
    install_location: str = ""


@router.post("/residue")
def residue(payload: ResidueRequest):
    """扫描软件卸载后的残留文件/目录（只读，不执行删除）。"""
    items = software.scan_residue(payload.name, payload.install_location)
    total_bytes = sum(i["size"] for i in items)
    return {"items": items, "count": len(items), "total_bytes": total_bytes}
