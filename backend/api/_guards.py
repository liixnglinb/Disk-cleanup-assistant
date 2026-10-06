"""API 层共用守卫：把数据库层的失败翻译成界面能懂的 HTTP 语义。

扫描库是 WAL，读通常不阻塞，但扫描写入占锁或库损坏时，sqlite 异常会一路
逃逸成未处理 500 —— 界面只能显示"请求失败 500"，用户不知道该等一会还是重启。
"""
import sqlite3
from typing import Any, Callable

from fastapi import HTTPException

from ..core.scanner import ScanDbError


def guard_db(fn: Callable[..., Any], *args, **kwargs) -> Any:
    try:
        return fn(*args, **kwargs)
    except ScanDbError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=503,
            detail="扫描数据库暂时不可读（可能正在写入或已损坏），请稍后重试",
        ) from exc
