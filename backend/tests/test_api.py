"""API tests using FastAPI TestClient."""
import time

from fastapi.testclient import TestClient
from scripts.make_test_tree import build

from backend.main import app
from backend.core.scanner import controller

client = TestClient(app)


def _scan_and_wait():
    root = build("tests_tmp_api")
    scan_id = controller.start(root)
    deadline = time.time() + 40
    while time.time() < deadline:
        st = controller.status(scan_id)
        if st and st["status"] in ("completed", "cancelled", "error"):
            return scan_id, st
        time.sleep(0.2)
    raise TimeoutError("scan timeout")


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_scan_api_and_query():
    scan_id, st = _scan_and_wait()
    assert st["status"] == "completed"
    r = client.post("/api/files/query", json={
        "scan_id": scan_id, "category": "docs", "page": 0, "page_size": 500,
    })
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    controller.drop(scan_id)


def test_delete_protected_rejected_by_api():
    r = client.post("/api/delete/", json={
        "paths": [r"C:\Windows\System32\kernel32.dll"],
        "permanent": False,
    })
    assert r.status_code == 403

def test_tools_listing():
    r = client.get("/api/tools")
    assert r.status_code == 200
    ids = [t["id"] for t in r.json()["items"]]
    assert "disk-cleanup" in ids
    assert r.json()["count"] >= 1

def test_kb_folders():
    r = client.get("/api/kb/folders")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 40
    for it in items:
        assert it["recommendation"] in ("recommend", "caution", "keep", "system")
        assert it["risk"] in ("low", "medium", "high")
        assert it["description"]
        assert "app_attached" in it
    core = [i for i in items if i["category"] == "system_core"]
    assert core and all(i["recommendation"] == "system" for i in core)


def test_kb_categories():
    r = client.get("/api/kb/categories")
    assert r.status_code == 200
    body = r.json()
    assert "categories" in body and "recommendations" in body and "risks" in body


def test_cache_candidates_safe():
    r = client.get("/api/cache/candidates")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0
    for it in items:
        assert it["category"] in ("app_cache", "system_cache", "system_temp")
        assert it["recommendation"] in ("recommend", "caution")
        low = it["path"].lower().replace("/", "\\")
        assert not low.endswith("appdata\\local")
        assert not low.endswith("appdata\\roaming")
        assert not low.endswith("\\windows")
        assert not low.endswith("\\programdata")
        assert not low.endswith("\\program files")
