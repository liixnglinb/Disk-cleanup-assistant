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


def test_wechat_data_dir_is_app_data():
    # 高危回归：微信聊天数据库绝不能判为缓存（推荐删除）
    assert classify(r"C:\Users\Me\Documents\WeChat Files\wxid_abc\Msg\Multi\msg_0.db",
                    5 * 1024 * 1024, ".db") == "app_data"
    assert classify(r"C:\Users\Me\Documents\WeChat Files\wxid_abc\FileStorage\Message\IMG_001.jpg",
                    1000, ".jpg") == "app_data"


def test_wechat_cache_subdir_is_cache():
    # 微信明确缓存子目录仍应判 cache（可安全清理）
    assert classify(r"C:\Users\Me\Documents\WeChat Files\wxid_abc\FileStorage\Cache\a.dat",
                    1000, ".dat") == "cache"
    assert classify(r"C:\Users\Me\Documents\WeChat Files\wxid_abc\FileStorage\Temp\tmp_1",
                    1000, ".tmp") == "cache"


def test_wechat4_xwechat_data_is_app_data():
    # 微信 4.0 新目录结构
    assert classify(r"C:\Users\Me\Documents\WeChat Files\xwechat_files\wxid_abc\Msg\msg.db",
                    1000, ".db") == "app_data"


def test_qq_data_dir_is_app_data():
    assert classify(r"C:\Users\Me\Documents\Tencent Files\QQ123\Msg\msg_data.db",
                    1000, ".db") == "app_data"


def test_qq_cache_subdir_is_cache():
    assert classify(r"C:\Users\Me\Documents\Tencent Files\QQ123\Cache\a.dat",
                    1000, ".dat") == "cache"


def test_unknown_fallback():
    # 未识别文件不再伪装成“用户文档”
    assert classify(r"D:\misc\weird.xyz", 1000, ".xyz") == "unknown"
    assert classify(r"D:\misc\noext", 1000, "") == "unknown"


def test_unrelated_path_not_misclassified_by_keyword():
    # 路径里含 nvidia/lark 字样但不属于这些软件目录的，不应误判
    assert classify(r"D:\Downloads\nvidia-driver-setup.exe", 500, ".exe") != "system"
    assert classify(r"D:\Projects\lark-tools\readme.md", 512, ".md") == "docs"