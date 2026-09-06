"""删除管理器：默认移入回收站，永久删除为高级选项。

安全红线：
1. 仅接受手动勾选路径（由 API 层传入）
2. 二次确认在前端弹窗完成；后端仅执行
3. 保护路径一律拒绝（is_protected_path）
4. 每次删除写入审计日志
"""
import os
import shutil
import subprocess
from pathlib import Path
from typing import List

from .audit_log import log_deletion
from .config import is_protected_path


def create_restore_point(description: str = "本地工具箱删除前还原点") -> bool:
    """尝试创建系统还原点（需管理员权限 + 系统保护已开启）。失败不影响删除。"""
    try:
        ps = (
            "Checkpoint-Computer -Description "
            + repr(description)
            + " -RestorePointType MODIFY_SETTINGS"
        )
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            capture_output=True, timeout=25,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return r.returncode == 0
    except Exception:  # noqa: BLE001 还原点失败不阻断删除
        return False


def _reject_protected(paths: List[str]) -> List[str]:
    """返回命中的保护路径。"""
    return [p for p in paths if is_protected_path(p)]


def _size_of_path(path: str, max_files: int = 20000, max_bytes: int = 3 * 1024**3) -> int:
    """估算文件/目录总大小（目录递归求和，失败取 0）。

    带快速终止上限（与 cache_dirs.dir_size_bytes 一致）：单个目录文件数超过
    max_files 或累计大小超过 max_bytes 时提前返回，避免超大缓存目录在删除前
    统计时长时间卡住 UI。返回值为估算值，仅用于展示释放空间。
    """
    p = Path(path)
    if p.is_file():
        try:
            return p.stat().st_size
        except OSError:
            return 0
    total = 0
    n = 0
    try:
        for root, _dirs, files in os.walk(p):
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


def recycle(paths: List[str], restore_point: bool = False) -> dict:
    """将路径移到回收站。返回合并结果。"""
    import send2trash

    protected = _reject_protected(paths)
    if protected:
        raise PermissionError(f"以下路径受系统保护，拒绝删除: {protected}")

    if restore_point:
        create_restore_point()

    ok = []
    failed = []
    freed = 0
    for p in paths:
        if not os.path.exists(p):
            failed.append({"path": p, "error": "路径不存在"})
            continue
        try:
            size = _size_of_path(p)
            send2trash.send2trash(p)
            log_deletion(p, size, permanent=False)
            ok.append({"path": p, "size": size})
            freed += size
        except Exception as exc:  # noqa: BLE001 保留原始错误给前端展示
            failed.append({"path": p, "error": str(exc)})
    return {"ok": ok, "failed": failed, "freed_bytes": freed}


def permanent_delete(paths: List[str], restore_point: bool = False) -> dict:
    """永久删除（高级选项）。仍受保护拦截。"""
    protected = _reject_protected(paths)
    if protected:
        raise PermissionError(f"以下路径受系统保护，拒绝删除: {protected}")

    if restore_point:
        create_restore_point()

    ok = []
    failed = []
    freed = 0
    for p in paths:
        if not os.path.exists(p):
            failed.append({"path": p, "error": "路径不存在"})
            continue
        try:
            size = _size_of_path(p)
            target = Path(p)
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
            log_deletion(p, size, permanent=True)
            ok.append({"path": p, "size": size})
            freed += size
        except Exception as exc:  # noqa: BLE001
            failed.append({"path": p, "error": str(exc)})
    return {"ok": ok, "failed": failed, "freed_bytes": freed}
