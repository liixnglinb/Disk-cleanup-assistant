"""出厂必备文件检测：检测本机出厂必备文件/目录是否齐全。

- 自动识别设备：品牌（OEM 厂商）、机型、系统架构、笔记本/台式机
- 按设备类型执行不同的检测清单（通用系统核心 + OEM 专属组件）
- 结果仅作参考，不执行任何修复/写入操作
"""
import os
import platform as _platform
import re
import subprocess
from dataclasses import dataclass
from typing import List, Optional

from winreg import HKEY_LOCAL_MACHINE, KEY_READ, OpenKey, QueryValueEx

# ---------------------------------------------------------------
# 通用系统核心必备（所有 Windows 设备都应存在）
# ---------------------------------------------------------------
_SYSTEM_CORE: List[dict] = [
    {"name": "系统内核", "path": r"C:\Windows\System32\ntoskrnl.exe", "category": "system_core",
     "desc": "Windows 内核文件，系统启动与运行的核心，缺失将无法开机"},
    {"name": "系统引导加载器", "path": r"C:\Windows\System32\winload.exe", "category": "boot",
     "desc": "Windows 引导加载器（BIOS 启动），缺失可能导致无法启动"},
    {"name": "UEFI 引导加载器", "path": r"C:\Windows\System32\winload.efi", "category": "boot",
     "desc": "Windows 引导加载器（UEFI 启动），新机型多使用此文件"},
    {"name": "资源管理器", "path": r"C:\Windows\explorer.exe", "category": "system_core",
     "desc": "Windows 桌面与文件资源管理器主程序"},
    {"name": "命令解释器", "path": r"C:\Windows\System32\cmd.exe", "category": "system_core",
     "desc": "Windows 命令提示符，系统修复与诊断常用"},
    {"name": "系统服务主机", "path": r"C:\Windows\System32\svchost.exe", "category": "system_core",
     "desc": "Windows 服务宿主进程，大量系统服务依赖它运行"},
    {"name": "注册表系统配置", "path": r"C:\Windows\System32\config\SYSTEM", "category": "system_core",
     "desc": "系统注册表配置单元，存储硬件与系统级配置"},
    {"name": "核心动态库", "path": r"C:\Windows\System32\kernel32.dll", "category": "system_core",
     "desc": "Windows 核心 API 动态库，几乎所有程序都依赖"},
    {"name": "用户界面动态库", "path": r"C:\Windows\System32\user32.dll", "category": "system_core",
     "desc": "Windows 用户界面核心动态库"},
    {"name": "系统字体目录", "path": r"C:\Windows\Fonts", "category": "system_core",
     "desc": "系统字体目录，缺失会导致界面文字无法正常显示", "is_dir": True},
    {"name": "系统驱动目录", "path": r"C:\Windows\System32\drivers", "category": "system_core",
     "desc": "内核驱动目录，缺失会导致设备无法正常工作", "is_dir": True},
    {"name": "驱动程序仓库", "path": r"C:\Windows\System32\DriverStore\FileRepository", "category": "drivers",
     "desc": "驱动安装仓库，设备驱动安装与回滚依赖此目录", "is_dir": True},
    {"name": "系统更新组件", "path": r"C:\Windows\System32\wuaueng.dll", "category": "system_core",
     "desc": "Windows 更新引擎，缺失将无法正常接收系统更新"},
    {"name": "系统启动配置数据", "path": r"C:\Windows\Boot", "category": "boot",
     "desc": "启动配置数据（BCD）目录，缺失会导致无法启动", "is_dir": True},
    {"name": "系统预取目录", "path": r"C:\Windows\Prefetch", "category": "system_core",
     "desc": "预读取缓存目录，影响开机速度但非致命", "is_dir": True, "severity": "low"},
]

# ---------------------------------------------------------------
# OEM 专属组件（按品牌）
# ---------------------------------------------------------------
_OEM_COMPONENTS: dict = {
    "Lenovo": [
        {"name": "联想系统更新工具", "path": r"C:\Program Files (x86)\Lenovo\System Update", "category": "oem", "desc": "联想官方驱动/BIOS 更新工具"},
        {"name": "联想驱动目录", "path": r"C:\Windows\Lenovo", "category": "oem", "desc": "联想预装驱动与工具目录", "is_dir": True},
        {"name": "联想一键恢复", "path": r"C:\Program Files\Lenovo\OneKey Recovery", "category": "oem", "desc": "联想一键恢复组件（部分机型）"},
    ],
    "Dell": [
        {"name": "戴尔技术支持", "path": r"C:\Program Files\Dell\SupportAssist", "category": "oem", "desc": "戴尔 SupportAssist 支持与驱动工具"},
        {"name": "戴尔驱动目录", "path": r"C:\Program Files\Dell", "category": "oem", "desc": "戴尔预装驱动与工具目录", "is_dir": True},
    ],
    "HP": [
        {"name": "惠普支持助手", "path": r"C:\Program Files (x86)\HP\HP Support Assistant", "category": "oem", "desc": "惠普官方支持助手"},
        {"name": "惠普工具目录", "path": r"C:\Program Files (x86)\HP", "category": "oem", "desc": "惠普预装驱动与工具目录", "is_dir": True},
    ],
    "ASUS": [
        {"name": "华硕管家", "path": r"C:\Program Files\ASUS\ASUS Framework Service", "category": "oem", "desc": "华硕 MyASUS 服务组件"},
        {"name": "华硕工具目录", "path": r"C:\Program Files\ASUS", "category": "oem", "desc": "华硕预装驱动与工具目录", "is_dir": True},
    ],
    "HUAWEI": [
        {"name": "华为电脑管家", "path": r"C:\Program Files\Huawei\PCManager", "category": "oem", "desc": "华为电脑管家组件"},
        {"name": "华为工具目录", "path": r"C:\Program Files\Huawei", "category": "oem", "desc": "华为预装驱动与工具目录", "is_dir": True},
    ],
    "HONOR": [
        {"name": "荣耀电脑管家", "path": r"C:\Program Files\Honor\PCManager", "category": "oem", "desc": "荣耀电脑管家组件"},
        {"name": "荣耀工具目录", "path": r"C:\Program Files\Honor", "category": "oem", "desc": "荣耀预装驱动与工具目录", "is_dir": True},
    ],
    "Xiaomi": [
        {"name": "小米电脑助手", "path": r"C:\Program Files\MI\XiaomiSupport", "category": "oem", "desc": "小米电脑助手组件"},
        {"name": "小米工具目录", "path": r"C:\Program Files\MI", "category": "oem", "desc": "小米预装驱动与工具目录", "is_dir": True},
    ],
}


def _read_reg(key_path: str, name: str) -> Optional[str]:
    try:
        with OpenKey(HKEY_LOCAL_MACHINE, key_path, 0, KEY_READ) as k:
            val, _ = QueryValueEx(k, name)
            return str(val).strip()
    except OSError:
        return None


def _run_ps(script: str, timeout: int = 10) -> str:
    try:
        p = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True, text=True, timeout=timeout,
        )
        return (p.stdout or "").strip()
    except Exception:
        return ""


def _detect_chassis() -> str:
    """返回 chassis 类型：laptop / desktop / unknown。"""
    out = _run_ps(
        "(Get-CimInstance Win32_SystemEnclosure).ChassisTypes -join ','"
    )
    if not out:
        return "unknown"
    # 常见笔记本机箱类型码：8,9,10,11,12,14,18,21,31,32
    laptop_codes = {8, 9, 10, 11, 12, 14, 18, 21, 31, 32}
    codes = [int(x) for x in re.findall(r"\d+", out)]
    if any(c in laptop_codes for c in codes):
        return "laptop"
    # 台式机/工作站类型码：3,4,5,6,7,13,15,16,17,30,34,35,36
    desktop_codes = {3, 4, 5, 6, 7, 13, 15, 16, 17, 30, 34, 35, 36}
    if any(c in desktop_codes for c in codes):
        return "desktop"
    return "unknown"


def detect_device() -> dict:
    """识别设备信息。"""
    mfr = _read_reg(r"HARDWARE\DESCRIPTION\System\BIOS", "SystemManufacturer") or ""
    product = _read_reg(r"HARDWARE\DESCRIPTION\System\BIOS", "SystemProductName") or ""
    baseboard = _read_reg(r"HARDWARE\DESCRIPTION\System\BIOS", "BaseBoardManufacturer") or ""
    arch = _platform.machine()

    # OEM 品牌识别：优先 SystemManufacturer，其次主板厂商
    brand = ""
    for key, label in (("Lenovo", "Lenovo"), ("Dell", "Dell"), ("HP", "HP"),
                       ("Hewlett-Packard", "HP"), ("ASUS", "ASUS"), ("ASUSTeK", "ASUS"),
                       ("HUAWEI", "HUAWEI"), ("HONOR", "HONOR"), ("Xiaomi", "Xiaomi")):
        if key.lower() in mfr.lower() or key.lower() in baseboard.lower():
            brand = label
            break

    chassis = _detect_chassis()
    return {
        "manufacturer": mfr,
        "product": product,
        "brand": brand,
        "arch": arch,
        "chassis": chassis,
        "is_laptop": chassis == "laptop",
    }


def _exists(path: str, is_dir: bool = False) -> bool:
    """稳健的存在性检查：系统保护目录/文件普通权限 stat 会 PermissionError，
    此时说明路径确实存在（受保护），不应误判为缺失。"""
    try:
        st = os.stat(path)
        if is_dir:
            return (st.st_mode & 0o170000) == 0o040000  # S_IFDIR
        return True
    except PermissionError:
        return True
    except OSError:
        return False


def _check_item(item: dict) -> dict:
    path = item["path"]
    is_dir = item.get("is_dir", False)
    exists = _exists(path, is_dir)
    return {
        "name": item["name"],
        "path": path,
        "category": item.get("category", "system_core"),
        "description": item.get("desc", ""),
        "exists": exists,
        "required": item.get("severity", "high") == "high" or "severity" not in item,
        "severity": item.get("severity", "high"),
        "is_dir": is_dir,
    }


def run_factory_check() -> dict:
    """执行出厂必备文件检测，返回设备信息 + 检测项列表 + 汇总。"""
    device = detect_device()
    items: List[dict] = []

    # 通用系统核心
    for item in _SYSTEM_CORE:
        items.append(_check_item(item))

    # OEM 专属组件（按识别到的品牌）——属可选预装工具，缺失不算「必备文件缺失」
    brand = device["brand"]
    oem_items = _OEM_COMPONENTS.get(brand, [])
    for item in oem_items:
        item = dict(item)
        item["severity"] = "low"  # 预装工具，缺失不影响系统正常运行
        items.append(_check_item(item))

    # 汇总
    total = len(items)
    present = sum(1 for i in items if i["exists"])
    missing = total - present
    missing_high = sum(1 for i in items if not i["exists"] and i["severity"] == "high")

    return {
        "device": device,
        "items": items,
        "summary": {
            "total": total,
            "present": present,
            "missing": missing,
            "missing_high": missing_high,
            "healthy": missing_high == 0,
        },
    }
