""" 本地工具箱 - FastAPI 后端入口。

自动发现并装载 backend/tools 下的工具（磁盘清理为内置第一个工具）。
启动方式：
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 17650
或
    python scripts/run_dev.py
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from . import tools as _tools_pkg  # noqa: F401  (ensure tools bundled in frozen exe)
from .api import routes_system
from .core.config import APP_NAME
from .platform import platform, router as tools_router, setup_tools


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动清库存 + 退出时收尾。

    on_event 已废弃，未来 FastAPI 移除它就是导入期崩溃（30 秒空白窗口）；
    另外此前根本没有 shutdown：扫描线程与库连接随进程硬切。
    """
    from .core.scanner import controller as _scan_controller
    try:
        _scan_controller.prune_old_scans()
    except Exception:  # noqa: BLE001 清理失败不阻断启动
        pass
    yield
    try:
        _scan_controller.shutdown()
    except Exception:  # noqa: BLE001 退出的尽力而为不能反过来卡退出
        pass


app = FastAPI(title="磁盘清理助手", version=__version__, lifespan=lifespan)

_api_token = os.environ.get('DCA_API_TOKEN', '').strip()

# Electron 加载本仓库文件用的源：file:// 与 null 是打包/开发下的两种形态。
# 通配符 allow_headers=["*"] 在有凭据的 CORS 里语义宽松得没必要，收成实际用到的。
_ALLOWED_ORIGINS = ["file://", "null"]
_ALLOWED_HEADERS = ["content-type", "x-dca-token"]


@app.middleware('http')
async def require_local_api_token(request: Request, call_next):
    # Electron 启动后端时注入 token；独立开发/测试模式保持无 token。
    if _api_token and request.method != 'OPTIONS':
        exempt_paths = {'/api/health', '/openapi.json', '/docs', '/docs/oauth2-redirect', '/redoc'}
        if request.url.path not in exempt_paths and request.headers.get('x-dca-token') != _api_token:
            return JSONResponse(status_code=401, content={'detail': '缺少有效的本地 API token'})
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    # Electron 生产环境从 file:// 加载页面（打包后无 origin），开发模式是
    # http://localhost:< vite 端口>。这里收紧到这两类，其他源一律不带凭据放行。
    allow_origin_regex=r"^(file://|null|http://(localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["x-dca-token", "content-type"],
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
    # 实际挂上的端点数（不是 router 个数）：新 FastAPI 不在 app.routes 里展开
    # 嵌套路由，只有递归数才看得出是不是真的装载齐了
    "routers": n,
    # 装载失败的原因条数：不为 0 时界面/排查能立刻看出后端是半死的
    "load_errors": len(platform.import_errors),
}


@app.get("/api/health")
def health():
    return _health
