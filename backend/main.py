""" 本地工具箱 - FastAPI 后端入口。

自动发现并装载 backend/tools 下的工具（磁盘清理为内置第一个工具）。
启动方式：
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 17650
或
    python scripts/run_dev.py
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from . import tools as _tools_pkg  # noqa: F401  (ensure tools bundled in frozen exe)
from .api import routes_system
from .core.config import APP_NAME
from .platform import platform, router as tools_router, setup_tools

app = FastAPI(title="本地工具箱", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["file://", "null"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tool-agnostic system helpers (drives / config) usable by any tool
app.include_router(routes_system.router)

# Auto-discovered tools (currently: disk-cleanup)
app.include_router(tools_router)
n = setup_tools(app)

# expose installed tools in /api/health for diagnostics
_health = {
    "ok": True,
    "app": "local-toolbox",
    "version": __version__,
    "tools": len(platform.manifests()),
    "routers": n,
}


@app.get("/api/health")
def health():
    return _health