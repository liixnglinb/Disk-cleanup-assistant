"""全局配置：端口、保护目录白名单、扫描默认参数。"""
import os
import socket
from pathlib import Path
from typing import List

APP_NAME = "disk-cleanup-assistant"

# 自动端口范围
PORT_MIN = 17650
PORT_MAX = 17799

# 大数据页大小（前端虚拟滚动分批拉取）
PAGE_SIZE = 200
# 大文件阈值（MB）
LARGE_FILE_MB = 100


def find_free_port() -> int:
    """在当前进程查找一个可用端口。"""
    for port in range(PORT_MIN, PORT_MAX):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port in range")


def system_root() -> Path:
    env = os.environ.get("SystemRoot")
    if env and Path(env).is_absolute():
        return Path(env)
    return Path("C:/Windows")


def _norm(path: str) -> str:
    return str(Path(path)).lower().replace("/", "\\").rstrip("\\")


# ---------------------------------------------------------------
# 系统保护目录（UI 灰掉、后端拒绝删除）
# ---------------------------------------------------------------
PROTECTED_RELATIVE: List[str] = [
    "Windows",
    "Program Files",
    "Program Files (x86)",
    "ProgramData",
    "boot",
    "Recovery",
    "$Recycle.Bin",
]


def available_drives() -> List[str]:
    """返回当前存在的盘符，如 ['C:', 'D:']。"""
    return [f"{d}:" for d in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if os.path.exists(f"{d}:\\")]


def protected_absolute_paths() -> List[str]:
    """返回所有盘符下的绝对保护目录（带盘符前缀），用于前缀匹配。"""
    out = set()
    # 每个盘符 + 关系目录
    for drive in available_drives():
        for rel in PROTECTED_RELATIVE:
            out.add(_norm(f"{drive}\\{rel}"))
    # 系统根目录本身和系统盘 Windows
    root = _norm(system_root())
    out.add(root)
    out.add(_norm(f"{system_root()}\\Windows"))
    return sorted(out)


def is_protected_path(path: str) -> bool:
    """路径命中系统保护白名单（自身或父目录前缀匹配）。"""
    n = _norm(path)
    if not n:
        return False
    # 根目录绝不删除
    if len(n) == 2 and n[1] == ":":
        return True
    for prot in protected_absolute_paths():
        if n == prot or n.startswith(prot + "\\"):
            return True
    return False


def is_system_file_extension(ext: str) -> bool:
    """扩展名级系统文件标记（UI 提示用，不用于强制锁定）。"""
    return ext.lower() in (".sys", ".dll", ".exe", ".drv", ".mui", ".cat", ".manifest")


def log_dir() -> Path:
    # 测试隔离：允许通过环境变量指定数据目录，避免污染真实扫描数据
    env_override = os.environ.get("DISK_CLEANUP_LOG_DIR")
    if env_override:
        d = Path(env_override)
    else:
        base = Path(os.environ.get("APPDATA", str(Path.home())))
        d = base / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d
