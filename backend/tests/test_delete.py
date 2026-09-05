"""Tests for delete manager in a dedicated temp dir (never system files)."""
import os
import tempfile

import pytest

from backend.core.delete_manager import permanent_delete, recycle


def _make_file(name):
    d = tempfile.mkdtemp(prefix="dca_del_")
    p = os.path.join(d, name)
    with open(p, "wb") as f:
        f.write(b"x" * 100)
    return p, d


def test_recycle_moves_to_recycle_bin():
    p, d = _make_file("to_recycle.txt")
    assert os.path.exists(p)
    res = recycle([p])
    assert res["ok"] and res["freed_bytes"] == 100
    assert not os.path.exists(p)
    os.rmdir(d)


def test_permanent_delete_requires_no_protected():
    p, d = _make_file("to_delete.bin")
    res = permanent_delete([p])
    assert res["ok"]
    assert not os.path.exists(p)
    os.rmdir(d)


def test_protected_rejected():
    with pytest.raises(PermissionError):
        permanent_delete([r"C:\Windows\System32\kernel32.dll"])