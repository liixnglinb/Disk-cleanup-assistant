"""Tests for the scan engine (dedicated test tree only)."""
import os
import shutil
import time

from backend.core.scanner import controller
from scripts.make_test_tree import build

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _test_root(name):
    p = os.path.join(ROOT, name)
    if os.path.exists(p):
        shutil.rmtree(p)
    os.makedirs(p, exist_ok=True)
    return p


def _wait(scan_id, timeout=40):
    deadline = time.time() + timeout
    while time.time() < deadline:
        st = controller.status(scan_id)
        if st and st["status"] in ("completed", "cancelled", "error"):
            return st
        time.sleep(0.2)
    raise TimeoutError("scan did not finish")


def _build_big(root, dirs=12, files=60, size=32):
    for d in range(dirs):
        dd = os.path.join(root, "d" + str(d))
        os.makedirs(dd, exist_ok=True)
        for f in range(files):
            p = os.path.join(dd, "f" + str(f) + ".bin")
            with open(p, "wb") as fh:
                fh.write(b"0" * size)


def test_scan_and_query():
    root = _test_root("tests_tmp_scan")
    build(root)
    # add a couple of docs/residue in non-temp dirs
    with open(os.path.join(root, "note.txt"), "w") as fh:
        fh.write("hello")
    with open(os.path.join(root, "~$tmp.docx"), "w") as fh:
        fh.write("x")
    scan_id = controller.start(root)
    st = _wait(scan_id)
    assert st["status"] == "completed", st
    stats = controller.statistics(scan_id)
    assert stats["total_files"] > 8
    cats = stats["categories"]
    assert "docs" in cats and "residue" in cats
    res = controller.query(scan_id, category="cache", page=0, page_size=500)
    assert res["total"] >= 2
    res = controller.query(scan_id, min_size=100 * 1024 * 1024)
    assert res["total"] == 0
    controller.drop(scan_id)


def test_pause_resume_cancel():
    root = _test_root("tests_tmp_pause")
    _build_big(root)
    scan_id = controller.start(root)
    time.sleep(0.2)
    st = controller.status(scan_id)
    if st and st["status"] == "running":
        r = controller.pause(scan_id)
        assert r["ok"] is True, r
        assert controller.status(scan_id)["status"] == "paused"
        res = controller.resume(scan_id)
        assert res["ok"] is True, res
    controller.cancel(scan_id)
    st = _wait(scan_id)
    assert st["status"] in ("cancelled", "completed")
    controller.drop(scan_id)