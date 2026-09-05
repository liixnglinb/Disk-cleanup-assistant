"""系统保护模块：从 config 汇总对外接口。
安全红线：系统目录硬锁定，UI 不可选，后端拒绝删除请求。
"""
from typing import List, Optional

from .config import (
    PROTECTED_RELATIVE,
    available_drives,
    is_protected_path,
    protected_absolute_paths,
    system_root,
    _norm,
)

__all__ = [
    "PROTECTED_RELATIVE",
    "ProtectedMatcher",
    "available_drives",
    "is_protected_path",
    "protected_absolute_paths",
    "system_root",
]


class ProtectedMatcher:
    """预先计算保护目录列表的高性能匹配器。

    扫描时对每个文件调用一次，避免反复 stat 所有盘符。
    """

    def __init__(self, paths: Optional[List[str]] = None):
        if paths is None:
            paths = protected_absolute_paths()
        self._list = [_norm(p) for p in paths]
        # 根目录盘符（绝不删除）
        self._roots = [_norm(f"{d}:\\") for d in ("ABC" + "DEFGHIJKLMNOPQRSTUVWXYZ")]

    def is_protected(self, path: str) -> bool:
        n = _norm(path)
        if not n:
            return False
        if len(n) == 2 and n[1] == ":" or n in self._roots:
            return True
        for prot in self._list:
            if n == prot or n.startswith(prot + "\\"):
                return True
        return False
