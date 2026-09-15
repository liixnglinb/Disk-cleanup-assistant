"""删除 API（P0）：默认回收站，永久删除为高级选项。"""
from fastapi import APIRouter, HTTPException

from ..core.delete_manager import permanent_delete as _permanent
from ..core.delete_manager import recycle as _recycle
from ..models.schemas import DeleteFilesRequest

router = APIRouter(prefix="/api/delete", tags=["delete"])


@router.post("/")
def delete_files(payload: DeleteFilesRequest):
    """默认移入回收站。payload.permanent=False（安全红线）。"""
    try:
        if payload.permanent:
            result = _permanent(payload.paths, restore_point=payload.restore_point)
        else:
            result = _recycle(payload.paths, restore_point=payload.restore_point)
        result['restore_point_requested'] = payload.restore_point
        result['restore_point_created'] = None if not payload.restore_point else result.get('restore_point_created')
        return result
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
