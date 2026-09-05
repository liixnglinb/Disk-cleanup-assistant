"""出厂必备文件检测 API（只读检测，不执行修复）。"""
from fastapi import APIRouter

from ..core.factory_check import run_factory_check

router = APIRouter(prefix="/api/factory", tags=["factory"])


@router.get("/check")
def check():
    """检测本机出厂必备文件是否齐全，结果仅作参考。"""
    return run_factory_check()
