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
    version: str = "0.1.2"
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

    def register(self, spec: ToolSpec) -> None:
        self._tools[spec.id] = spec

    def get(self, tool_id: str) -> Optional[ToolSpec]:
        return self._tools.get(tool_id)

    def all(self) -> List[ToolSpec]:
        return [s for s in self._tools.values() if s.enabled]

    def manifests(self) -> List[dict]:
        return [s.manifest() for s in self.all()]

    def install_routers(self, app: Any) -> int:
        """Include each tool's router(s). Returns number of routers attached."""
        count = 0
        for spec in self.all():
            if not spec.include_router:
                continue
            routers = spec.include_router()
            if routers is None:
                continue
            if isinstance(routers, APIRouter):
                routers = [routers]
            for r in routers:
                app.include_router(r)
                count += 1
        return count

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
            except Exception:
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


def setup_tools(app: Any) -> int:
    """Import the tools package then discover & attach routers. Returns router count."""
    import backend.tools  # noqa: F401  (also forces PyInstaller to bundle the package)
    platform.discover_package("backend.tools")
    return platform.install_routers(app)