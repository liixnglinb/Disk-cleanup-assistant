"""重复文件检测：先按大小分组，同大小文件算 MD5，确认内容完全相同后列出。"""
import hashlib
import os
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

BATCH = 256


def _md5(path: str, chunk: int = 1 << 20) -> Optional[str]:
    h = hashlib.md5()
    try:
        with open(path, "rb") as f:
            while True:
                b = f.read(chunk)
                if not b:
                    break
                h.update(b)
        return h.hexdigest()
    except OSError:
        return None


def find_duplicates(db_path: str, progress=None) -> List[dict]:
    """从扫描 DB 中按大小分组找出内容完全相同的文件组。

    返回：[{size, files:[{path, mtime}], total_bytes}]
    """
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT id, path, size, mtime FROM files WHERE size > 0 AND is_locked = 0 AND is_dir = 0"
        ).fetchall()
    finally:
        conn.close()

    by_size: Dict[int, List[tuple]] = defaultdict(list)
    for _id, path, size, mtime in rows:
        by_size[size].append((path, mtime))

    groups: List[dict] = []
    done = 0
    total_candidates = sum(len(v) for v in by_size.values() if len(v) > 1)
    for size, fpaths in by_size.items():
        if len(fpaths) < 2:
            continue
        by_hash: Dict[str, list] = defaultdict(list)
        for path, mtime in fpaths:
            h = _md5(path)
            if h:
                by_hash[h].append((path, mtime))
            done += 1
            if progress and done % BATCH == 0:
                progress(done, total_candidates)
        for h, members in by_hash.items():
            if len(members) >= 2:
                groups.append({
                    "size": size,
                    "hash": h,
                    "files": [{"path": p, "mtime": m} for p, m in members],
                    "total_bytes": size * len(members),
                })
    groups.sort(key=lambda g: -g["size"])
    return groups
