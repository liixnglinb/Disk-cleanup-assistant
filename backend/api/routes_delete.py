"""删除 API（P0）：默认回收站，永久删除为高级选项。"""
from fastapi import APIRouter, HTTPException

from ..core.delete_manager import create_restore_point
from ..core.delete_manager import permanent_delete as _permanent
from ..core.delete_manager import recycle as _recycle
from ..core.scanner import ScanDbError, controller as scan_controller
from ..models.schemas import DeleteFilesRequest

router = APIRouter(prefix="/api/delete", tags=["delete"])


@router.post("/")
def delete_files(payload: DeleteFilesRequest):
    """默认移入回收站。payload.permanent=False（安全红线）。

    两道闸都在路由层做（core 保持纯机制、可单测）：
    1. 路径必须能在扫描库中溯源且未被锁定 —— 否则本地任何进程直调此接口
       都能让后端删任意目录（_reject_protected 只是前缀黑名单，防不住
       C:\\Users\\<user> 这类，也防不住 8.3 短名绕过）。
    2. 用户勾选了"创建还原点"但创建失败时中止删除 —— 静默继续会让用户
       以为有后悔药，实际没有。
    """
    try:
        not_found, locked = scan_controller.verify_deletable(payload.paths)
    except ScanDbError as exc:
        # 读不到扫描库时绝不能报 403"路径不合法"——那是把系统问题说成用户问题。
        raise HTTPException(status_code=503, detail=str(exc))
    if not_found or locked:
        msgs = [f"{p}（不在任何扫描结果中，拒绝删除）" for p in not_found[:3]]
        msgs += [f"{p}（扫描时被标记为系统锁定，拒绝删除）" for p in locked[:3]]
        total = len(not_found) + len(locked)
        raise HTTPException(
            status_code=403,
            detail=f"以下路径未通过删除校验：{'；'.join(msgs)}" + (f" 等共 {total} 项" if total > 6 else ""),
        )

    restore_point_created = None
    if payload.restore_point:
        restore_point_created = create_restore_point()
        if not restore_point_created:
            raise HTTPException(
                status_code=409,
                detail="还原点创建失败（可能需要管理员权限或未开启系统保护）。已中止删除，未删除任何文件。",
            )

    try:
        if payload.permanent:
            result = _permanent(payload.paths, restore_point=False)
        else:
            result = _recycle(payload.paths, restore_point=False)
        result['restore_point_requested'] = payload.restore_point
        result['restore_point_created'] = restore_point_created
        return result
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except OSError as exc:
        # 目标在扫描之后被移动/重命名、路径含非法字符、卷已断开等，都是可预期
        # 的 IO 失败：给用户一个原因，而不是一坨未处理异常。
        raise HTTPException(status_code=400, detail=f"删除失败：{exc.strerror or exc}")
