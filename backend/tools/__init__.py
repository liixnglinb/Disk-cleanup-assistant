"""Tool package: one backend module per tool, each exporting a module-level TOOL.

When adding a tool, also add its static import below so PyInstaller can bundle it
into the single-file exe (runtime pkgutil discovery is not enough when frozen).
"""
from . import disk_cleanup  # noqa: F401