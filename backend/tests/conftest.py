"""pytest 全局配置：隔离数据目录，避免测试污染真实扫描库。"""
import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def _isolate_log_dir():
    """将 log_dir() 指向临时目录，测试产生的扫描库不写入真实 APPDATA。"""
    tmp = Path(tempfile.mkdtemp(prefix="dca_test_log_"))
    old = os.environ.get("DISK_CLEANUP_LOG_DIR")
    os.environ["DISK_CLEANUP_LOG_DIR"] = str(tmp)
    yield tmp
    if old is None:
        os.environ.pop("DISK_CLEANUP_LOG_DIR", None)
    else:
        os.environ["DISK_CLEANUP_LOG_DIR"] = old
