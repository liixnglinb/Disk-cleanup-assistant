"""父进程存活看门狗。

Windows 下主进程被强杀（任务管理器结束进程 / 崩溃）时，Electron 的
will-quit 不会执行，后端 exe 会变成孤儿进程继续占端口与内存（实测见过
一个 1.1GB 的孤儿 disk_cleanup_backend.exe）。这里由子进程自己定期检查
父进程是否还在，不在就退出——这是唯一能覆盖"父进程被强杀"的手段。

判活取向：**宁可漏检，不可误杀**。读不到结论时一律按存活处理——误杀的
后果（父进程还活着时后端自杀，而 electron/main.js 没有任何后端重启逻辑，
用户只能重启应用）远大于漏检的后果（多留一个孤儿进程，下次启动时还有
杀树逻辑兜底）。
"""
import os
import threading
import time

_WATCHDOG_NAME = "dca-parent-watchdog"

_kernel32 = None


def _get_kernel32():
    """惰性加载 kernel32 并一次性设妥签名（use_last_error 才能在失败后取 GetLastError）。"""
    global _kernel32
    if _kernel32 is None:
        import ctypes
        from ctypes import wintypes

        lib = ctypes.WinDLL("kernel32", use_last_error=True)
        lib.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        lib.OpenProcess.restype = wintypes.HANDLE
        lib.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        lib.GetExitCodeProcess.restype = wintypes.BOOL
        # 不设 argtypes 时句柄按 C int 传，句柄值 >2**31 会被截断 → 关闭失败 →
        # 句柄泄漏（本机句柄是小整数、实质风险≈0，但属经典坑，一并补上）。
        lib.CloseHandle.argtypes = [wintypes.HANDLE]
        lib.CloseHandle.restype = wintypes.BOOL
        _kernel32 = lib
    return _kernel32


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
    ERROR_INVALID_PARAMETER = 87  # 唯一明确表示"该 PID 不存在"的错误码

    kernel32 = _get_kernel32()

    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        # 保守判活：只有 ERROR_INVALID_PARAMETER（PID 无效）才敢判死。
        # ERROR_ACCESS_DENIED(5) 与其它一切错误码都可能发生在父进程仍存活时
        # （提权进程、瞬时资源紧张），一律视为存活——误杀代价（应用静默失去
        # 后端，无自动重启）> 漏检代价（多留一个孤儿进程）。
        return ctypes.get_last_error() != ERROR_INVALID_PARAMETER
    try:
        code = wintypes.DWORD()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            # 拿到了句柄却读不到退出码属不确定故障，同样保守判活，避免误杀。
            return True
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
            try:
                if parent_gone(parent_pid):
                    os._exit(0)
            except Exception:
                # 单次检查失败绝不能终结守护线程：线程一旦静默死掉就永久失去
                # 保护，且打包版 stdio 是 "ignore"，连日志都留不下。吞掉异常，
                # 下一轮继续检查；真正的退出只由上面的 os._exit 负责。
                pass

    threading.Thread(target=loop, name=_WATCHDOG_NAME, daemon=True).start()
