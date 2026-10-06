"""用户级密钥存储：Windows DPAPI（CryptProtectData），不引任何第三方依赖。

桌面单用户工具的大模型 API Key 之前是明文 JSON 落在 %APPDATA%，任何以同一个
Windows 用户身份运行的进程都能直接读走，也会被"全盘备份/网盘同步"顺手带走。
DPAPI 把密文绑定到当前用户：换机器、换用户都解不开 —— 这正是我们要的边界
（需求就是"只有这台机器上的这个用户能用"），而且它是系统自带能力。

DPAPI 不可用（非 Windows、crypt32 加载失败）时退回明文，并用
api_key_unsealed 如实标记，绝不假装已加密。
"""
import base64
import ctypes
import ctypes.wintypes as wt
from typing import Optional, Tuple

_PREFIX = "dpapi:"
_DESC = "disk-cleanup-assistant"
_UI_FORBIDDEN = 0x1  # 后台进程弹授权框会把服务直接卡死

_err: Optional[str] = None


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


class _Api:
    """一次装载、全程复用。

    WinDLL 实例必须由模块自己长期持有引用：每次调用现造再丢弃，实例被 GC 之后
    动态句柄跟着失效，调用会静默失败 —— 实测表现为 seal() 返回成功但产物是空的，
    界面变成"从没配过 Key"。
    """

    __slots__ = ("crypt32", "kernel32")

    def __init__(self) -> None:
        self.crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
        self.kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self.crypt32.CryptProtectData.argtypes = [
            ctypes.POINTER(_DataBlob), wt.LPCWSTR, ctypes.POINTER(_DataBlob),
            ctypes.c_void_p, ctypes.c_void_p, wt.DWORD, ctypes.POINTER(_DataBlob),
        ]
        self.crypt32.CryptProtectData.restype = wt.BOOL
        self.crypt32.CryptUnprotectData.argtypes = [
            ctypes.POINTER(_DataBlob), ctypes.POINTER(wt.LPWSTR), ctypes.POINTER(_DataBlob),
            ctypes.c_void_p, ctypes.c_void_p, wt.DWORD, ctypes.POINTER(_DataBlob),
        ]
        self.crypt32.CryptUnprotectData.restype = wt.BOOL
        self.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        self.kernel32.LocalFree.restype = ctypes.c_void_p


_api: Optional[_Api] = None


def _api_or_none() -> Optional[_Api]:
    global _api, _err
    if _api is not None or _err is not None:
        return _api
    try:
        _api = _Api()
        return _api
    except Exception as exc:  # noqa: BLE001 非 Windows / 加载失败
        _err = str(exc)
        return None


def _blob(data: bytes) -> Tuple[ctypes.Array, _DataBlob]:
    """返回 (缓冲区, 描述符)，两者必须一起活到调用结束。

    ctypes 只在调用期间持有 create_string_buffer 的引用；只把描述符带出去，
    缓冲区就可能在此之前被回收，产出一段内容不定的"密文"。
    """
    buf = ctypes.create_string_buffer(data, len(data))
    return buf, _DataBlob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_byte)))


def _take(api: "_Api", out: _DataBlob) -> bytes:
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        api.kernel32.LocalFree(ctypes.cast(out.pbData, ctypes.c_void_p))


def available() -> bool:
    return _api_or_none() is not None


def seal(plaintext: str) -> str:
    """封装成可落盘的字符串；不可用或失败时原样返回，调用方用 is_sealed 判断。"""
    if not plaintext:
        return plaintext
    api = _api_or_none()
    if api is None:
        return plaintext
    buf, inp = _blob(plaintext.encode("utf-8"))
    out = _DataBlob()
    ok = api.crypt32.CryptProtectData(
        ctypes.byref(inp), _DESC, None, None, None, _UI_FORBIDDEN, ctypes.byref(out),
    )
    del buf
    if not ok:
        return plaintext
    return _PREFIX + base64.b64encode(_take(api, out)).decode("ascii")


def open_sealed(value: str) -> str:
    """解开 seal() 的结果；不是 DPAPI 密文（历史明文）就原样返回。"""
    if not value or not isinstance(value, str) or not value.startswith(_PREFIX):
        return value
    api = _api_or_none()
    if api is None:
        return ""
    try:
        raw = base64.b64decode(value[len(_PREFIX):])
    except (ValueError, TypeError):
        return ""
    buf, inp = _blob(raw)
    out = _DataBlob()
    ok = api.crypt32.CryptUnprotectData(
        ctypes.byref(inp), None, None, None, None, _UI_FORBIDDEN, ctypes.byref(out),
    )
    del buf
    if not ok:
        return ""
    return _take(api, out).decode("utf-8", "replace")


def is_sealed(value) -> bool:
    return isinstance(value, str) and value.startswith(_PREFIX)
