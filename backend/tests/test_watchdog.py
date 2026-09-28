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


def test_exited_process_kept_alive_by_handle_is_gone():
    """进程已退出、但内核对象仍被句柄引用时必须判死（_alive 最关键的语义）。

    Windows 上进程退出后，只要还有句柄引用它的内核对象，PID 就不会释放，
    OpenProcess 仍会成功——此时只能靠 GetExitCodeProcess 返回的退出码
    （0 ≠ STILL_ACTIVE）区分死活，不能"OpenProcess 成功就算活着"。
    这里刻意 p.wait() 后不释放 p._handle、不退出 with 块，就是为了构造并
    保持"OpenProcess 成功 + GetExitCodeProcess 拿到非 STILL_ACTIVE"的状态。
    """
    import subprocess
    import sys

    with subprocess.Popen([sys.executable, "-c", "pass"]) as proc:
        proc.wait()
        assert parent_gone(proc.pid) is True
