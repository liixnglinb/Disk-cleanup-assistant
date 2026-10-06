"""Pydantic 请求/响应模型。"""
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

# 单次批量操作的条数上限：扫描库有上百万行，paths 不设上限时
# verify_deletable 是 O(条数 × 会话数) 的逐条查库，一个恶意/误用的请求
# 就能把后端吊死。500 条足够界面「本页全选 + 几页」。
MAX_BATCH_PATHS = 500


def _clean_paths(v: List[str]) -> List[str]:
    if len(v) > MAX_BATCH_PATHS:
        raise ValueError(f"单次最多 {MAX_BATCH_PATHS} 条路径")
    if not any(str(p).strip() for p in v):
        raise ValueError("路径不能全为空")
    return v


class ScanStart(BaseModel):
    drive: str = Field(..., min_length=1, max_length=4)
    large_file_mb: Optional[int] = Field(default=None, ge=10, le=2048)


class ScanControl(BaseModel):
    scan_id: str


class FileQuery(BaseModel):
    scan_id: str
    category: Optional[str] = None
    # 不设上界时 min_size=10**30 会在比较里抛 OverflowError → 未处理 500
    min_size: int = Field(default=0, ge=0, le=10 ** 16)
    keyword: Optional[str] = Field(default=None, max_length=100)
    only_locked: Optional[bool] = None
    recommendation: Optional[str] = None
    ext: Optional[str] = None
    owner: Optional[str] = None
    needs_ai: Optional[bool] = None
    page: int = Field(default=0, ge=0, le=100000)
    page_size: int = Field(default=200, ge=1, le=1000)
    sort: str = "size_desc"


class DeleteFilesRequest(BaseModel):
    paths: List[str] = Field(..., min_length=1)
    permanent: bool = False  # 高级选项，安全红线默认 False
    restore_point: bool = False  # 删除前尝试创建系统还原点（需管理员权限）

    @field_validator("paths")
    @classmethod
    def _paths_ok(cls, v: List[str]) -> List[str]:
        return _clean_paths(v)


class DuplicateGroupSelect(BaseModel):
    keep_path: str
    to_delete: List[str] = Field(default_factory=list, min_length=0)
    permanent: bool = False

    @field_validator("to_delete")
    @classmethod
    def _to_delete_ok(cls, v: List[str]) -> List[str]:
        return v if not v else _clean_paths(v)


class CacheCleanRequest(BaseModel):
    paths: List[str] = Field(..., min_length=1)
    permanent: bool = False
    restore_point: bool = False

    @field_validator("paths")
    @classmethod
    def _paths_ok(cls, v: List[str]) -> List[str]:
        return _clean_paths(v)