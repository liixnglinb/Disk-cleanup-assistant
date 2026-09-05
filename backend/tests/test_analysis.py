"""Tests for deep file analysis."""
from backend.core.file_analysis import analyze
from backend.core.classifier import classify


def test_system_analysis_locked():
    a = analyze(r"C:\Windows\System32\kernel32.dll", 500, ".dll",
                category="system", is_protected=True)
    assert a["recommendation"] == "system"
    assert a["risk"] == "high"


def test_browser_cache_recommended():
    p = r"C:\Users\Me\AppData\Local\Google\Chrome\User Data\Default\Cache\f_0001"
    a = analyze(p, 2 * 1024 * 1024, ".blob", category="cache")
    assert a["owner"] == "Chrome 浏览器"
    assert a["recommendation"] == "recommend"
    assert a["risk"] == "low"


def test_wechat_owner():
    a = analyze(r"C:\Users\Me\Documents\WeChat Files\wx\Cache\a.dat", 1000, ".dat",
                category="cache")
    assert a["owner"] == "微信"


def test_docs_keep():
    a = analyze(r"D:\docs\report.docx", 512, ".docx", category="docs")
    assert a["recommendation"] == "keep"


def test_download_category():
    assert classify(r"C:\Users\Me\Downloads\movie.mp4", 2 * 1024 * 1024 * 1024, ".mp4") == "download"
    assert classify(r"C:\Users\Me\下载\photo.jpg", 1024 * 1024, ".jpg") == "download"