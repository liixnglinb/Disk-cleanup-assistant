"""删除日志：每次删除写 JSONL，并可导出 CSV。/ P1"""
import csv
import json
import time
from pathlib import Path
from typing import List, Optional

from .config import log_dir


def _log_path() -> Path:
    return log_dir() / "deletion_log.jsonl"


def log_deletion(path: str, size: int, permanent: bool, note: str = "") -> None:
    """记录一次删除（文件或目录）。"""
    path = str(Path(path) if isinstance(path, Path) else path)
    entry = {
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "path": path,
        "name": Path(path).name,
        "size": int(size or 0),
        "permanent": bool(permanent),
        "note": note or "",
    }
    with open(_log_path(), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def list_logs() -> List[dict]:
    if not _log_path().exists():
        return []
    out = []
    with open(_log_path(), "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return out


def export_csv(target_path: Optional[str] = None) -> str:
    """导出 CSV，返回文件路径。"""
    if not target_path:
        target_path = str(log_dir() / f"deletion_log_{time.strftime('%Y%m%d_%H%M%S')}.csv")
    rows = list_logs()
    with open(target_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["时间", "文件名", "路径", "大小(字节)", "是否永久删除"])
        for r in rows:
            writer.writerow([
                r.get("time", ""), r.get("name", ""), r.get("path", ""),
                r.get("size", 0), "是" if r.get("permanent") else "否",
            ])
    return target_path
