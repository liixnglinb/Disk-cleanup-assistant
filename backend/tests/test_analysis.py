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


def test_wechat_msg_data_not_recommended():
    # 高危回归：微信聊天数据库 analyze 后必须“建议保留·高风险”，绝不能“推荐删除”
    a = analyze(r"C:\Users\Me\Documents\WeChat Files\wxid_abc\Msg\Multi\msg_0.db",
                5 * 1024 * 1024, ".db", category="app_data")
    assert a["recommendation"] == "keep"
    assert a["risk"] == "high"
    assert "聊天记录" in a["recommendation_reason"]


def test_wechat_cache_still_recommended():
    # 微信明确缓存子目录仍推荐删除（低风险，可重建）
    a = analyze(r"C:\Users\Me\Documents\WeChat Files\wxid_abc\FileStorage\Cache\a.dat",
                1000, ".dat", category="cache")
    assert a["recommendation"] == "recommend"
    assert a["risk"] == "low"


def test_unknown_analysis_caution():
    a = analyze(r"D:\misc\weird.xyz", 1000, ".xyz", category="unknown")
    assert a["recommendation"] == "caution"
    assert a["needs_ai"] == 1


def test_docs_no_ai_flag():
    # 已知用户文档不再标 AI 存疑
    a = analyze(r"D:\docs\report.docx", 512, ".docx", category="docs")
    assert a["needs_ai"] == 0


def test_cache_mixed_medium_risk():
    # 非明确可重建段（如 NVIDIA DXCache）缓存 -> 中风险
    a = analyze(r"C:\Users\Me\AppData\Local\NVIDIA\DXCache\abc",
                1024, ".dat", category="cache")
    assert a["recommendation"] == "recommend"
    assert a["risk"] == "medium"


def test_owner_keyword_no_longer_substring_match():
    # 路径含 nvidia 字样但不属于 NVIDIA 目录 -> 不再归属 NVIDIA
    a = analyze(r"D:\Downloads\nvidia-driver-setup.exe", 500, ".exe", category="download")
    assert a["owner"] != "NVIDIA"