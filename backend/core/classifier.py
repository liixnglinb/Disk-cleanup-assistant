"""文件分类：按扩展名 + 路径特征 + 文件头分类。

类别键值：
    system   -> 系统文件（锁定不可删）
    download -> 下载目录文件
    cache    -> 软件缓存
    app_data -> 软件数据（聊天记录/配置/数据库等，删除会丢数据）
    residue  -> 残留文件
    large    -> 大文件（>100MB）
    docs     -> 用户文档
    unknown  -> 未知类型（兜底，需谨慎）
"""
import os
from typing import Optional, Set

from .config import LARGE_FILE_MB

LARGE_FILE_BYTES = LARGE_FILE_MB * 1024 * 1024

# ---------- 软件缓存 ----------
_CACHE_EXT: Set[str] = {
    ".cache", ".tmp", ".crdownload", ".part", ".partial", ".downloadming",
    ".dat_cache", ".fsclient", ".thumb", ".blob", ".dat_cache", ".crswap",
}
_DOWNLOAD_DIR_SEGMENTS: Set[str] = {
    "downloads",
    "download",
    "\u4e0b\u8f7d",          # 下载
    "\u5f85\u5904\u7406",      # 待处理（常见下载/中转目录）
}
_CACHE_DIR_SEGMENTS: Set[str] = {
    "cache", "caches", "cachedata", "temp", "tmp", "thumbs", "thumbnailcache",
    "appdata\\local\\temp", "chrome\\user data\\default\\cache",
    "nvidia\\nv_cache", "dxcache", "shadercache",
}

# 软件数据目录根段：微信/QQ 的聊天记录、接收文件、数据库等真实数据所在。
# 命中这些根段后，只有落在明确缓存子段（_APP_DATA_CACHE_SUBS）的文件才判 cache，
# 其余一律判 app_data（删除会丢聊天数据），绝不当缓存推荐删除。
_APP_DATA_ROOTS: Set[str] = {
    "wechat files", "wechat files\\xwechat_files", "xwechat_files",
    "tencent files", "qq files",
}

# 上述根段内明确属于「缓存/临时」的子目录段（可安全清理、可自动重建）
_APP_DATA_CACHE_SUBS: tuple = (
    "\\filestorage\\cache", "\\filestorage\\temp", "\\filestorage\\video", "\\filestorage\\image",
    "\\filemsg\\cache", "\\cache", "\\temp", "\\tmp", "\\image", "\\video",
)

# ---------- 残留文件 ----------
_RESIDUE_EXT: Set[str] = {
    ".tmp", ".temp", ".bak", ".old", ".log", ".dmp", ".chk", ".txt~",
    ".recently-used", ".swp", ".swo", ".lock", ".~tmp", ".trashed", ".ds_store",
}
_RESIDUE_PATTERNS = ["~$", ".tmp", "temp~", "copy of", "backup ", "old_", "_old"]

# ---------- 用户文档/媒体/压缩包 ----------
_DOCS_EXT: Set[str] = {
    ".txt", ".md", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf",
    ".wps", ".et", ".dps", ".rtf", ".csv", ".json", ".xml",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".ico", ".svg",
    ".mp3", ".wav", ".flac", ".aac", ".ogg", ".mid",
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".ts", ".m4v",
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso",
    ".psd", ".ai", ".sketch", ".fig",
}

_SYSTEM_EXT: Set[str] = {
    ".sys", ".dll", ".drv", ".mui", ".cat", ".manifest", ".exe", ".com",
    ".vxd", ".386", ".ocx", ".cpl", ".msc", ".inf",
}


def _has_segment(path: str, segment: str) -> bool:
    """按反斜杠小写路径，判断路径目录段是否包含某个段。"""
    lower = path.lower().replace("/", "\\")
    return f"\\{segment}\\".replace("/", "\\") in lower or lower.endswith("\\" + segment)


def _path_hint(path: str) -> str:
    """路径特征词，用于判断缓存/残留/下载。"""
    return path.lower().replace("/", "\\")


def classify(
    path: str,
    size: int,
    ext: str,
    magic: Optional[str] = None,
    is_protected: bool = False,
    large_file_bytes: Optional[int] = None,
) -> str:
    """返回分类键。large_file_bytes 可由扫描会话自定义（设置里的「大文件阈值」）。"""
    ext = (ext or "").lower()
    p = _path_hint(path)
    if large_file_bytes is None:
        large_file_bytes = LARGE_FILE_BYTES

    # 1) 系统文件：保护目录始终锁定；系统扩展名仅在系统区域（Windows/Program Files/ProgramData）锁定，
    #    避免把用户下载的绿色软件 exe/dll 误判为系统文件而锁定。
    if is_protected:
        return "system"
    if ext in _SYSTEM_EXT:
        in_sys_area = ("\\windows\\" in p) or ("\\program files" in p) or ("\\programdata" in p)
        if in_sys_area:
            return "system"

    # 2) 下载目录（用户在“下载”文件夹里的文件）
    for seg in _DOWNLOAD_DIR_SEGMENTS:
        if _has_segment(p, seg):
            return "download"

    # 3) 微信/QQ 等软件数据目录：先查是否落在明确的缓存子段，否则判为软件数据
    for root in _APP_DATA_ROOTS:
        if _has_segment(p, root):
            for sub in _APP_DATA_CACHE_SUBS:
                if sub in p:
                    return "cache"
            return "app_data"

    # 4) 软件缓存
    for seg in _CACHE_DIR_SEGMENTS:
        if _has_segment(p, seg):
            return "cache"
    if ext in _CACHE_EXT:
        return "cache"

    # 5) 残留文件
    if ext in _RESIDUE_EXT:
        return "residue"
    for pat in _RESIDUE_PATTERNS:
        if pat in p:
            return "residue"

    # 6) 大文件
    if size >= large_file_bytes:
        return "large"

    # 7) 用户文档 / 未知类型（未知不再伪装成“用户文档”）
    if ext in _DOCS_EXT:
        return "docs"
    return "unknown"


CATEGORY_LABELS = {
    "system": "系统文件",
    "download": "下载目录",
    "cache": "软件缓存",
    "app_data": "软件数据",
    "residue": "残留文件",
    "large": "大文件",
    "docs": "用户文档",
    "unknown": "未知类型",
}

DELETABLE_CATEGORIES = {"cache", "download", "docs", "residue", "large", "unknown"}