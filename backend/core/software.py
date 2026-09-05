"""已安装软件检测与管理：读取注册表 Uninstall 项（只读）。

能力：
1. 列出已装软件（过滤系统组件）
2. 提取软件真实图标（DisplayIcon / 安装目录 exe → PNG base64，本地缓存）
3. 启动官方卸载程序（直接卸载）
4. 卸载后扫描残留文件/目录
"""
import base64
import hashlib
import os
import re
import shlex
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from winreg import (
    HKEY_CURRENT_USER,
    HKEY_LOCAL_MACHINE,
    KEY_READ,
    OpenKey,
    EnumKey,
    QueryValueEx,
    QueryInfoKey,
)

from .config import log_dir

ROOTS = [
    (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    (HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
]


def _drive_of(text: str) -> Optional[str]:
    """从安装位置/卸载命令字符串中提取盘符（如 C:），提取不到返回 None。"""
    if not text:
        return None
    m = re.match(r"^[\"']?([a-zA-Z]):", text.strip())
    if m:
        return m.group(1).upper() + ":"
    return None


def _read_value(key, name):
    try:
        val, _ = QueryValueEx(key, name)
        return val
    except OSError:
        return None


def _is_system_component(key) -> bool:
    sc = _read_value(key, "SystemComponent")
    try:
        if sc is not None and int(sc) == 1:
            return True
    except (TypeError, ValueError):
        pass
    wi = _read_value(key, "WindowsInstaller")
    try:
        if wi is not None and int(wi) == 1:
            return True
    except (TypeError, ValueError):
        pass
    return False


def _install_date_str(raw):
    if not raw:
        return None
    raw = str(raw).strip()
    if len(raw) == 8 and raw.isdigit():
        try:
            return datetime.strptime(raw, "%Y%m%d").strftime("%Y-%m-%d")
        except ValueError:
            return None
    return raw[:100]


def _estimated_size_mb(raw) -> Optional[int]:
    if raw is None:
        return None
    try:
        kb = int(raw)
        return round(kb / 1024, 1)
    except (TypeError, ValueError):
        return None


def _iter_items():
    """遍历注册表，逐个产出软件 item dict（含 display_icon）。"""
    for root, subkey_path in ROOTS:
        try:
            with OpenKey(root, subkey_path, 0, KEY_READ) as parent:
                count, _, _ = QueryInfoKey(parent)
                for i in range(count):
                    try:
                        subname = EnumKey(parent, i)
                        with OpenKey(parent, subname, 0, KEY_READ) as key:
                            if _is_system_component(key):
                                continue
                            name = _read_value(key, "DisplayName")
                            if not name:
                                continue
                            install_location = _read_value(key, "InstallLocation") or ""
                            uninstall_string = _read_value(key, "UninstallString") or ""
                            display_icon = _read_value(key, "DisplayIcon") or ""
                            drive = _drive_of(install_location) or _drive_of(uninstall_string) or "C:"
                            yield {
                                "name": str(name),
                                "publisher": _read_value(key, "Publisher") or "",
                                "installed_size_mb": _estimated_size_mb(_read_value(key, "EstimatedSize")),
                                "install_location": install_location,
                                "uninstall_string": uninstall_string,
                                "display_icon": display_icon,
                                "install_date": _install_date_str(_read_value(key, "InstallDate")),
                                "last_used": None,
                                "drive": drive,
                            }
                    except OSError:
                        continue
        except OSError:
            continue


def list_installed_software(include_empty: bool = True) -> List[dict]:
    """读取已安装软件列表（注册表只读），按安装日期排序。"""
    seen: Dict[str, dict] = {}
    for item in _iter_items():
        keyname = item["name"].lower()
        if keyname not in seen:
            seen[keyname] = item

    items = list(seen.values())
    items.sort(key=lambda x: x.get("install_date") or "9999-99-99")
    if not include_empty:
        items = [i for i in items if i["installed_size_mb"]]
    return items


def find_software_by_name(name: str) -> Optional[dict]:
    """按显示名查找单个软件（用于图标按需提取）。"""
    for item in _iter_items():
        if item["name"] == name:
            return item
    return None


# ---------------------------------------------------------------------------
# 真实图标提取
# ---------------------------------------------------------------------------
def _locate_icon(item: dict) -> Optional[str]:
    """定位图标文件：优先 DisplayIcon，其次安装目录下第一个 exe/ico。"""
    disp = (item.get("display_icon") or "").strip()
    if disp:
        # 去掉 ",index" 后缀与引号
        p = re.split(r",\s*-?\d+$", disp)[0].strip().strip('"').strip("'")
        if p and os.path.isfile(p):
            return p
    loc = (item.get("install_location") or "").strip().strip('"').strip("'")
    if loc and os.path.isdir(loc):
        try:
            for fn in os.listdir(loc):
                if fn.lower().endswith((".exe", ".ico")):
                    return os.path.join(loc, fn)
        except OSError:
            pass
    return None


def get_software_icon(item: dict, size: int = 48) -> Optional[str]:
    """提取软件图标为 PNG base64（本地缓存，返回 data URL 后缀所需 base64）。"""
    icon_path = _locate_icon(item)
    if not icon_path:
        return None

    cache_dir = log_dir() / "icons"
    cache_dir.mkdir(parents=True, exist_ok=True)
    h = hashlib.md5(icon_path.lower().encode("utf-8")).hexdigest()
    cache_file = cache_dir / f"{h}.png"
    if cache_file.exists():
        try:
            return base64.b64encode(cache_file.read_bytes()).decode("ascii")
        except OSError:
            pass

    escaped = icon_path.replace("'", "''")
    ps = (
        "Add-Type -AssemblyName System.Drawing; "
        f"$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{escaped}'); "
        "if ($icon) { $bmp = $icon.ToBitmap(); "
        "$ms = New-Object System.IO.MemoryStream; "
        "$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); "
        "$bytes = $ms.ToArray(); "
        "$ms.Dispose(); $bmp.Dispose(); $icon.Dispose(); "
        "[Convert]::ToBase64String($bytes) }"
    )
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
            capture_output=True, text=True, timeout=20,
        )
    except Exception:
        return None
    b64 = (out.stdout or "").strip()
    if not b64 or len(b64) < 100:
        return None
    try:
        raw = base64.b64decode(b64)
        if raw[:8] == b"\x89PNG\r\n\x1a\n":
            try:
                cache_file.write_bytes(raw)
            except OSError:
                pass
            return b64
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# 直接卸载
# ---------------------------------------------------------------------------
def resolve_uninstall_command(uninstall_string: str) -> Optional[tuple]:
    """解析 UninstallString 为 (exe, [args])。"""
    s = (uninstall_string or "").strip()
    if not s:
        return None
    try:
        parts = shlex.split(s, posix=False)
    except ValueError:
        # 无法完整解析时，退化为按空格拆分
        parts = s.split()
    if not parts:
        return None
    exe = parts[0].strip('"').strip("'")
    return exe, parts[1:]


def launch_uninstall(uninstall_string: str) -> dict:
    """启动官方卸载程序（异步，不等待）。"""
    cmd = resolve_uninstall_command(uninstall_string)
    if not cmd:
        return {"ok": False, "message": "无法解析卸载命令"}
    exe, args = cmd
    if not os.path.exists(exe):
        return {"ok": False, "message": f"卸载程序不存在：{exe}"}
    try:
        subprocess.Popen([exe] + args, close_fds=True)
        return {"ok": True, "message": "已启动卸载程序，请在弹出窗口中完成卸载"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": str(exc)}


# ---------------------------------------------------------------------------
# 残留扫描
# ---------------------------------------------------------------------------
def _dir_size(path: str) -> int:
    total = 0
    try:
        for root, _dirs, files in os.walk(path):
            for fn in files:
                try:
                    total += os.path.getsize(os.path.join(root, fn))
                except OSError:
                    pass
    except OSError:
        pass
    return total


def scan_residue(name: str, install_location: str) -> List[dict]:
    """扫描软件卸载后的残留文件/目录（只返回路径与大小，不执行删除）。"""
    seen = set()
    results: List[dict] = []

    def add(path: str):
        path = os.path.normpath(path)
        if not path or path.lower() in seen:
            return
        if not os.path.exists(path):
            return
        seen.add(path.lower())
        is_dir = os.path.isdir(path)
        results.append({
            "path": path,
            "size": _dir_size(path) if is_dir else os.path.getsize(path),
            "is_dir": is_dir,
        })

    # 1) 安装目录残留
    loc = (install_location or "").strip().strip('"').strip("'")
    if loc:
        add(loc)

    # 2) AppData / ProgramData 中匹配软件名的目录
    name_clean = re.sub(r'[\\/:*?"<>|]', "", name or "").strip().lower()
    if name_clean:
        roots = [
            os.environ.get("LOCALAPPDATA", ""),
            os.environ.get("APPDATA", ""),
            os.environ.get("PROGRAMDATA", ""),
        ]
        for root in roots:
            if not root or not os.path.isdir(root):
                continue
            try:
                for d in os.listdir(root):
                    dl = d.lower()
                    if name_clean and name_clean in dl:
                        add(os.path.join(root, d))
            except OSError:
                pass

    # 3) 桌面 / 开始菜单快捷方式
    if name_clean:
        shortcuts = []
        desktop = os.path.join(os.environ.get("USERPROFILE", ""), "Desktop")
        start_menu = os.path.join(
            os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs"
        )
        for base in (desktop, start_menu):
            if not base or not os.path.isdir(base):
                continue
            for root, _dirs, files in os.walk(base):
                # 限制深度，避免全盘遍历
                depth = root[len(base):].count(os.sep)
                if depth > 2:
                    continue
                for fn in files:
                    if fn.lower().endswith(".lnk") and name_clean in fn.lower():
                        shortcuts.append(os.path.join(root, fn))
        for s in shortcuts:
            add(s)

    return results
