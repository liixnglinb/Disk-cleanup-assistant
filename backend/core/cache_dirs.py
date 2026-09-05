"""安全缓存目录识别（只读，不删除）。

改造说明（v2）：
- 候选来源 = 清理知识库（cleanup_kb）中「推荐/谨慎清理」的目录条目，
  每个候选自带：所属软件、用途说明、删除影响、建议、风险、是否依附应用。
- 额外动态补充浏览器/微信等的高价值缓存子目录（按实际安装探测）。
- 只包含用户目录 / 程序数据 / 系统临时等可清理位置；系统核心与用户文件绝不纳入。
"""
import glob
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List

from .cleanup_kb import cache_candidates_from_kb

# 目录大小 TTL 缓存：避免反复全量统计（首次约数秒-20s，后续秒回）
_CACHE_TTL = 300  # 秒
_cache_lock = threading.Lock()
_cache: Dict[str, object] = {"ts": 0.0, "items": None}


def dir_size_bytes(path: str, max_files: int = 20000, max_bytes: int = 3 * 1024**3) -> int:
    """递归统计目录大小（失败返回 0）。

    带快速终止上限：单个目录文件数超过 max_files 或累计大小超过 max_bytes 时提前返回，
    避免个别海量小文件目录（浏览器/IDE 缓存可达数十万文件）拖垮首次全量统计。
    返回值为估算值（UI 已按「约」对待），足以指导用户判断是否清理。
    """
    total = 0
    n = 0
    try:
        for root, _dirs, files in os.walk(path):
            for fn in files:
                try:
                    total += (Path(root) / fn).stat().st_size
                except OSError:
                    pass
                n += 1
                if n >= max_files or total >= max_bytes:
                    return total
    except OSError:
        pass
    return total


def _exists(p) -> bool:
    try:
        return bool(p) and Path(p).exists()
    except OSError:
        return False


def _extra_candidates() -> List[dict]:
    """按实际安装情况动态探测的高价值缓存子目录。"""
    local = os.environ.get("LOCALAPPDATA", "")
    appdata = os.environ.get("APPDATA", "")
    extra: List[dict] = []

    def add(item: dict):
        if _exists(item["path"]):
            extra.append(item)

    if local:
        # 浏览器 Code Cache / GPU Cache / Service Worker（体积常比 Cache 大）
        for app, base in [
            ("Chrome 浏览器", os.path.join(local, "Google", "Chrome", "User Data", "Default")),
            ("Microsoft Edge", os.path.join(local, "Microsoft", "Edge", "User Data", "Default")),
            ("Brave 浏览器", os.path.join(local, "BraveSoftware", "Brave-Browser", "User Data", "Default")),
        ]:
            for sub, desc in [
                ("Code Cache", "编译后的 JS/脚本代码缓存"),
                ("GPU Cache", "GPU 渲染缓存"),
                ("Service Worker", "网页离线/后台脚本缓存"),
            ]:
                add({
                    "id": f"dyn_{app}_{sub}",
                    "label": f"{app} {sub}",
                    "path": os.path.join(base, sub),
                    "app": app,
                    "app_attached": True,
                    "description": f"{desc}，依附于 {app}。",
                    "delete_impact": "删除后重新生成，不影响书签/密码/历史。",
                    "recommendation": "recommend",
                    "risk": "low",
                    "category": "app_cache",
                    "bytes": 0,
                })
        # Firefox 各配置文件的 cache2（真正的缓存，不碰 Profiles 其它内容）
        ff_root = os.path.join(local, "Mozilla", "Firefox", "Profiles")
        if _exists(ff_root):
            for prof in glob.glob(os.path.join(ff_root, "*", "cache2")):
                add({
                    "id": "dyn_firefox_cache2_" + Path(prof).parent.name,
                    "label": f"Firefox 缓存（{Path(prof).parent.name[:16]}）",
                    "path": prof,
                    "app": "Firefox 浏览器",
                    "app_attached": True,
                    "description": "Firefox 网页缓存（cache2），依附于 Firefox。",
                    "delete_impact": "删除后首次访问稍慢，安全。",
                    "recommendation": "recommend",
                    "risk": "low",
                    "category": "app_cache",
                    "bytes": 0,
                })
        # 微信按账号的 FileStorage 缓存（不碰聊天记录本体）
        for wx_root_name in ("WeChat Files", "xwechat_files"):
            wx_root = os.path.join(local, "Tencent", wx_root_name)
            if _exists(wx_root):
                for acct in glob.glob(os.path.join(wx_root, "*")):
                    if not os.path.isdir(acct):
                        continue
                    fs = os.path.join(acct, "FileStorage")
                    if not _exists(fs):
                        continue
                    for sub, desc in [
                        ("Cache", "图片/文件收发缓存"),
                        ("Temp", "临时文件"),
                        ("Video", "视频缓存"),
                    ]:
                        p = os.path.join(fs, sub)
                        add({
                            "id": f"dyn_wx_{Path(acct).name}_{sub}",
                            "label": f"微信缓存（{Path(acct).name[:12]} · {desc}）",
                            "path": p,
                            "app": "微信",
                            "app_attached": True,
                            "description": f"微信{desc}，依附于微信，位于聊天文件目录内。",
                            "delete_impact": "仅清理缓存，不影响聊天记录与已接收文件本体。",
                            "recommendation": "recommend",
                            "risk": "low",
                            "category": "app_cache",
                            "bytes": 0,
                        })
        # JetBrains 缓存子目录（.cache 等）
        jb_root = os.path.join(local, "JetBrains")
        if _exists(jb_root):
            for prod in glob.glob(os.path.join(jb_root, "*")):
                if os.path.isdir(prod) and not Path(prod).name.startswith("."):
                    for sub in ("caches", "log", "tmp"):
                        p = os.path.join(prod, sub)
                        add({
                            "id": f"dyn_jb_{Path(prod).name}_{sub}",
                            "label": f"JetBrains 缓存（{Path(prod).name} · {sub}）",
                            "path": p,
                            "app": "JetBrains IDE",
                            "app_attached": True,
                            "description": f"JetBrains {Path(prod).name} 的 {sub} 目录，依附于该 IDE。",
                            "delete_impact": "删除后 IDE 重建缓存/日志，安全。",
                            "recommendation": "recommend",
                            "risk": "low",
                            "category": "app_cache",
                            "bytes": 0,
                        })

    if appdata:
        # VS Code 缓存子目录
        for sub in ("Cache", "CachedData", "CachedExtensionVSIXs"):
            p = os.path.join(appdata, "Code", sub)
            add({
                "id": f"dyn_vscode_{sub}",
                "label": f"VS Code {sub}",
                "path": p,
                "app": "Visual Studio Code",
                "app_attached": True,
                "description": f"VS Code 的 {sub}，依附于 VS Code。",
                "delete_impact": "删除后 VS Code 重建，安全。",
                "recommendation": "recommend",
                "risk": "low",
                "category": "app_cache",
                "bytes": 0,
            })
    return extra


def candidate_cache_dirs(force: bool = False) -> List[dict]:
    """返回可安全清理的缓存目录候选（含完整元数据）。

    来源：知识库推荐/谨慎条目 + 动态探测子目录。
    顺序：按大小从大到小；不存在或大小为 0 的仍保留（方便前端显示状态）。

    性能：目录大小用线程池并行统计（IO 密集，约 6-8 倍提速），结果带 TTL 缓存，
    清理成功后前端传 force=True 立即刷新。
    """
    with _cache_lock:
        if not force and _cache["items"] is not None and (time.time() - _cache["ts"]) < _CACHE_TTL:
            return _cache["items"]

    raw = cache_candidates_from_kb() + _extra_candidates()
    seen: Dict[str, dict] = {}
    for item in raw:
        path = item.get("path", "")
        if not path:
            continue
        if len(os.path.normpath(path)) <= 3:
            continue  # 防盘符根
        seen[path] = item

    # 并行统计各目录大小
    paths = list(seen.keys())
    def _measure(path: str):
        try:
            return path, dir_size_bytes(path), _exists(path)
        except Exception:  # noqa: BLE001
            return path, 0, _exists(path)

    with ThreadPoolExecutor(max_workers=min(16, max(1, len(paths)))) as ex:
        for path, size, exists in ex.map(_measure, paths):
            seen[path]["bytes"] = size
            seen[path]["exists"] = exists

    out = list(seen.values())
    out.sort(key=lambda x: x["bytes"], reverse=True)
    with _cache_lock:
        _cache["items"] = out
        _cache["ts"] = time.time()
    return out


def cache_overview(force: bool = False) -> dict:
    """缓存清理总览：合计可释放、各推荐等级分布、是否依附应用统计。"""
    items = candidate_cache_dirs(force=force)
    total = sum(i["bytes"] for i in items)
    by_rec: Dict[str, int] = {}
    attached_bytes = 0
    attached_count = 0
    for i in items:
        by_rec[i["recommendation"]] = by_rec.get(i["recommendation"], 0) + i["bytes"]
        if i.get("app_attached"):
            attached_bytes += i["bytes"]
            attached_count += 1
    return {
        "count": len(items),
        "total_bytes": total,
        "by_recommendation": by_rec,
        "attached_count": attached_count,
        "attached_bytes": attached_bytes,
        "items": items,
    }
