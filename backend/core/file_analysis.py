"""深度文件分析：为每个文件生成 用途说明 / 所属软件 / 删除建议 / 风险等级。

纯规则引擎（路径特征 + 扩展名 + 分类），执行轻量，可支撑百万级文件扫描。
"""
import os
from typing import Optional, Tuple

# ---------------------------------------------------------------------------
# 路径特征 -> 所属软件（按顺序匹配，前优先）
# ---------------------------------------------------------------------------
_OWNER_MAP = [
    (r"\appdata\local\google\chrome", "Chrome 浏览器"),
    (r"\appdata\local\microsoft\edge", "Microsoft Edge"),
    (r"\appdata\roaming\microsoft\edge", "Microsoft Edge"),
    (r"\appdata\local\bravesoftware", "Brave 浏览器"),
    (r"\appdata\local\mozilla\firefox", "Firefox 浏览器"),
    (r"wechat files", "微信"),
    (r"xwechat_files", "微信"),
    (r"wechattemp", "微信"),
    (r"wechatxcache", "微信"),
    (r"\appdata\roaming\tencent\qq", "QQ"),
    (r"\appdata\local\tencent\qq", "QQ"),
    (r"tencent files", "QQ"),
    (r"qq files", "QQ"),
    (r"\appdata\roaming\tencent", "腾讯软件"),
    (r"\appdata\local\tencent", "腾讯软件"),
    (r"\appdata\local\dingtalk", "钉钉"),
    (r"\appdata\roaming\dingtalk", "钉钉"),
    (r"\appdata\local\feishu", "飞书"),
    (r"\appdata\roaming\feishu", "飞书"),
    (r"lark", "飞书"),
    (r"\appdata\local\wps\office", "WPS Office"),
    (r"\appdata\roaming\kingsoft", "金山软件"),
    (r"\appdata\local\adobe", "Adobe"),
    (r"\appdata\roaming\adobe", "Adobe"),
    (r"\appdata\local\unity", "Unity"),
    (r"\appdata\local\unity3d", "Unity"),
    (r"epic games", "Epic Games"),
    (r"\steam\steamapps", "Steam"),
    (r"steamapps", "Steam"),
    (r"\wegame", "WeGame"),
    (r"\nvidia", "NVIDIA"),
    (r"nvidia corporation", "NVIDIA"),
    (r"\appdata\local\nv_cache", "NVIDIA 显卡缓存"),
    (r"\dxcache", "DirectX 着色器缓存"),
    (r"\shadercache", "显卡着色器缓存"),
    (r"\node_modules", "Node.js 项目依赖"),
    (r"\pip\cache", "pip 缓存"),
    (r"\npm-cache", "npm 缓存"),
    (r"\npm_cache", "npm 缓存"),
    (r"\.yarn\cache", "Yarn 缓存"),
    (r"\yarn\cache", "Yarn 缓存"),
    (r"\.venv\lib", "Python 虚拟环境"),
    (r"\.venv\site-packages", "Python 虚拟环境"),
    (r"\site-packages", "Python 依赖包"),
    (r"\appdata\local\packages", "微软商店应用"),
    (r"\windows\prefetch", "Windows 预读取"),
    (r"\windows\temp", "Windows 临时目录"),
    (r"\windows\logs", "Windows 日志"),
    (r"\windows\system32", "Windows 系统"),
    (r"\windows\syswow64", "Windows 系统"),
    (r"\programdata\microsoft", "Windows / Microsoft"),
    (r"\program files", "应用程序"),
    (r"\program files (x86)", "应用程序"),
    (r"\recovery", "系统恢复"),
    (r"$recycle.bin", "回收站"),
]

# ---------------------------------------------------------------------------
# 安全可清理目录段：命中则强烈推荐清理
# ---------------------------------------------------------------------------
_SAFE_CLEAN_SEGS = [
    "\\temp",
    "\\tmp",
    "\\cache",
    "\\cachedata",
    "\\thumbcache",
    "\\thumbnailcache",
    "\\thumbs",
    "\\logs",
    "\\windows\\updater",
    "\\windows.old",
    "\\$windows.~bt",
    "\\$windows.~ws",
    "\\delivery optimization",
]

# ---------------------------------------------------------------------------
# 用途说明（按扩展名）
# ---------------------------------------------------------------------------
_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".ico", ".svg", ".tif", ".tiff", ".raw", ".psd"}
_VIDEO_EXT = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".ts", ".m4v", ".rmvb", ".m2ts"}
_AUDIO_EXT = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".mid", ".m4a", ".opus", ".wma"}
_ARCHIVE_EXT = {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".cab", ".tar.gz"}
_DOC_EXT = {".txt", ".md", ".doc", ".docx", ".rtf", ".wps", ".et", ".dps", ".odt"}
_SPREADSHEET_EXT = {".xls", ".xlsx", ".csv"}
_PRESENT_EXT = {".ppt", ".pptx"}
_CODE_EXT = {".py", ".js", ".ts", ".tsx", ".jsx", ".tsx", ".c", ".cpp", ".h", ".java", ".cs", ".go", ".rs", ".html", ".css", ".scss", ".php", ".rb", ".sh", ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".conf"}
_DB_EXT = {".db", ".sqlite", ".sqlite3", ".accdb", ".mdb"}
_EXE_EXT = {".exe", ".msi", ".bat", ".cmd", ".com", ".apk", ".dmg", ".iso"}
_LIB_EXT = {".dll", ".sys", ".drv", ".ocx", ".mui", ".cat", ".manifest", ".vxd", ".386"}
_CACHE_EXT = {".cache", ".tmp", ".crdownload", ".part", ".blob", ".thumb"}
_RESIDUE_EXT = {".bak", ".old", ".log", ".dmp", ".chk", ".swp", ".swo", ".lock", ".trash"}
_BROWSER_CACHE_SEGS = ["\\cache", "\\cachedata", "\\code cache", "\\gpu cache", "\\service worker", "\\blob_storage"]


def _norm(path: str) -> str:
    return (path or "").lower().replace("/", "\\")


# ---------------------------------------------------------------------------
# 注册表已装软件 安装位置 -> 软件名 索引（扫描开始时构建一次，只读注册表）
# ---------------------------------------------------------------------------
_OWNER_DIRS: list = []  # [(规范化目录前缀(带尾部反斜杠), 软件名), ...] 按前缀长度降序
_OWNER_BUCKETS: dict = {}  # {首字符: [(前缀, 软件名), ...]}，detect_owner 用首字符 O(1) 定位


def prime_owner_index() -> int:
    """从注册表已装软件构建安装位置索引。每次扫描调用一次。"""
    global _OWNER_DIRS, _OWNER_BUCKETS
    _OWNER_DIRS = []
    _OWNER_BUCKETS = {}
    try:
        from .software import list_installed_software
        for it in list_installed_software(include_empty=False):
            loc = (it.get("install_location") or "").strip()
            name = (it.get("name") or "").strip()
            if not loc or not name:
                continue
            d = loc.lower().replace("/", "\\")
            if not d.endswith("\\"):
                d += "\\"
            # 排除盘符根（如 "d:\"），否则整盘文件都会误判为该软件
            if len(d) <= 3:
                continue
            _OWNER_DIRS.append((d, name[:60]))
    except Exception:  # noqa: BLE001 索引失败不影响扫描
        _OWNER_DIRS = []
        _OWNER_BUCKETS = {}
        return 0
    _OWNER_DIRS.sort(key=lambda x: -len(x[0]))
    for d, name in _OWNER_DIRS:
        key = d[0] if d else ""
        _OWNER_BUCKETS.setdefault(key, []).append((d, name))
    return len(_OWNER_DIRS)


def detect_owner(path: str, category: str = "docs") -> str:
    p = _norm(path)
    # 优先：注册表安装位置精确归属（按首字符分桶，长前缀优先，最具体者胜）
    bucket = _OWNER_BUCKETS.get(p[:1] if p else "")
    if bucket:
        for d, name in bucket:
            if p.startswith(d):
                return name
    for key, owner in _OWNER_MAP:
        if key.lower() in p:
            return owner
    # 用户目录下未识别到具体软件：精确定位
    parts = [s for s in p.split("\\") if s]
    if len(parts) >= 4 and parts[0].endswith(":") and parts[1] == "users":
        if category in ("cache", "residue"):
            return "用户目录（缓存/残留）"
        return "用户文件"
    if "\\users\\" in p and "\\appdata\\" in p:
        return "应用程序数据"
    if p.startswith("c:\\users") or "\\users\\" in p:
        return "用户目录"
    return "未知来源"


def describe_purpose(ext: str, category: str, path: str) -> str:
    ext = (ext or "").lower()
    p = _norm(path)
    if category == "system":
        if ext in _LIB_EXT or ext == ".exe":
            return "系统/程序运行文件"
        return "Windows 系统文件"
    if any(seg in p for seg in _BROWSER_CACHE_SEGS):
        return "浏览器缓存文件"
    if ext in _IMAGE_EXT:
        return "图片文件"
    if ext in _VIDEO_EXT:
        return "视频文件"
    if ext in _AUDIO_EXT:
        return "音频文件"
    if ext in _ARCHIVE_EXT:
        return "压缩/归档文件"
    if ext == ".pdf":
        return "PDF 文档"
    if ext in _DOC_EXT:
        return "文本文档"
    if ext in _SPREADSHEET_EXT:
        return "表格数据"
    if ext in _PRESENT_EXT:
        return "演示文稿"
    if ext in _CODE_EXT:
        return "源代码/配置文件"
    if ext in _DB_EXT:
        return "数据库文件"
    if ext in _CACHE_EXT:
        return "缓存文件"
    if ext in _RESIDUE_EXT:
        return "临时/残留文件"
    if ext in _EXE_EXT:
        return "可执行程序/安装包"
    if ext in _LIB_EXT:
        return "系统/动态库文件"
    if category == "cache":
        return "软件缓存文件"
    if category == "residue":
        return "残留/临时文件"
    if category == "download":
        return "下载文件"
    if category == "large":
        return "大型文件（>100MB）"
    return "数据文件"


def analyze(
    path: str,
    size: int,
    ext: str,
    magic: Optional[str] = None,
    category: str = "docs",
    is_protected: bool = False,
    large_file_bytes: Optional[int] = None,
) -> dict:
    """返回 {purpose, owner, recommendation, risk, recommendation_reason, needs_ai}

    needs_ai 标记「存疑未知文件」：路径 / 后缀 / 归属规则全部未命中，属于需要交给
    AI 分析的 B 类文件。A 类（系统/缓存/残留/已知文档）直接本地打标签，不走 AI。
    """
    p = _norm(path)
    owner = detect_owner(path, category)
    purpose = describe_purpose(ext, category, path)
    # B 类存疑：既无已知归属、也无已知扩展名用途
    needs_ai = (owner == "未知来源" and purpose == "数据文件")

    if is_protected or category == "system":
        return {
            "purpose": purpose,
            "owner": "Windows 系统" if owner == "未知来源" else owner,
            "recommendation": "system",
            "risk": "high",
            "recommendation_reason": "系统保护文件，删除可能导致系统或软件无法正常运行",
            "needs_ai": False,
        }

    # 缓存类
    if category == "cache":
        if any(seg in p for seg in _SAFE_CLEAN_SEGS):
            return {
                "purpose": purpose, "owner": owner,
                "recommendation": "recommend", "risk": "low",
                "recommendation_reason": f"这是{owner}产生的缓存/临时文件，删除后通常可自动重建",
                "needs_ai": False,
            }
        return {
            "purpose": purpose, "owner": owner,
            "recommendation": "recommend", "risk": "low",
            "recommendation_reason": "缓存文件删除后一般不影响使用，可安全清理释放空间",
            "needs_ai": False,
        }

    # 残留类
    if category == "residue":
        return {
            "purpose": purpose, "owner": owner,
            "recommendation": "recommend", "risk": "low",
            "recommendation_reason": "残留/临时文件通常已不再被程序使用，删除风险低",
            "needs_ai": False,
        }

    if category == "large":
        return {
            "purpose": purpose, "owner": owner,
            "recommendation": "caution", "risk": "medium",
            "recommendation_reason": f"大文件占用空间较多（{size // (1024*1024)}MB），请确认不再需要后再删除",
            "needs_ai": needs_ai,
        }

    if category == "download":
        return {
            "purpose": purpose, "owner": owner,
            "recommendation": "caution", "risk": "medium",
            "recommendation_reason": "下载文件，删除前请确认不再需要（也可能是重要资料）",
            "needs_ai": needs_ai,
        }

    if category == "docs":
        return {
            "purpose": purpose, "owner": owner,
            "recommendation": "keep", "risk": "medium",
            "recommendation_reason": "用户文档/资料，建议保留，删除前请自行确认",
            "needs_ai": needs_ai,
        }

    return {
        "purpose": purpose, "owner": owner,
        "recommendation": "caution", "risk": "medium",
        "recommendation_reason": "用途未知，删除前请先确认文件是否仍在使用",
        "needs_ai": needs_ai,
    }


RECOMMENDATION_LABELS = {
    "recommend": "推荐删除",
    "caution": "谨慎删除",
    "keep": "建议保留",
    "system": "系统必留",
}

RISK_LABELS = {
    "low": "低风险",
    "medium": "中风险",
    "high": "高风险",
}