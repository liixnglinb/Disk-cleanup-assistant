"""父进程存活看门狗。

Windows 下主进程被强杀（任务管理器结束进程 / 崩溃）时，Electron 的
will-quit 不会执行，后端 exe 会变成孤儿进程继续占端口与内存（实测见过
一个 1.1GB 的孤儿 disk_cleanup_backend.exe）。这里由子进程自己定期检查
父进程是否还在，不在就退出——这是唯一能覆盖"父进程被强杀"的手段。
"""
import os
import threading
import time

_WATCHDOG_NAME = "dca-parent-watchdog"


def _alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    import ctypes
    from ctypes import wintypes

    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    STILL_ACTIVE = 259
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel32.GetExitCodeProcess.restype = wintypes.BOOL

    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return False
    try:
        code = wintypes.DWORD()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            return False
        return code.value == STILL_ACTIVE
    finally:
        kernel32.CloseHandle(handle)


def parent_gone(parent_pid: int) -> bool:
    """父进程已退出或不存在 → True；parent_pid<=0 表示不启用看门狗，恒 False。"""
    if parent_pid <= 0:
        return False
    return not _alive(parent_pid)


def start_parent_watchdog(parent_pid: int, interval: float = 3.0) -> None:
    """启动守护线程：父进程消失即 os._exit(0)（不走 atexit，避免卡住关闭流程）。"""
    if parent_pid <= 0:
        return

    def loop() -> None:
        while True:
            time.sleep(interval)
            if parent_gone(parent_pid):
                os._exit(0)

    threading.Thread(target=loop, name=_WATCHDOG_NAME, daemon=True).start()
