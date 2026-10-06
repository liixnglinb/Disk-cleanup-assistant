"""删除 / 卸载守卫的回归测试（v0.5.5 安全加固）。

不跑真扫描：直接往会话注册表里播种一个扫描库（路径指向 tmp_path 下自建文件），
验证"只有能在扫描库中溯源、且未被锁定的路径才允许删除"这条闸。
所有被删文件都是本测试自己创建的。
"""
import pytest
from fastapi.testclient import TestClient

from backend.core.config import log_dir
from backend.core.scanner import _Session, controller
from backend.main import app

client = TestClient(app)
SID = "guardtest001"


@pytest.fixture()
def seeded(tmp_path):
    root = tmp_path / "guard"
    root.mkdir(parents=True, exist_ok=True)
    files = {}
    for name in ("a.txt", "b.txt", "locked.txt"):
        p = root / name
        p.write_bytes(b"x" * 64)
        files[name] = str(p)
    db_dir = log_dir() / "scans"
    db_dir.mkdir(parents=True, exist_ok=True)
    db = db_dir / f"{SID}.db"
    if db.exists():
        db.unlink()
    session = _Session(SID, str(root), db)
    session.open_db()
    with session.db_lock:
        for name, path in files.items():
            session.conn.execute(
                "INSERT OR REPLACE INTO files (path, size, is_locked, category) VALUES (?,?,?,?)",
                (path, 64, 1 if name == "locked.txt" else 0, "cache"),
            )
        session.conn.commit()
    controller._sessions[SID] = session
    yield files
    controller._sessions.pop(SID, None)
    try:
        session.conn.close()
    except Exception:  # noqa: BLE001
        pass
    db.unlink(missing_ok=True)


def test_delete_allows_scanned_path(seeded):
    target = seeded["a.txt"]
    r = client.post("/api/delete/", json={"paths": [target], "permanent": True, "restore_point": False})
    assert r.status_code == 200, r.text
    assert [o["path"] for o in r.json()["ok"]] == [target]
    from pathlib import Path
    assert not Path(target).exists()


def test_delete_rejects_locked_path(seeded):
    r = client.post("/api/delete/", json={"paths": [seeded["locked.txt"]], "permanent": True, "restore_point": False})
    assert r.status_code == 403
    assert "系统锁定" in r.json()["detail"]
    from pathlib import Path
    assert Path(seeded["locked.txt"]).exists()


def test_delete_rejects_path_not_in_scan_db(seeded, tmp_path):
    outside = tmp_path / "not_scanned.txt"
    outside.write_bytes(b"y" * 64)
    r = client.post("/api/delete/", json={"paths": [str(outside)], "permanent": True, "restore_point": False})
    assert r.status_code == 403
    assert "未通过删除校验" in r.json()["detail"]
    assert outside.exists()  # 被拒绝的文件必须还在


def test_cache_clean_rejects_arbitrary_path(seeded, tmp_path):
    """守卫函数级验证。

    不用 HTTP + tmp_path：pytest 的临时目录本身就在 %LOCALAPPDATA%\\Temp 里，
    而 Temp 正是合法的缓存候选目录，走 HTTP 会"意外通过"。
    """
    from backend.api.routes_cache import _reject_unknown_cache_paths
    from backend.core.cache_dirs import candidate_cache_dirs

    bogus = "Q:\\这个盘不存在\\随便什么\\x"
    msgs = _reject_unknown_cache_paths([bogus])
    assert len(msgs) == 1 and "不在缓存候选白名单" in msgs[0]

    cands = candidate_cache_dirs()
    if cands:
        # 白名单内的目录必须放行，否则缓存清理功能会被自己锁死
        assert _reject_unknown_cache_paths([str(cands[0]["path"])]) == []


def test_uninstall_requires_registry_match(seeded):
    r = client.post("/api/software/uninstall", json={"uninstall_string": "cmd.exe /c echo pwned"})
    assert r.status_code == 403
    assert "注册表登记" in r.json()["detail"]


def test_keyword_wildcards_are_escaped(seeded):
    r = client.post("/api/files/query", json={"scan_id": SID, "keyword": "%"})
    assert r.status_code == 200
    # 未转义时 "%" 会匹配全表（3 行）；转义后按字面搜应为 0
    assert r.json()["total"] == 0
    r2 = client.post("/api/files/query", json={"scan_id": SID, "keyword": "a.txt"})
    assert r2.json()["total"] == 1


def test_negative_page_rejected(seeded):
    r = client.post("/api/files/query", json={"scan_id": SID, "page": -1})
    assert r.status_code == 422


def test_concurrent_scan_rejected():
    """同一时刻只允许一个活跃扫描。用真实 C: 扫描起停，全程只读。"""
    r1 = client.post("/api/scan/start", json={"drive": "C:"})
    assert r1.status_code == 200, r1.text
    sid = r1.json()["scan_id"]
    try:
        r2 = client.post("/api/scan/start", json={"drive": "C:"})
        assert r2.status_code == 400
        assert "已有扫描正在进行" in r2.json()["detail"]
    finally:
        client.post("/api/scan/cancel", json={"scan_id": sid})
