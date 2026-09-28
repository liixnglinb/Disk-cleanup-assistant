"""父进程看门狗：主进程被强杀时后端必须自行退出，否则会留下孤儿进程。"""
import os

from backend.core.watchdog import parent_gone, start_parent_watchdog


def test_own_pid_is_alive():
    assert parent_gone(os.getpid()) is False


def test_missing_pid_is_gone():
    # 用一个几乎不可能存在的 pid；若真被占用则跳过，避免偶发失败
    pid = 999999
    try:
        os.kill(pid, 0)
    except OSError:
        assert parent_gone(pid) is True
    else:  # pragma: no cover
        import pytest
        pytest.skip("pid 999999 意外存在")


def test_zero_means_no_watchdog():
    assert parent_gone(0) is False


def test_watchdog_thread_starts_daemon():
    start_parent_watchdog(os.getpid(), interval=0.1)
    import threading
    assert any(t.daemon and t.name == "dca-parent-watchdog" for t in threading.enumerate())
