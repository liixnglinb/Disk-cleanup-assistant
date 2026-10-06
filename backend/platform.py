"""Tool platform: registry + plugin discovery for the local-toolbox app.

Discovery is explicit (call setup_platform) NOT at import time, because tools
import `platform` (circular) and PyInstaller needs a deterministic order.
"""
import importlib
import pkgutil
import types
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter


@dataclass
class ToolSpec:
    id: str                          # stable key, e.g. "disk-cleanup"
    name: str                        # display name
    description: str = ""
    icon: str = "\u25c6"
    version: str = "0.5.6"
    frontend_panel: str = ""         # key of the React panel in src/tools/registry.tsx
    enabled: bool = True
    builtin: bool = False
    include_router: Optional[Callable[[], Any]] = None  # returns APIRouter or list[APIRouter]
    meta: Dict[str, Any] = field(default_factory=dict)

    def manifest(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "version": self.version,
            "frontend_panel": self.frontend_panel,
            "enabled": self.enabled,
            "builtin": self.builtin,
            **self.meta,
        }


class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolSpec] = {}
        # 装载失败必须留痕：静默 continue 会让 /api/health 报 200 而界面全瞎
        self.import_errors: List[str] = []

    def register(self, spec: ToolSpec) -> None:
        self._tools[spec.id] = spec

    def get(self, tool_id: str) -> Optional[ToolSpec]:
        return self._tools.get(tool_id)

    def all(self) -> List[ToolSpec]:
        return [s for s in self._tools.values() if s.enabled]

    def manifests(self) -> List[dict]:
        return [s.manifest() for s in self.all()]

    def install_routers(self, app: Any) -> int:
        """Include each tool's router(s) and count the *real* endpoints.

        include_router() 的返回值没有意义，端点也不在 app.routes 里（新版 FastAPI
        会把嵌套 router 存成 _IncludedRouter 并延迟展开），所以只有遍历 router
        自己的 routes 才能看出"到底挂上了几个接口"。
        """
        count = 0
        for spec in self.all():
            if not spec.include_router:
                continue
            try:
                routers = spec.include_router()
                if routers is None:
                    continue
                if isinstance(routers, APIRouter):
                    routers = [routers]
                for r in routers:
                    app.include_router(r)
                    count += self._endpoint_count(r)
            except Exception as exc:  # noqa: BLE001
                self.import_errors.append(f"{spec.id}: {type(exc).__name__}: {exc}")
        return count

    @staticmethod
    def _endpoint_count(router: APIRouter) -> int:
        """递归数出路由里的实际端点。

        新版 FastAPI 的 include_router() 不展开端点，而是在父路由上放一个
        不透明的 _IncludedRouter：真正的接口在它 effective_candidates() 返回的
        上下文里（有 endpoint 和 path），而 .routes 拿不到东西。只数一边会数出
        0，"零路由"闸门就永远在误报。
        """

        def _count(node: Any) -> int:
            if isinstance(node, APIRouter):
                return sum(_count(x) for x in getattr(node, "routes", []))
            if hasattr(node, "endpoint"):                     # APIRoute / 生效上下文
                return 1
            cands = getattr(node, "effective_candidates", None)
            if callable(cands):
                return len([c for c in cands() if hasattr(c, "endpoint")])
            return 0

        return sum(_count(r) for r in getattr(router, "routes", []))

    def discover_package(self, package: str = "backend.tools") -> int:
        """Discover module-level TOOL specs. Returns how many were registered.

        Works both from source and inside a PyInstaller-frozen exe:
          1. static: modules imported by the package __init__ (via TOOL attr)
          2. dynamic: pkgutil scanning of the package path (source mode only)
        """
        count = 0
        pkg = importlib.import_module(package)
        for name in dir(pkg):
            obj = getattr(pkg, name)
            if isinstance(obj, types.ModuleType):
                spec = getattr(obj, "TOOL", None)
                if isinstance(spec, ToolSpec) and spec.id not in self._tools:
                    self.register(spec)
                    count += 1
        for mod in pkgutil.iter_modules(pkg.__path__):
            if mod.name.startswith("_"):
                continue
            try:
                imported = importlib.import_module(f"{package}.{mod.name}")
            except Exception as exc:  # noqa: BLE001
                self.import_errors.append(f"{package}.{mod.name}: {type(exc).__name__}: {exc}")
                continue
            spec = getattr(imported, "TOOL", None)
            if isinstance(spec, ToolSpec) and spec.id not in self._tools:
                self.register(spec)
                count += 1
        return count


platform = ToolRegistry()

# public metadata endpoints
router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("")
def list_tools() -> dict:
    return {"items": platform.manifests(), "count": len(platform.manifests())}


@router.get("/{tool_id}")
def tool_detail(tool_id: str) -> dict:
    spec = platform.get(tool_id)
    if not spec:
        return {"error": "not found"}
    return spec.manifest()


def ensure_tools_loaded(registered: int, routers: int, errors: List[str]) -> int:
    """装载闸门：有工具却没挂上任一路由，等于界面全瞎，不能算启动成功。"""
    if routers == 0:
        detail = "; ".join(errors[:3]) if errors else "no routers attached"
        raise RuntimeError(
            f"工具装载失败（tools={registered}, routers=0）：{detail}"
        )
    return routers


def setup_tools(app: Any) -> int:
    """Import the tools package then discover & attach routers. Returns router count."""
    import backend.tools  # noqa: F401  (also forces PyInstaller to bundle the package)
    registered = platform.discover_package("backend.tools")
    routers = platform.install_routers(app)
    return ensure_tools_loaded(registered, routers, platform.import_errors)
