""" Disk Cleanup tool - the first bundled tool of the local-tools platform. """
from fastapi import APIRouter

from ..api import (
    routes_ai,
    routes_cache,
    routes_delete,
    routes_duplicates,
    routes_factory,
    routes_files,
    routes_kb,
    routes_logs,
    routes_scan,
    routes_software,
)
from ..platform import ToolSpec

__version__ = "0.2.1"


def _router() -> APIRouter:
    r = APIRouter()
    for rr in (
        routes_scan.router,
        routes_files.router,
        routes_delete.router,
        routes_software.router,
        routes_cache.router,
        routes_duplicates.router,
        routes_logs.router,
        routes_kb.router,
        routes_factory.router,
        routes_ai.router,
    ):
        r.include_router(rr)
    return r


TOOL = ToolSpec(
    id="disk-cleanup",
    name="磁盘清理助手",
    description="扫描盘符、智能分类、回收站安全删除，释放磁盘空间。",
    icon="\U0001F9F9",
    version=__version__,
    frontend_panel="disk-cleanup",
    builtin=True,
    include_router=_router,
)