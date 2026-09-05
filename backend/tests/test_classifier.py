"""Tests for file classifier."""
import os
from backend.core.classifier import classify


def test_system_protected_path():
    assert classify(r"C:\Windows\System32\kernel32.dll", 500, ".dll") == "system"


def test_system_extension():
    # 系统扩展名仅在系统区域（Windows / Program Files / ProgramData）锁定
    assert classify(r"C:\Windows\System32\driver.sys", 500, ".sys") == "system"
    assert classify(r"C:\Program Files\SomeApp\app.exe", 500, ".exe") == "system"
    assert classify(r"D:\ProgramData\vendor\driver.dll", 500, ".dll") == "system"


def test_user_exe_not_locked():
    # 用户下载/用户目录下的可执行文件不应误判为系统文件（绿色软件、安装包）
    assert classify(r"C:\Users\Leo\Downloads\tool.exe", 500, ".exe") != "system"
    assert classify(r"D:\Games\portable\game.exe", 1024 * 1024 * 200, ".exe") == "large"


def test_large_file():
    assert classify(r"D:\big.iso", 101 * 1024 * 1024, ".iso") == "large"


def test_cache_by_path():
    p = os.path.abspath(os.path.join(".", "chrome", "Cache", "x"))
    assert classify(p, 1024, ".blob") == "cache"


def test_residue_log():
    assert classify(r"D:\logs\debug.log", 1024, ".log") == "residue"


def test_docs():
    assert classify(r"D:\docs\report.docx", 512, ".docx") == "docs"