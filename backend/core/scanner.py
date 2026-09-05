"""Scan engine: recursive os.scandir + SQLite storage + generator streaming.

- Skip unreadable directories (PermissionError / OSError) and reparse points (junction/symlink)
- Collect: path / size / mtime / ctime / extension（不再读取文件内容，纯元数据扫描）
- Deep analysis per file: purpose / owner (registry install-location index) / recommendation / risk / reason
- Real-time progress via polling /scan/status（percent = 已统计字节 / 盘已用空间）
- Pause / resume / cancel
- Results paginated via SQLite LIMIT/OFFSET for virtual scroll
"""
import json
import os
import re
import shutil
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Dict, List, Optional

from .classifier import classify
from .config import PAGE_SIZE, log_dir
from .file_analysis import analyze, prime_owner_index
from .protected_paths import ProtectedMatcher

BATCH_SIZE = 2000
_FILE_ATTRIBUTE_REPARSE_POINT = 0x400  # junction/symlink，跳过防止循环遍历
SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT NOT NULL UNIQUE,
    size       INTEGER NOT NULL DEFAULT 0,
    mtime      REAL,
    ctime      REAL,
    ext        TEXT NOT NULL DEFAULT '',
    magic      TEXT,
    category   TEXT NOT NULL DEFAULT 'docs',
    is_locked  INTEGER NOT NULL DEFAULT 0,
    is_dir     INTEGER NOT NULL DEFAULT 0,
    purpose    TEXT NOT NULL DEFAULT '',
    owner      TEXT NOT NULL DEFAULT '',
    recommendation TEXT NOT NULL DEFAULT 'caution',
    risk       TEXT NOT NULL DEFAULT 'medium',
    reason     TEXT NOT NULL DEFAULT '',
    needs_ai   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
CREATE INDEX IF NOT EXISTS idx_files_size ON files(size);
CREATE INDEX IF NOT EXISTS idx_files_cat_size ON files(category, size);
CREATE INDEX IF NOT EXISTS idx_files_recommendation ON files(recommendation);
"""
# 兼容旧扫描库（没有深度分析列）：动态补齐
_MIGRATE_COLS = [
    ("purpose", "TEXT NOT NULL DEFAULT ''"),
    ("owner", "TEXT NOT NULL DEFAULT ''"),
    ("recommendation", "TEXT NOT NULL DEFAULT 'caution'"),
    ("risk", "TEXT NOT NULL DEFAULT 'medium'"),
    ("reason", "TEXT NOT NULL DEFAULT ''"),
    ("needs_ai", "INTEGER NOT NULL DEFAULT 0"),
]


def open_db_checked(db_path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    # 性能：WAL + 异步写入，批量插入吞吐提升数倍
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(SCHEMA)
    conn.commit()
    # 迁移：补齐深度分析列（旧库动态加列）
    cols = {r[1] for r in conn.execute("PRAGMA table_info(files)").fetchall()}
    for name, ddl in _MIGRATE_COLS:
        if name not in cols:
            conn.execute(f"ALTER TABLE files ADD COLUMN {name} {ddl}")
    conn.commit()
    # needs_ai 索引：迁移后再建，保证旧库也能建
    conn.execute("CREATE INDEX IF NOT EXISTS idx_files_needs_ai ON files(needs_ai)")
    conn.commit()
    return conn


def read_magic(path: str, limit: int = 8) -> Optional[str]:
    """Read the first `limit` bytes of a file as uppercase hex."""
    try:
        with open(path, "rb") as f:
            data = f.read(limit)
        return data.hex(" ").upper() if data else None
    except OSError:
        return None


def _safe_utf8(s: str) -> str:
    """净化含非法代理项/孤立 surrogates 的字符串，避免写入 SQLite 时 utf-8 编码崩溃。"""
    try:
        s.encode("utf-8")
        return s
    except UnicodeEncodeError:
        return s.encode("utf-8", "replace").decode("utf-8")


@dataclass
class ScanStats:
    scan_id: str = ""
    drive: str = ""
    status: str = "idle"          # running/paused/completed/cancelled/error
    files_count: int = 0
    dirs_seen: int = 0
    bytes_scanned: int = 0
    errors: int = 0
    current_path: str = ""
    start_ms: int = 0
    end_ms: int = 0
    message: str = ""
    total_bytes: int = 0          # 扫描盘已用空间（真实进度分母）
    drive_free: int = 0

    def to_dict(self) -> dict:
        elapsed = (self.end_ms or int(time.time() * 1000)) - self.start_ms
        # 真实进度：已统计字节 / 盘已用空间。无法获取盘容量时退化为文件数进度（封顶 98%）
        if self.total_bytes > 0:
            pct = min(99, round(self.bytes_scanned / self.total_bytes * 100))
        elif self.status in ("completed", "cancelled", "error"):
            pct = 100
        else:
            pct = min(98, round(min(self.files_count, 500000) / 500000 * 98))
        if self.status in ("completed", "cancelled", "error"):
            pct = 100
        return {
            "scan_id": self.scan_id,
            "drive": self.drive,
            "status": self.status,
            "files_count": self.files_count,
            "dirs_seen": self.dirs_seen,
            "bytes_scanned": self.bytes_scanned,
            "errors": self.errors,
            "current_path": self.current_path,
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "elapsed_ms": max(0, elapsed),
            "message": self.message,
            "total_bytes": self.total_bytes,
            "percent": pct,
        }


class _Session:
    """One scan session: DB + worker thread + pause/cancel events."""

    def __init__(self, scan_id: str, drive: str, db_path):
        self.scan_id = scan_id
        self.drive = drive
        self.db_path = db_path
        self.stats = ScanStats(scan_id=scan_id, drive=drive, status="starting",
                               start_ms=int(time.time() * 1000))
        self.thread: Optional[threading.Thread] = None
        self.pause_event = threading.Event()
        self.pause_event.set()  # initially running
        self.cancel_flag = threading.Event()
        self.db_lock = threading.Lock()
        self.conn = None
        self.large_file_bytes: Optional[int] = None

    def open_db(self):
        self.conn = open_db_checked(self.db_path)


class ScanController:
    def __init__(self):
        self._sessions: Dict[str, _Session] = {}
        self._lock = threading.Lock()

    # ---------- session management ----------
    def start(self, drive: str, large_file_mb: Optional[int] = None) -> str:
        drive = drive.strip()
        if re.match(r"^[a-zA-Z]:$", drive) or len(drive) == 1:
            drive = drive[0].upper() + ":\\"
        else:
            drive = os.path.abspath(drive)
        if not os.path.exists(drive):
            raise ValueError("path does not exist: " + drive)
        # 用磁盘总用量估算真实进度
        try:
            usage = shutil.disk_usage(drive)
            total_bytes, free_bytes = usage.total, usage.free
        except OSError:
            total_bytes, free_bytes = 0, 0
        scan_id = uuid.uuid4().hex[:12]
        db_path = log_dir() / "scans" / f"{scan_id}.db"
        session = _Session(scan_id, drive, db_path)
        session.large_file_bytes = int(large_file_mb) * 1024 * 1024 if large_file_mb else None
        session.stats.total_bytes = total_bytes
        session.stats.drive_free = free_bytes
        with self._lock:
            self._sessions[scan_id] = session
        # 持久化 meta：后端重启后可从磁盘恢复本次扫描（不再丢结果）
        try:
            (log_dir() / "scans" / f"{scan_id}.json").write_text(
                json.dumps({"drive": drive, "total_bytes": total_bytes, "drive_free": free_bytes}),
                encoding="utf-8")
        except OSError:
            pass
        session.open_db()
        session.thread = threading.Thread(
            target=self._run, args=(session,), daemon=True, name=f"scan-{scan_id}"
        )
        session.thread.start()
        return scan_id

    def _flush(self, session, batch):
        if not batch:
            return
        with session.db_lock:
            session.conn.executemany(
                """INSERT OR REPLACE INTO files
                   (path,size,mtime,ctime,ext,magic,category,is_locked,is_dir,purpose,owner,recommendation,risk,reason,needs_ai)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                batch,
            )
            session.conn.commit()

    def _run(self, session: _Session) -> None:
        matcher = ProtectedMatcher()
        prime_owner_index()  # 构建注册表软件归属索引（每扫描一次）
        batch: List[tuple] = []
        try:
            with session.db_lock:
                session.conn.execute("DELETE FROM files")
                session.conn.commit()

            if session.stats.status == "starting":
                session.stats.status = "running"

            stack = [session.drive]
            cancelled = False
            while stack:
                if session.cancel_flag.is_set():
                    cancelled = True
                    break
                if not session.pause_event.is_set():
                    session.stats.status = "paused"
                    session.pause_event.wait()
                    if session.stats.status == "paused":
                        session.stats.status = "running"

                current = stack.pop()
                session.stats.current_path = current
                session.stats.dirs_seen += 1

                try:
                    with os.scandir(current) as it:
                        entries = [e for e in it]
                except (PermissionError, OSError):
                    session.stats.errors += 1
                    continue

                for entry in entries:
                    if session.cancel_flag.is_set():
                        cancelled = True
                        break
                    if not session.pause_event.is_set():
                        session.stats.status = "paused"
                        session.pause_event.wait()
                        if session.stats.status == "paused":
                            session.stats.status = "running"
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            # junction/symlink 一律不入栈，防止循环遍历与跨盘重复扫描
                            try:
                                if entry.stat(follow_symlinks=False).st_file_attributes & _FILE_ATTRIBUTE_REPARSE_POINT:
                                    continue
                            except (PermissionError, OSError):
                                pass
                            stack.append(entry.path)
                            continue
                        st = entry.stat(follow_symlinks=False)
                        ext = os.path.splitext(entry.name)[1].lower()
                        locked = 1 if matcher.is_protected(entry.path) else 0
                        category = classify(entry.path, st.st_size, ext, is_protected=bool(locked),
                                            large_file_bytes=session.large_file_bytes)
                        if category == "system":
                            locked = 1
                        analysis = analyze(
                            entry.path, st.st_size, ext,
                            category=category, is_protected=bool(locked),
                        )
                        batch.append((_safe_utf8(entry.path), st.st_size, st.st_mtime, st.st_ctime,
                                      ext, None, category, locked, 0,
                                      _safe_utf8(analysis["purpose"]), _safe_utf8(analysis["owner"]),
                                      analysis["recommendation"], analysis["risk"],
                                      _safe_utf8(analysis["recommendation_reason"]),
                                      1 if analysis.get("needs_ai") else 0))
                        session.stats.files_count += 1
                        session.stats.bytes_scanned += st.st_size
                        if len(batch) >= BATCH_SIZE:
                            self._flush(session, batch)
                            batch.clear()
                    except (PermissionError, OSError):
                        session.stats.errors += 1
                if cancelled:
                    break

            if cancelled:
                self._flush(session, batch)
                session.stats.status = "cancelled"
                session.stats.message = "user cancelled"
            else:
                self._flush(session, batch)
                session.stats.status = "completed"
                session.stats.message = "done"
        except Exception as exc:  # noqa: BLE001
            session.stats.status = "error"
            session.stats.message = str(exc)
        finally:
            session.stats.end_ms = int(time.time() * 1000)
            if session.conn:
                try:
                    session.conn.commit()
                except Exception:
                    pass

    # ---------- control ----------
    def pause(self, scan_id: str) -> dict:
        session = self._get(scan_id)
        if session and session.thread and session.thread.is_alive() and session.stats.status == "running":
            session.pause_event.clear()
            session.stats.status = "paused"
            return {"ok": True, "message": "paused"}
        status = session.stats.status if session else "missing"
        return {"ok": False, "message": "cannot pause status=" + status}

    def resume(self, scan_id: str) -> dict:
        session = self._get(scan_id)
        if session and session.thread and session.thread.is_alive() and session.stats.status == "paused":
            session.pause_event.set()
            session.stats.status = "running"
            return {"ok": True, "message": "resumed"}
        status = session.stats.status if session else "missing"
        return {"ok": False, "message": "cannot resume status=" + status}

    def cancel(self, scan_id: str) -> dict:
        session = self._get(scan_id)
        if not session:
            return {"ok": False, "message": "missing"}
        session.cancel_flag.set()
        session.pause_event.set()
        session.stats.status = "cancelled"
        return {"ok": True, "message": "cancel requested"}

    def status(self, scan_id: str) -> Optional[dict]:
        session = self._get(scan_id)
        if not session:
            return None
        return session.stats.to_dict()

    def _get(self, scan_id: str) -> Optional[_Session]:
        with self._lock:
            s = self._sessions.get(scan_id)
            if s:
                return s
        return self._restore(scan_id)

    # ---------- persistence / restore ----------
    def _restore(self, scan_id: str) -> Optional[_Session]:
        """从磁盘恢复已完成的历史扫描（后端重启 / 软件重启后不丢结果）。"""
        if not re.fullmatch(r"[0-9a-f]{12}", scan_id or ""):
            return None
        db = log_dir() / "scans" / f"{scan_id}.db"
        if not db.exists():
            return None
        with self._lock:
            if scan_id in self._sessions:
                return self._sessions[scan_id]
            drive = "C:\\"
            total_bytes = 0
            drive_free = 0
            meta = log_dir() / "scans" / f"{scan_id}.json"
            if meta.exists():
                try:
                    m = json.loads(meta.read_text(encoding="utf-8"))
                    drive = m.get("drive", drive)
                    total_bytes = int(m.get("total_bytes", 0) or 0)
                    drive_free = int(m.get("drive_free", 0) or 0)
                except (OSError, ValueError):
                    pass
            session = _Session(scan_id, drive, db)
            session.stats.total_bytes = total_bytes
            session.stats.drive_free = drive_free
            session.open_db()
            session.stats.status = "completed"
            session.stats.message = "restored"
            session.stats.end_ms = int(db.stat().st_mtime * 1000)
            try:
                row = session.conn.execute("SELECT COUNT(*), COALESCE(SUM(size),0) FROM files").fetchone()
                session.stats.files_count = int(row[0] or 0) if row else 0
                session.stats.bytes_scanned = int(row[1] or 0) if row else 0
            except sqlite3.Error:
                pass
            self._sessions[scan_id] = session
            return session

    def recent_scan_id(self) -> Optional[str]:
        """返回最近一次存在的扫描 id（按 db 文件 mtime 取最新，跳过测试污染库）。"""
        scans_dir = log_dir() / "scans"
        try:
            # 真实盘扫描库体积通常在数百 MB~数 GB；<10MB 的多为测试/孤儿库，直接排除
            files = [p for p in scans_dir.glob("*.db") if p.stat().st_size > 10 * 1024 * 1024]
        except OSError:
            return None
        if not files:
            return None

        def _skip(p) -> bool:
            # 跳过测试产生的扫描库（drive 指向 tests_tmp* 临时目录）
            meta = scans_dir / f"{p.stem}.json"
            if meta.exists():
                try:
                    m = json.loads(meta.read_text(encoding="utf-8"))
                    d = str(m.get("drive", ""))
                    if "tests_tmp" in d or "dca_test_log" in d:
                        return True
                except (OSError, ValueError):
                    pass
            return False

        files = [p for p in files if not _skip(p)]
        if not files:
            return None
        latest = max(files, key=lambda p: p.stat().st_mtime)
        return latest.stem


    # ---------- query ----------
    def query(self, scan_id: str, category: Optional[str] = None, min_size: int = 0,
              keyword: Optional[str] = None, only_locked: Optional[bool] = None,
              recommendation: Optional[str] = None, ext: Optional[str] = None,
              owner: Optional[str] = None, needs_ai: Optional[bool] = None,
              page: int = 0, page_size: int = PAGE_SIZE,
              sort: str = "size_desc") -> dict:
        session = self._get(scan_id)
        if not session or not session.db_path.exists():
            return {"items": [], "total": 0, "page": page, "page_size": page_size}

        where, params = [], []
        if category:
            where.append("category = ?")
            params.append(category)
        if min_size and min_size > 0:
            where.append("size >= ?")
            params.append(min_size)
        if keyword:
            where.append("(path LIKE ? OR purpose LIKE ? OR owner LIKE ?)")
            params.extend([f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"])
        if only_locked is not None:
            where.append("is_locked = ?")
            params.append(1 if only_locked else 0)
        if recommendation:
            where.append("recommendation = ?")
            params.append(recommendation)
        if ext:
            where.append("ext = ?")
            params.append(ext.lower())
        if owner:
            where.append("owner = ?")
            params.append(owner)
        if needs_ai is not None:
            where.append("needs_ai = ?")
            params.append(1 if needs_ai else 0)

        sql_where = " WHERE " + " AND ".join(where) if where else ""
        order = {
            "size_desc": "size DESC, path ASC",
            "size_asc": "size ASC, path ASC",
            "mtime_desc": "mtime DESC, path ASC",
            "mtime_asc": "mtime ASC, path ASC",
            "path_asc": "path ASC",
            "recommend_desc": "CASE recommendation WHEN 'recommend' THEN 0 WHEN 'caution' THEN 1 "
                              "WHEN 'keep' THEN 2 ELSE 3 END, size DESC, path ASC",
        }.get(sort, "size DESC, path ASC")

        conn = sqlite3.connect(str(session.db_path))
        conn.row_factory = sqlite3.Row
        try:
            total = conn.execute(
                "SELECT COUNT(*) AS c FROM files" + sql_where, params
            ).fetchone()["c"]
            rows = conn.execute(
                "SELECT id,path,size,mtime,ctime,ext,magic,category,is_locked,is_dir,"
                "purpose,owner,recommendation,risk,reason AS recommendation_reason,needs_ai "
                f"FROM files{sql_where} ORDER BY {order} LIMIT {page_size} OFFSET {page * page_size}",
                params,
            ).fetchall()
        finally:
            conn.close()
        return {"items": [dict(r) for r in rows], "total": total,
                "page": page, "page_size": page_size}

    def query_paths(self, scan_id: str, category: Optional[str] = None, min_size: int = 0,
                    keyword: Optional[str] = None, only_locked: Optional[bool] = None,
                    recommendation: Optional[str] = None, ext: Optional[str] = None,
                    owner: Optional[str] = None, needs_ai: Optional[bool] = None,
                    sort: str = "size_desc", limit: int = 100000) -> list:
        """按筛选返回所有匹配且非锁定的文件 path（供前端一键全选）。

        仅返回 path 列，体积远小于全行；自动排除系统锁定文件。
        """
        session = self._get(scan_id)
        if not session or not session.db_path.exists():
            return []

        where, params = ["is_locked = 0"], []
        if category:
            where.append("category = ?")
            params.append(category)
        if min_size and min_size > 0:
            where.append("size >= ?")
            params.append(min_size)
        if keyword:
            where.append("(path LIKE ? OR purpose LIKE ? OR owner LIKE ?)")
            params.extend([f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"])
        if recommendation:
            where.append("recommendation = ?")
            params.append(recommendation)
        if ext:
            where.append("ext = ?")
            params.append(ext.lower())
        if owner:
            where.append("owner = ?")
            params.append(owner)
        if needs_ai is not None:
            where.append("needs_ai = ?")
            params.append(1 if needs_ai else 0)

        sql_where = " WHERE " + " AND ".join(where)
        order = {
            "size_desc": "size DESC, path ASC",
            "size_asc": "size ASC, path ASC",
            "mtime_desc": "mtime DESC, path ASC",
            "mtime_asc": "mtime ASC, path ASC",
            "path_asc": "path ASC",
            "recommend_desc": "CASE recommendation WHEN 'recommend' THEN 0 WHEN 'caution' THEN 1 "
                              "WHEN 'keep' THEN 2 ELSE 3 END, size DESC, path ASC",
        }.get(sort, "size DESC, path ASC")
        conn = sqlite3.connect(str(session.db_path))
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT path FROM files" + sql_where + f" ORDER BY {order} LIMIT {int(limit)}", params
            ).fetchall()
            return [r["path"] for r in rows]
        finally:
            conn.close()

    def statistics(self, scan_id: str) -> Optional[dict]:
        session = self._get(scan_id)
        if not session or not session.db_path.exists():
            return None
        conn = sqlite3.connect(str(session.db_path))
        try:
            total_files, total_bytes = conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(size),0) FROM files"
            ).fetchone()
            cats = conn.execute(
                "SELECT category, COUNT(*), COALESCE(SUM(size),0) FROM files GROUP BY category"
            ).fetchall()
            recs = conn.execute(
                "SELECT recommendation, COUNT(*), COALESCE(SUM(size),0) FROM files GROUP BY recommendation"
            ).fetchall()
        finally:
            conn.close()
        return {
            "total_files": total_files,
            "total_bytes": total_bytes,
            "categories": {r[0]: {"count": r[1], "bytes": r[2]} for r in cats},
            "recommendations": {r[0]: {"count": r[1], "bytes": r[2]} for r in recs},
        }

    def drop(self, scan_id: str) -> None:
        session = self._get(scan_id)
        if session and session.db_path.exists():
            try:
                session.db_path.unlink()
            except OSError:
                pass
        with self._lock:
            self._sessions.pop(scan_id, None)

    def _prune_old_scan_dbs(self, keep_days: int = 7) -> int:
        """清理超过 keep_days 且不在活跃会话中的旧扫描库，防止磁盘堆积。"""
        scans_dir = log_dir() / "scans"
        if not scans_dir.exists():
            return 0
        with self._lock:
            active = set(self._sessions.keys())
        removed = 0
        now = time.time()
        try:
            for f in scans_dir.glob("*.db*"):
                if f.suffix != ".db":
                    continue
                sid = f.stem
                if sid in active:
                    continue
                try:
                    if now - f.stat().st_mtime > keep_days * 86400:
                        f.unlink(missing_ok=True)
                        removed += 1
                except OSError:
                    pass
        except OSError:
            pass
        return removed



controller = ScanController()