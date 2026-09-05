"""Pydantic 请求/响应模型。"""
from typing import List, Optional

from pydantic import BaseModel, Field


class ScanStart(BaseModel):
    drive: str = Field(..., min_length=1, max_length=4)
    large_file_mb: Optional[int] = Field(default=None, ge=10, le=2048)


class ScanControl(BaseModel):
    scan_id: str


class FileQuery(BaseModel):
    scan_id: str
    category: Optional[str] = None
    min_size: int = 0
    keyword: Optional[str] = None
    only_locked: Optional[bool] = None
    recommendation: Optional[str] = None
    ext: Optional[str] = None
    owner: Optional[str] = None
    needs_ai: Optional[bool] = None
    page: int = 0
    page_size: int = Field(default=200, ge=1, le=1000)
    sort: str = "size_desc"


class DeleteFilesRequest(BaseModel):
    paths: List[str] = Field(..., min_length=1)
    permanent: bool = False  # 高级选项，安全红线默认 False
    restore_point: bool = False  # 删除前尝试创建系统还原点（需管理员权限）


class DuplicateGroupSelect(BaseModel):
    keep_path: str
    to_delete: List[str] = Field(default_factory=list, min_length=0)
    permanent: bool = False


class CacheCleanRequest(BaseModel):
    paths: List[str] = Field(..., min_length=1)
    permanent: bool = False
    restore_point: bool = False